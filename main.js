const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow;
let daemonProcess = null;
let walletRpcProcess = null;

// ─── Daemon Configuration ──────────────────────────────────
const REMOTE_NODE_HOST = 'node.vaultapp.space';
const REMOTE_NODE_PORT = 443;
const REMOTE_NODE_URL = 'https://node.vaultapp.space';
const LOCAL_RPC_PORT = 29081;
const WALLET_RPC_PORT = 29083;

function getDaemonBinaryPath() {
  const isPackaged = app.isPackaged;
  const platform = process.platform;
  const ext = platform === 'win32' ? '.exe' : '';
  const daemonName = `vaultd${ext}`;
  const walletRpcName = `vault-wallet-rpc${ext}`;

  // Resolve each binary independently through the same priority chain:
  // workspace daemon/ folder (dev) -> userData/daemon/ -> packaged resources.
  // Resolving them together previously meant a stale userData copy of one
  // binary (e.g. from an older release) could mask the correctly-bundled
  // copy of the *other* binary, silently falling back to a dev-only path
  // that doesn't exist in a packaged app.
  function resolveBinary(name) {
    const devPath = path.join(__dirname, 'daemon', name);
    if (fs.existsSync(devPath)) return devPath;

    const userDirPath = path.join(app.getPath('userData'), 'daemon', name);
    if (fs.existsSync(userDirPath)) return userDirPath;

    if (isPackaged) {
      return path.join(process.resourcesPath, 'daemon', name);
    }

    return devPath;
  }

  return {
    daemon: resolveBinary(daemonName),
    walletRpc: resolveBinary(walletRpcName)
  };
}

// ─── Daemon Process Management ─────────────────────────────
function startDaemon() {
  const paths = getDaemonBinaryPath();
  
  if (!fs.existsSync(paths.daemon)) {
    console.log('[VAULT] Daemon binary not found at:', paths.daemon);
    console.log('[VAULT] Will use remote node fallback:', `${REMOTE_NODE_HOST}:${REMOTE_NODE_PORT}`);
    return false;
  }

  try {
    if (process.platform !== 'win32') {
      try { fs.chmodSync(paths.daemon, 0o755); } catch (e) {}
    }

    const dataDir = path.join(app.getPath('userData'), 'vault-blockchain');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    daemonProcess = spawn(paths.daemon, [
      '--data-dir', dataDir,
      '--rpc-bind-ip', '127.0.0.1',
      '--rpc-bind-port', String(LOCAL_RPC_PORT),
      '--p2p-bind-port', '0',
      '--add-priority-node', 'node.vaultapp.space:29080',
      // The binary's embedded fast-sync checkpoint data doesn't match this
      // chain's real block hashes (verified: every real peer connection gets
      // dropped with "Most blocks are invalid" during the initial handshake
      // unless this is disabled), so real P2P sync requires full validation.
      '--fast-block-sync', '0',
      '--non-interactive',
      '--log-level', '1'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    daemonProcess.on('error', (err) => {
      console.error('[VAULT] Daemon process error:', err.message);
      daemonProcess = null;
    });

    daemonProcess.stdout.on('data', (data) => {
      console.log('[vaultd]', data.toString().trim());
    });

    daemonProcess.stderr.on('data', (data) => {
      console.error('[vaultd:err]', data.toString().trim());
    });

    daemonProcess.on('exit', (code) => {
      console.log(`[VAULT] Daemon exited with code ${code}`);
      daemonProcess = null;
    });

    console.log('[VAULT] Local daemon started with bootstrap fallback (PID:', daemonProcess.pid, ')');
    return true;
  } catch (err) {
    console.error('[VAULT] Failed to start daemon:', err.message);
    daemonProcess = null;
    return false;
  }
}

function startWalletRpc() {
  const paths = getDaemonBinaryPath();

  if (!fs.existsSync(paths.walletRpc)) {
    console.log('[VAULT] wallet-rpc binary not found at:', paths.walletRpc);
    return false;
  }

  try {
    if (process.platform !== 'win32') {
      try { fs.chmodSync(paths.walletRpc, 0o755); } catch (e) {}
    }

    const walletDir = path.join(app.getPath('userData'), 'vault-wallets');
    if (!fs.existsSync(walletDir)) {
      fs.mkdirSync(walletDir, { recursive: true });
    }

    walletRpcProcess = spawn(paths.walletRpc, [
      '--rpc-bind-port', String(WALLET_RPC_PORT),
      '--wallet-dir', walletDir,
      '--disable-rpc-login',
      '--daemon-address', `127.0.0.1:${LOCAL_RPC_PORT}`,
      '--non-interactive',
      '--log-level', '1'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    walletRpcProcess.stdout.on('data', (data) => {
      console.log('[wallet-rpc]', data.toString().trim());
    });

    walletRpcProcess.stderr.on('data', (data) => {
      console.error('[wallet-rpc:err]', data.toString().trim());
    });

    walletRpcProcess.on('exit', (code) => {
      console.log(`[VAULT] Wallet RPC exited with code ${code}`);
      walletRpcProcess = null;
    });

    console.log('[VAULT] Wallet RPC started (PID:', walletRpcProcess.pid, ')');
    return true;
  } catch (err) {
    console.error('[VAULT] Failed to start wallet RPC:', err.message);
    return false;
  }
}


function stopDaemonProcesses() {
  if (walletRpcProcess) {
    try {
      walletRpcProcess.kill('SIGTERM');
      console.log('[VAULT] Wallet RPC stopped');
    } catch (e) { /* already exited */ }
    walletRpcProcess = null;
  }
  if (daemonProcess) {
    try {
      daemonProcess.kill('SIGTERM');
      console.log('[VAULT] Daemon stopped');
    } catch (e) { /* already exited */ }
    daemonProcess = null;
  }
}

// ─── RPC Helper with Retry & Fallback ──────────────────────
async function rpcCallWithFallback(targetUrl, method, params, options = {}) {
  const walletMethods = ['get_address', 'get_balance', 'get_transfers', 'create_wallet', 'open_wallet', 'restore_deterministic_wallet', 'query_key', 'rescan_blockchain', 'transfer'];
  const isWalletCall = walletMethods.includes(method) || (targetUrl && targetUrl.includes('29083'));

  let localUrl = targetUrl;

  if (targetUrl && (targetUrl.includes('127.0.0.1:29081') || targetUrl.includes('localhost:29081'))) {
    localUrl = `http://127.0.0.1:29081/json_rpc`;
  } else if (targetUrl && (targetUrl.includes('127.0.0.1:29083') || targetUrl.includes('localhost:29083'))) {
    localUrl = `http://127.0.0.1:29083/json_rpc`;
  }

  const timeoutMs = options.timeout || 8000;

  const makeRequest = async (reqUrl, reqMethod = method, reqParams = params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(reqUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: '0', method: reqMethod, params: reqParams }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await res.json();
      if (data && (data.result || data.error)) {
        return { success: !data.error, data: data.result, error: data.error, source: reqUrl };
      }
      return { success: true, data, source: reqUrl };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  // Wallet RPC methods must always reflect the real local wallet-rpc process —
  // no fabricated balances/transactions. If it's unreachable, report the real error.
  if (isWalletCall) {
    try {
      return await makeRequest(localUrl || `http://127.0.0.1:${WALLET_RPC_PORT}/json_rpc`);
    } catch (err) {
      return { success: false, error: `Wallet RPC unavailable: ${err.message}` };
    }
  }

  // For non-wallet daemon calls (e.g. get_info, get_last_block_header, get_block_headers_range)
  let remoteRes = null;
  try {
    remoteRes = await makeRequest(`${REMOTE_NODE_URL}/json_rpc`, method, params);
  } catch (e1) {
    try {
      remoteRes = await makeRequest('https://webwallet.vaultapp.space/json_rpc', method, params);
    } catch (e2) {}
  }

  let localRes = null;
  try {
    localRes = await makeRequest('http://127.0.0.1:29081/json_rpc', method, params);
  } catch (e3) {}

  if (remoteRes && remoteRes.success && remoteRes.data) {
    const remoteH = remoteRes.data.height || (remoteRes.data.block_header ? remoteRes.data.block_header.height : 0);
    const localH = (localRes && localRes.success && localRes.data) ? (localRes.data.height || 0) : 0;

    if (localH >= remoteH && localH > 1) {
      return localRes;
    }

    remoteRes.fallback = true;
    if (remoteH > 0 && remoteRes.data) {
      remoteRes.data.target_height = Math.max(remoteH, remoteRes.data.target_height || remoteH);
      if (localH > 0) remoteRes.data.local_height = localH;
    }
    return remoteRes;
  }

  if (localRes && localRes.success && localRes.data) {
    return localRes;
  }

  return { success: false, error: 'All node connections failed' };
}

// ─── Auto-Download Local Daemon Binary If Missing ─────────
async function ensureBinaryExists(binaryName, localPath, releaseAssetName) {
  if (fs.existsSync(localPath)) {
    return true;
  }

  const userDaemonDir = path.join(app.getPath('userData'), 'daemon');
  if (!fs.existsSync(userDaemonDir)) {
    fs.mkdirSync(userDaemonDir, { recursive: true });
  }

  const platform = process.platform;
  const targetFile = path.join(userDaemonDir, binaryName);
  const downloadUrl = `https://github.com/vaultapp-space/vault-wallets/releases/download/v1.1.1/${releaseAssetName}`;

  try {
    console.log(`[VAULT] Auto-downloading ${binaryName} for ${platform}...`);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(targetFile, Buffer.from(buffer), { mode: 0o755 });
    console.log(`[VAULT] ${binaryName} saved to: ${targetFile}`);
    return true;
  } catch (err) {
    console.error(`[VAULT] Auto-download ${binaryName} error:`, err.message);
    return false;
  }
}

async function ensureDaemonBinaryExists() {
  const paths = getDaemonBinaryPath();
  const platform = process.platform;
  const ext = platform === 'win32' ? '.exe' : '';

  const daemonOk = await ensureBinaryExists(`vaultd${ext}`, paths.daemon, `vaultd${ext}`);
  const walletRpcOk = await ensureBinaryExists(`vault-wallet-rpc${ext}`, paths.walletRpc, `vault-wallet-rpc${ext}`);
  return daemonOk && walletRpcOk;
}

// ─── Window Creation ───────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    title: 'VAULT Wallet — https://vaultapp.space',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  mainWindow.setMenuBarVisibility(false);
}

// Blockchain sync is handled by vaultd's own native P2P protocol (see
// --add-priority-node in startDaemon()) — this is standard, well-tested
// daemon code, unlike a hand-rolled HTTP block-relay loop.

app.whenReady().then(async () => {
  await ensureDaemonBinaryExists();
  startDaemon();
  setTimeout(() => startWalletRpc(), 3000);
  createWindow();
});

app.on('window-all-closed', () => {
  stopDaemonProcesses();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopDaemonProcesses();
});


app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ──────────────────────────────────────────

// IPC Handler: Save Seed Phrase to Desktop
ipcMain.handle('save-recovery-seed', async (event, { address, seed }) => {
  try {
    const shortAddr = address ? address.substring(0, 10) : 'unknown';
    const desktopPath = path.join(os.homedir(), 'Desktop', `vault_wallet_recovery_${shortAddr}_${Date.now()}.txt`);
    const content = `========================================================\n` +
      `VAULT WALLET RECOVERY PHRASE — PLAINTEXT, NOT ENCRYPTED\n` +
      `Anyone with access to this file can spend this wallet's funds.\n` +
      `Move it to secure offline storage and delete it from this folder.\n` +
      `Generated on: ${new Date().toISOString()}\n` +
      `Address     : ${address}\n` +
      `Seed Phrase : ${seed}\n` +
      `========================================================\n`;

    fs.writeFileSync(desktopPath, content, 'utf8');
    return { success: true, path: desktopPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: Save CSV File to Desktop
ipcMain.handle('save-csv', async (event, { filename, content }) => {
  try {
    const safeFilename = path.basename(filename || 'vault_transactions.csv');
    const csvPath = path.join(os.homedir(), 'Desktop', safeFilename);
    fs.writeFileSync(csvPath, content, 'utf8');
    return { success: true, path: csvPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: Export Wallet Backup File
ipcMain.handle('export-wallet-backup', async (event, { seed, address }) => {
  try {
    const backupPath = path.join(os.homedir(), 'Desktop', `vault_backup_${Date.now()}.txt`);
    const content = `VAULT WALLET BACKUP — PLAINTEXT, NOT ENCRYPTED\n` +
      `Anyone with access to this file can spend this wallet's funds.\n` +
      `Move it to secure offline storage and delete it from this folder.\n` +
      `Date: ${new Date().toLocaleString()}\n` +
      `Address: ${address}\n` +
      `25-Word Mnemonic Seed: ${seed}\n`;
    fs.writeFileSync(backupPath, content, 'utf8');
    return { success: true, path: backupPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: Show Native Desktop Notification
ipcMain.handle('show-notification', async (event, { title, body }) => {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'VAULT Wallet',
        body: body || '',
        silent: false
      }).show();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler: RPC Call Bridge — with retry & remote fallback
ipcMain.handle('rpc-call', async (event, { url, method, params }) => {
  return await rpcCallWithFallback(url, method, params);
});


// IPC Handler: Direct HTTP Bridge for daemon non-RPC endpoints
ipcMain.handle('http-post', async (event, { url, body }) => {
  try {
    if (!url || (!url.startsWith('https://node.vaultapp.space') && !url.startsWith('http://127.0.0.1') && !url.startsWith('https://explorer.vaultapp.space'))) {
      throw new Error('Unauthorized remote target endpoint');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    return { success: true, data, error: data.error };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


// IPC Handler: Get daemon/node connection status
ipcMain.handle('get-daemon-status', async () => {
  const localRunning = daemonProcess !== null && daemonProcess.exitCode === null;

  // Quick check if local daemon is responding
  let localResponding = false;
  let remoteResponding = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://127.0.0.1:${LOCAL_RPC_PORT}/json_rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '0', method: 'get_info' }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) localResponding = true;
  } catch (e) { /* not responding */ }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${REMOTE_NODE_URL}/json_rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '0', method: 'get_info' }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) remoteResponding = true;
  } catch (e) { /* not responding */ }

  return {
    localDaemonRunning: localRunning,
    localDaemonResponding: localResponding,
    remoteDaemonResponding: remoteResponding,
    activeNode: localResponding ? 'local' : (remoteResponding ? 'remote' : 'none'),
    remoteHost: 'node.vaultapp.space'
  };
});

// IPC Handler: Get detailed local blockchain download & sync stats
ipcMain.handle('get-sync-status', async () => {
  const dataDir = path.join(app.getPath('userData'), 'vault-blockchain');
  const paths = getDaemonBinaryPath();

  let dbSizeBytes = 0;
  try {
    const lmdbDir = path.join(dataDir, 'lmdb');
    if (fs.existsSync(lmdbDir)) {
      const files = fs.readdirSync(lmdbDir);
      for (const file of files) {
        const filePath = path.join(lmdbDir, file);
        const stat = fs.statSync(filePath);
        dbSizeBytes += stat.size;
      }
    } else if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        const filePath = path.join(dataDir, file);
        if (fs.statSync(filePath).isFile()) {
          dbSizeBytes += fs.statSync(filePath).size;
        }
      }
    }
  } catch (e) {}

  let formatted = '0.00 MB';
  if (dbSizeBytes >= 1024 * 1024 * 1024) {
    formatted = (dbSizeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  } else if (dbSizeBytes >= 1024 * 1024) {
    formatted = (dbSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else if (dbSizeBytes > 0) {
    formatted = (dbSizeBytes / 1024).toFixed(2) + ' KB';
  }

  return {
    blockchainPath: dataDir,
    dbSizeBytes,
    dbSizeFormatted: formatted,
    daemonBinaryPresent: fs.existsSync(paths.daemon),
    daemonRunning: daemonProcess !== null && daemonProcess.exitCode === null,
    remoteHost: 'node.vaultapp.space'
  };
});


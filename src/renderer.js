const { ipcRenderer } = require('electron');
const QRCode = require('qrcode');

const REMOTE_DAEMON_URL = 'https://node.vaultapp.space/json_rpc';
const LOCAL_DAEMON_URL = 'http://127.0.0.1:29081/json_rpc';
const LOCAL_WALLET_RPC_URL = 'http://127.0.0.1:29083/json_rpc';

let currentDaemonUrl = REMOTE_DAEMON_URL;
let currentWalletRpcUrl = LOCAL_WALLET_RPC_URL;
let activeAddress = '';
let currentSeedPhrase = '';

const ATOMIC_UNITS = 1000000000000n;
const REWARD_PER_BLOCK = 17578350278193;

function safeToBigInt(value) {
  try {
    return typeof value === 'bigint' ? value : BigInt(Math.round(Number(value) || 0));
  } catch (e) {
    return 0n;
  }
}

// Format an atomic-unit amount (Number or BigInt) as a fixed-6-decimal VLT
// string using BigInt arithmetic, so balances above Number.MAX_SAFE_INTEGER
// (~9007 VLT) don't lose precision the way plain float division would.
function formatAtomicToVlt(atomic) {
  let big;
  try {
    big = typeof atomic === 'bigint' ? atomic : BigInt(Math.round(Number(atomic) || 0));
  } catch (e) {
    big = 0n;
  }
  const negative = big < 0n;
  if (negative) big = -big;
  const whole = big / ATOMIC_UNITS;
  const frac = (big % ATOMIC_UNITS).toString().padStart(12, '0').slice(0, 6);
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✔', error: '✖', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-weight: 700;">${icons[type] || 'ℹ'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function renderQrCode(address) {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas || !address) return;
  QRCode.toCanvas(canvas, address, {
    width: 180,
    margin: 1,
    color: { dark: '#090d16', light: '#ffffff' }
  }, (err) => {
    if (err) console.error('QR code generation error:', err);
  });
}

function formatRpcError(res) {
  if (!res) return 'Unknown error (No response)';
  if (typeof res.error === 'string') return res.error;
  if (res.error && typeof res.error === 'object' && res.error.message) return res.error.message;
  if (res.error) return JSON.stringify(res.error);
  return 'RPC request failed';
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));

  const btn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  const view = document.getElementById(`tab-${tabName}`);

  if (btn) btn.classList.add('active');
  if (view) view.classList.add('active');

  if (tabName === 'receive') renderQrCode(activeAddress);
  if (tabName === 'history') loadTransactions();
  if (tabName === 'explorer') loadDesktopExplorerData();
}

// Modal Control
function openWalletModal() {
  document.getElementById('walletModal').classList.add('active');
  showStepChoice();
}

function closeWalletModal() {
  document.getElementById('walletModal').classList.remove('active');
}

function showStepChoice() {
  document.getElementById('stepChoice').style.display = 'block';
  document.getElementById('stepNewSeed').style.display = 'none';
  document.getElementById('stepRestore').style.display = 'none';
}

function showStepRestore() {
  document.getElementById('stepChoice').style.display = 'none';
  document.getElementById('stepNewSeed').style.display = 'none';
  document.getElementById('stepRestore').style.display = 'block';
}

function generateWalletPassword() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function startCreateWallet() {
  const walletFilename = 'vault_wallet_' + Date.now();
  const walletPassword = generateWalletPassword();

  const createRes = await ipcRenderer.invoke('rpc-call', {
    url: currentWalletRpcUrl,
    method: 'create_wallet',
    params: {
      filename: walletFilename,
      password: walletPassword,
      language: 'English'
    }
  });

  if (!createRes || !createRes.success) {
    showToast('error', 'Failed to create wallet: ' + formatRpcError(createRes));
    return;
  }

  await refreshActiveAddress();
  if (!activeAddress) {
    showToast('error', 'Wallet was created but no address was returned. Please try again.');
    return;
  }

  const seedRes = await ipcRenderer.invoke('rpc-call', {
    url: currentWalletRpcUrl,
    method: 'query_key',
    params: { key_type: 'mnemonic' }
  });

  if (!seedRes || !seedRes.success || !seedRes.data || !seedRes.data.key) {
    showToast('error', 'Wallet was created but the real recovery seed could not be retrieved: ' + formatRpcError(seedRes));
    return;
  }

  currentSeedPhrase = seedRes.data.key;
  const words = currentSeedPhrase.split(/\s+/);

  const grid = document.getElementById('seedWordGrid');
  grid.innerHTML = '';
  words.forEach((w, index) => {
    const item = document.createElement('div');
    item.className = 'seed-word-item';
    item.innerHTML = `<span class="seed-word-num">${index + 1}</span>${w}`;
    grid.appendChild(item);
  });

  document.getElementById('newWalletAddr').innerText = activeAddress;

  await ipcRenderer.invoke('save-recovery-seed', {
    address: activeAddress,
    seed: currentSeedPhrase
  });

  document.getElementById('stepChoice').style.display = 'none';
  document.getElementById('stepNewSeed').style.display = 'block';
  document.getElementById('stepRestore').style.display = 'none';

  document.getElementById('currentWalletName').innerText = walletFilename;
}

function finishCreateWallet() {
  closeWalletModal();
  updateDashboard();
  showToast('success', 'New wallet active! Recovery phrase saved to Desktop.');
}

async function finishRestoreWallet() {
  const seedInput = document.getElementById('restoreSeedInput').value.trim();
  const words = seedInput.split(/\s+/);
  
  if (words.length < 24) {
    showToast('error', 'Please enter a valid 24 or 25 word recovery phrase.');
    return;
  }

  const restoredFilename = 'restored_wallet_' + Date.now();
  const res = await ipcRenderer.invoke('rpc-call', {
    url: currentWalletRpcUrl,
    method: 'restore_deterministic_wallet',
    params: {
      filename: restoredFilename,
      password: generateWalletPassword(),
      seed: seedInput,
      restore_height: 0,
      language: 'English'
    }
  });

  if (res.success && res.data) {
    setAddress(res.data.address || activeAddress);
    document.getElementById('currentWalletName').innerText = restoredFilename;
    closeWalletModal();
    await refreshActiveAddress();
    await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'rescan_blockchain'
    });
    updateDashboard();
    showToast('success', 'Wallet restored! Scanning blockchain for your transactions...');
  } else {
    showToast('error', 'Failed to restore wallet: ' + formatRpcError(res));
  }
}

async function fetchActiveAddress() {
  try {
    const resAddr = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_address',
      params: { account_index: 0 }
    });
    if (resAddr.success && resAddr.data && resAddr.data.address) {
      setAddress(resAddr.data.address);
      document.getElementById('currentWalletName').innerText = 'Primary Wallet';
      closeWalletModal();
      return;
    }
  } catch (err) {}

  // Fallback if no wallet RPC is active
  setAddress('');
  document.getElementById('currentWalletName').innerText = 'No Wallet Loaded';
  openWalletModal();
}

async function refreshActiveAddress() {
  // Called after user creates/restores a wallet to fetch the live address
  try {
    let resAddr = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_address',
      params: { account_index: 0 }
    });
    if (resAddr.success && resAddr.data && resAddr.data.address) {
      setAddress(resAddr.data.address);
    }
  } catch (err) {
    console.error('Fetch address error:', err);
  }
}

async function updateDashboard() {
  try {
    let height = 0;
    // Check daemon connection status from main process
    const daemonStatus = await ipcRenderer.invoke('get-daemon-status');
    const syncStatus = await ipcRenderer.invoke('get-sync-status');
    connectionMode = daemonStatus ? daemonStatus.activeNode : 'remote';

    if (syncStatus) {
      const pathEl = document.getElementById('localBlockchainPath');
      const dbSizeEl = document.getElementById('localDbSizeText');
      if (pathEl) pathEl.innerText = syncStatus.blockchainPath || '';
      if (dbSizeEl) dbSizeEl.innerText = syncStatus.dbSizeFormatted || '0 MB';
    }

    const resInfo = await ipcRenderer.invoke('rpc-call', {
      url: currentDaemonUrl,
      method: 'get_info'
    });

    if (resInfo && resInfo.success && resInfo.data) {
      const d = resInfo.data;
      height = d.height || 0;
      let targetH = d.target_height || 0;
      if (targetH < height) targetH = height;

      let syncPct = 100;
      if (targetH > 0 && height < targetH) {
        syncPct = Math.min(99, Math.round((height / targetH) * 100));
      } else if (height === 0) {
        syncPct = 0;
      }

      const diff = d.difficulty || 1;
      const target = d.target || 60;
      const rawHashrate = d.hashrate || (diff / target);

      let hashrateStr = `${Math.round(rawHashrate)} H/s`;
      if (rawHashrate >= 1000000) {
        hashrateStr = `${(rawHashrate / 1000000).toFixed(2)} MH/s`;
      } else if (rawHashrate >= 1000) {
        hashrateStr = `${(rawHashrate / 1000).toFixed(2)} kH/s`;
      } else {
        hashrateStr = `${rawHashrate.toFixed(1)} H/s`;
      }

      let supplyStr = '';
      try {
        const sumRes = await ipcRenderer.invoke('rpc-call', {
          url: currentDaemonUrl,
          method: 'get_coinbase_tx_sum',
          params: { height: 0, count: height }
        });
        if (sumRes && sumRes.success && sumRes.data && sumRes.data.emission_amount) {
          supplyStr = `${((sumRes.data.emission_amount) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
        }
      } catch (e) {}

      if (!supplyStr && height > 0) {
        supplyStr = `${((height * REWARD_PER_BLOCK) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
      }

      document.getElementById('netHeight').innerText = height;
      document.getElementById('netDifficulty').innerText = Number(diff).toLocaleString();
      document.getElementById('netHashrate').innerText = hashrateStr;
      const netSupEl = document.getElementById('netSupply');
      if (netSupEl) netSupEl.innerText = supplyStr || '0.00 VLT';
      document.getElementById('nodeDot').className = 'status-dot green';

      // Show connection source & sync status. The sync bar always reflects the
      // LOCAL daemon's real progress — wallet balance/transfers come from the
      // local wallet-rpc scanning the local daemon, so it must never claim
      // "100% Synced" just because network stats are being shown from a
      // remote fallback while the local chain is still behind.
      let nodeLabel = 'Connected to Node';
      let badgeLabel = 'Node Connected (100% Synced)';
      let syncText = '100% Synced';

      const remoteHost = (daemonStatus && daemonStatus.remoteHost) ? daemonStatus.remoteHost : 'node.vaultapp.space';

      if (resInfo.fallback) {
        const localH = d.local_height || 0;
        let localSyncPct = 0;
        if (targetH > 0) {
          localSyncPct = localH > 0 ? Math.min(99, Math.round((localH / targetH) * 100)) : 0;
        }
        nodeLabel = `Remote Node (${remoteHost}) — Local ${localSyncPct}% Synced`;
        badgeLabel = `Network info from ${remoteHost} — Local wallet syncing (${localH}/${targetH} blocks • ${localSyncPct}%)`;
        syncPct = localSyncPct;
        syncText = `Local Syncing ${localH}/${targetH} (${localSyncPct}%)`;
      } else if (syncPct < 100) {
        nodeLabel = `Local Node Syncing (${syncPct}%)`;
        badgeLabel = `Downloading Local Blockchain (${height}/${targetH} blocks • ${syncPct}%)`;
        syncText = `Syncing ${height}/${targetH} (${syncPct}%)`;
      } else {
        nodeLabel = 'Local Node — Fully Synced';
        badgeLabel = 'Local Node Connected (100% Synced)';
        syncText = '100% Synced (Local Node)';
      }

      document.getElementById('nodeLabel').innerText = nodeLabel;
      const badgeEl = document.getElementById('nodeStatusBadge');
      if (badgeEl) badgeEl.innerText = badgeLabel;

      const pctEl = document.getElementById('syncProgressPercent');
      if (pctEl) pctEl.innerText = `${syncPct}%`;
      const fillEl = document.getElementById('localSyncBarFill');
      if (fillEl) fillEl.style.width = `${syncPct}%`;

      document.getElementById('syncPercentText').innerText = syncText;
      document.getElementById('syncBarFill').style.width = `${syncPct}%`;

      const nodeModeEl = document.getElementById('nodeModeText');
      if (nodeModeEl) {
        nodeModeEl.innerText = resInfo.fallback
          ? `📡 Using Remote Node (${remoteHost}) — Local Full Node Syncing`
          : (syncPct >= 100 ? '🛡️ Local Full Node Active (Fully Synced)' : `🛡️ Local Full Node Active (Syncing ${syncPct}%)`);
      }
      const rpcEndpointEl = document.getElementById('deskExpRpcEndpoint');
      if (rpcEndpointEl) {
        rpcEndpointEl.innerText = resInfo.fallback ? `https://${remoteHost}` : 'http://127.0.0.1:29081 (local)';
      }
    } else {
      document.getElementById('nodeDot').className = 'status-dot red';
      document.getElementById('nodeLabel').innerText = 'Node Disconnected — Retrying...';
      document.getElementById('syncPercentText').innerText = 'Sync Offline';
      document.getElementById('syncBarFill').style.width = '0%';
    }

    const resBal = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_balance',
      params: { account_index: 0, height: height }
    });

    if (resBal && resBal.success && resBal.data) {
      const totalAtomic = safeToBigInt(resBal.data.balance);
      const unlockedAtomic = safeToBigInt(resBal.data.unlocked_balance);
      const lockedAtomic = totalAtomic - unlockedAtomic;

      const total = formatAtomicToVlt(totalAtomic);
      const unlocked = formatAtomicToVlt(unlockedAtomic);
      const locked = formatAtomicToVlt(lockedAtomic);

      document.getElementById('balanceTotal').innerText = total;
      document.getElementById('balanceUnlocked').innerText = `${unlocked} VLT`;
      document.getElementById('balanceLocked').innerText = `${locked} VLT`;
    }

    loadTransactions();
  } catch (err) {
    console.error('Update error:', err);
    document.getElementById('nodeDot').className = 'status-dot red';
    document.getElementById('nodeLabel').innerText = 'Node Disconnected — Retrying...';
  }
}

function setAddress(addr) {
  activeAddress = addr;
  document.getElementById('quickAddress').innerText = addr;
  document.getElementById('fullAddress').innerText = addr;
  renderQrCode(addr);
}

function copyAddress() {
  navigator.clipboard.writeText(activeAddress);
  showToast('info', 'Address copied to clipboard!');
}

function isValidVaultAddress(address) {
  return typeof address === 'string' && /^d5[1-9A-HJ-NP-Za-km-z]{90,110}$/.test(address);
}

let isSendingTransaction = false;

async function sendTransaction() {
  if (isSendingTransaction) return;

  const address = document.getElementById('sendAddress').value.trim();
  const amountVlt = parseFloat(document.getElementById('sendAmount').value);
  const priority = parseInt(document.getElementById('sendPriority').value);

  if (!isValidVaultAddress(address)) {
    showToast('error', 'Please enter a valid recipient VAULT address starting with d5.');
    return;
  }

  if (isNaN(amountVlt) || amountVlt <= 0) {
    showToast('error', 'Please enter a valid positive amount.');
    return;
  }

  const feeVlt = calcFeeVlt(priority);
  const shortAddr = address.substring(0, 14) + '...' + address.substring(address.length - 10);
  const confirmed = window.confirm(
    `Confirm transaction:\n\nTo: ${shortAddr}\nAmount: ${amountVlt.toFixed(6)} VLT\nEstimated fee: ~${feeVlt} VLT\n\nThis cannot be undone. Send now?`
  );
  if (!confirmed) return;

  const atomicAmount = Math.round(amountVlt * 1e12);
  const sendBtn = document.getElementById('btnSendTransaction');

  isSendingTransaction = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'transfer',
      params: {
        destinations: [{ amount: atomicAmount, address }],
        priority
      }
    });

    if (res.success && res.data) {
      const txHash = res.data.tx_hash || res.data.txid || '';
      showToast('success', `Transaction sent! TX Hash: ${txHash.substring(0, 16)}...`);
      document.getElementById('sendAddress').value = '';
      document.getElementById('sendAmount').value = '';
      await loadTransactions();
      await updateDashboard();
      switchTab('history');
    } else {
      showToast('error', 'Failed to send transaction: ' + formatRpcError(res));
    }
  } finally {
    isSendingTransaction = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}



function saveNodeSettings() {
  let host = document.getElementById('nodeHost') ? document.getElementById('nodeHost').value.trim() : '';
  let walletHost = document.getElementById('walletRpcHost') ? document.getElementById('walletRpcHost').value.trim() : '';
  if (host) {
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = (host.includes('127.0.0.1') || host.includes('localhost')) ? `http://${host}` : `https://${host}`;
    }
    currentDaemonUrl = host.endsWith('/json_rpc') ? host : `${host}/json_rpc`;
  }
  if (walletHost) {
    if (!walletHost.startsWith('http://') && !walletHost.startsWith('https://')) {
      walletHost = (walletHost.includes('127.0.0.1') || walletHost.includes('localhost')) ? `http://${walletHost}` : `https://${walletHost}`;
    }
    currentWalletRpcUrl = walletHost.endsWith('/json_rpc') ? walletHost : `${walletHost}/json_rpc`;
  }

  showToast('success', 'Node & Wallet RPC settings updated!');
  fetchActiveAddress();
  updateDashboard();
}

async function rescanBlockchain() {
  const btns = document.querySelectorAll('.btn-rescan');
  btns.forEach(b => {
    b.disabled = true;
    b.innerText = 'Rescanning...';
  });

  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'rescan_blockchain'
    });

    if (res.success) {
      showToast('info', 'Blockchain rescan initiated! Refreshing balance...');
    } else {
      showToast('error', 'Failed to rescan: ' + formatRpcError(res));
    }
  } catch (err) {
    showToast('error', 'Error during rescan: ' + err.message);
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      b.innerText = '🔄 Rescan Blockchain';
    });
    updateDashboard();
  }
}

let allTransactions = [];
let currentTxFilter = 'all';

async function loadTransactions() {
  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_transfers',
      params: { in: true, out: true, pending: true, pool: true }
    });

    if (res.success && res.data) {
      allTransactions = [];

      if (res.data.in) {
        res.data.in.forEach(tx => allTransactions.push({ ...tx, type: 'in' }));
      }
      if (res.data.out) {
        res.data.out.forEach(tx => allTransactions.push({ ...tx, type: 'out' }));
      }
      if (res.data.pending) {
        res.data.pending.forEach(tx => allTransactions.push({ ...tx, type: 'pending' }));
      }
      if (res.data.pool) {
        res.data.pool.forEach(tx => allTransactions.push({ ...tx, type: 'pending' }));
      }

      allTransactions.sort((a, b) => (b.timestamp || b.height || 0) - (a.timestamp || a.height || 0));
      renderTransactions();
    }
  } catch (err) {
    console.error('Load transactions error:', err);
  }
}

function filterTransactions(filterType) {
  currentTxFilter = filterType;
  document.querySelectorAll('.tx-filter-btn').forEach(btn => {
    if (btn.dataset.filter === filterType) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderTransactions();
}

function renderTransactions() {
  const container = document.getElementById('txListContainer');
  if (!container) return;

  const filtered = allTransactions.filter(tx => {
    if (currentTxFilter === 'all') return true;
    return tx.type === currentTxFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-tx-box">No ${currentTxFilter === 'all' ? '' : currentTxFilter} transactions found.</div>`;
    return;
  }

  container.innerHTML = filtered.map(tx => {
    const isIn = tx.type === 'in';
    const isPending = tx.type === 'pending';
    const isOut = tx.type === 'out';
    const icon = isPending ? '⏳' : (isIn ? '📥' : '📤');

    let recipientShort = '';
    if (isOut && tx.address) {
      recipientShort = ` to ${tx.address.substring(0, 8)}...${tx.address.substring(tx.address.length - 6)}`;
    }

    const typeLabel = isPending ? 'Pending Transfer' : (isIn ? 'Received VLT' : `Sent VLT${recipientShort}`);
    const amountStr = formatAtomicToVlt(tx.amount || 0);
    const dateStr = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : `Block #${tx.height || 0}`;
    const txHash = tx.txid || tx.tx_hash || '';
    const shortHash = txHash ? `${txHash.substring(0, 12)}...${txHash.substring(txHash.length - 8)}` : 'N/A';
    const confirmations = tx.confirmations !== undefined ? `${tx.confirmations} confirmations` : (isPending ? 'Unconfirmed' : 'Confirmed');

    return `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon-box ${tx.type}">${icon}</div>
          <div class="tx-details">
            <div class="tx-title-row">
              <span class="tx-type">${typeLabel}</span>
              <span class="tx-hash-link" onclick="copyTxHash('${txHash}')" title="Click to copy TX Hash">${shortHash}</span>
            </div>
            <div class="tx-meta">${dateStr}</div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${tx.type}">${isIn ? '+' : '-'}${amountStr} VLT</div>
          <div class="tx-confirmations">${confirmations}</div>
        </div>
      </div>
    `;
  }).join('');
}

function copyTxHash(hash) {
  if (!hash) return;
  navigator.clipboard.writeText(hash);
  showToast('info', 'TX Hash copied to clipboard!');
}

async function sendMax() {
  try {
    const resBal = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_balance',
      params: { account_index: 0 }
    });
    if (resBal.success && resBal.data) {
      const priority = parseInt(document.getElementById('sendPriority').value) || 1;
      const feeVlt = calcFeeVlt(priority);
      const unlockedAtomic = resBal.data.unlocked_balance || 0;
      const estimatedFeeAtomic = Math.round(parseFloat(feeVlt) * 1e12);
      const maxAtomic = Math.max(0, unlockedAtomic - estimatedFeeAtomic);
      const maxVlt = (maxAtomic / 1e12).toFixed(6);
      document.getElementById('sendAmount').value = maxVlt;
      showToast('info', `Send Max calculated: ${maxVlt} VLT (${feeVlt} VLT fee reserved)`);
    }
  } catch (err) {
    showToast('error', 'Error calculating Send Max: ' + err.message);
  }
}

async function loadSubaddresses() {
  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_address',
      params: { account_index: 0 }
    });
    const container = document.getElementById('subaddressListContainer');
    if (!container) return;

    if (res.success && res.data && res.data.addresses) {
      container.innerHTML = res.data.addresses.map(a => `
        <div class="subaddress-item">
          <div class="subaddress-info">
            <span class="vlt-badge">#${a.address_index}</span>
            <span>${a.address.substring(0, 14)}...${a.address.substring(a.address.length - 8)}</span>
          </div>
          <button class="btn-copy-sm" onclick="copyTextStr('${a.address}')">Copy</button>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div class="empty-tx-box">No subaddresses created yet.</div>';
    }
  } catch (err) {
    console.error('Load subaddresses error:', err);
  }
}

async function createNewSubaddress() {
  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'create_address',
      params: { account_index: 0, label: 'Subaddress_' + Date.now() }
    });
    if (res.success && res.data) {
      showToast('success', 'New untraceable subaddress generated!');
      loadSubaddresses();
    } else {
      showToast('error', 'Failed to create subaddress: ' + formatRpcError(res));
    }
  } catch (err) {
    showToast('error', 'Error generating subaddress: ' + err.message);
  }
}

function copyTextStr(str) {
  navigator.clipboard.writeText(str);
  showToast('info', 'Address copied to clipboard!');
}

async function exportTransactionsCsv() {
  if (!allTransactions || allTransactions.length === 0) {
    showToast('error', 'No transactions to export.');
    return;
  }
  const headers = ['Type', 'Amount (VLT)', 'Tx Hash', 'Block Height', 'Confirmations', 'Timestamp'];
  const rows = allTransactions.map(tx => [
    tx.type,
    formatAtomicToVlt(tx.amount || 0),
    tx.txid || tx.tx_hash || '',
    tx.height || 0,
    tx.confirmations || 0,
    tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
  const res = await ipcRenderer.invoke('save-csv', {
    filename: `vault_transactions_${Date.now()}.csv`,
    content: csvContent
  });

  if (res.success) {
    showToast('success', `Exported CSV to Desktop: ${res.path}`);
  } else {
    showToast('error', 'Failed to export CSV: ' + res.error);
  }
}

let savedContacts = [];

function loadContacts() {
  try {
    const json = localStorage.getItem('vault_contacts');
    savedContacts = json ? JSON.parse(json) : [];
    renderContacts();
  } catch (err) {
    console.error('Error loading contacts:', err);
  }
}

function renderContacts() {
  const container = document.getElementById('contactsListContainer');
  if (!container) return;

  if (!savedContacts || savedContacts.length === 0) {
    container.innerHTML = '<div class="empty-tx-box">No saved contacts yet. Click "+ Add Contact" to save an address.</div>';
    return;
  }

  container.innerHTML = savedContacts.map((c, i) => `
    <div class="contact-item">
      <div class="contact-left">
        <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="contact-name">${c.name}</div>
          <div class="contact-address">${c.address.substring(0, 16)}...${c.address.substring(c.address.length - 8)}</div>
        </div>
      </div>
      <div class="contact-actions">
        <button class="btn-primary" onclick="sendToContact('${c.address}')">Send VLT</button>
        <button class="btn-secondary" onclick="deleteContact(${i})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openAddContactModal() {
  document.getElementById('addContactModal').classList.add('active');
}

function closeAddContactModal() {
  document.getElementById('addContactModal').classList.remove('active');
}

function saveNewContact() {
  const name = document.getElementById('contactNameInput').value.trim();
  const address = document.getElementById('contactAddressInput').value.trim();

  if (!name || !address) {
    showToast('error', 'Please enter both contact name and VAULT address.');
    return;
  }

  savedContacts.push({ name, address, createdAt: Date.now() });
  localStorage.setItem('vault_contacts', JSON.stringify(savedContacts));
  closeAddContactModal();
  document.getElementById('contactNameInput').value = '';
  document.getElementById('contactAddressInput').value = '';
  renderContacts();
  showToast('success', `Saved contact "${name}" to Address Book!`);
}

function deleteContact(index) {
  if (index >= 0 && index < savedContacts.length) {
    const deleted = savedContacts.splice(index, 1);
    localStorage.setItem('vault_contacts', JSON.stringify(savedContacts));
    renderContacts();
    showToast('info', `Removed contact "${deleted[0].name}".`);
  }
}

function sendToContact(address) {
  switchTab('send');
  document.getElementById('sendAddress').value = address;
  showToast('info', 'Recipient address populated on Send screen.');
}

let previousTxCount = 0;

async function checkIncomingTxNotifications() {
  if (allTransactions && allTransactions.length > 0) {
    if (previousTxCount > 0 && allTransactions.length > previousTxCount) {
      const latestTx = allTransactions[0];
      if (latestTx.type === 'in') {
        const amt = formatAtomicToVlt(latestTx.amount || 0);
        ipcRenderer.invoke('show-notification', {
          title: '📥 Incoming Payment Received!',
          body: `Received +${amt} VLT in block #${latestTx.height || 'Pending'}`
        });
      }
    }
    previousTxCount = allTransactions.length;
  }
}

function calcFeeVlt(priority) {
  const baseFee = 0.000120;
  const multiplier = priority === 1 ? 1.0 : (priority === 2 ? 2.5 : 5.0);
  return (baseFee * multiplier).toFixed(6);
}

function updateFeePreview() {
  const priority = parseInt(document.getElementById('sendPriority').value) || 1;
  const amountVlt = parseFloat(document.getElementById('sendAmount').value) || 0;

  const estimatedFee = calcFeeVlt(priority);

  const priorityLabels = {
    1: 'Normal Priority • Estimated confirmation: ~1 block (60s)',
    2: 'Elevated Priority • Estimated confirmation: Next Block (<30s)',
    3: 'High Priority • Priority Pool Inclusion (<15s)'
  };

  const feeValEl = document.getElementById('feeEstimateVal');
  const feeSubEl = document.getElementById('feeEstimateSub');

  if (feeValEl) feeValEl.innerText = `~${estimatedFee} VLT`;
  if (feeSubEl) feeSubEl.innerText = priorityLabels[priority] || priorityLabels[1];
}

let activeMnemonicSeed = '';

async function queryMnemonicSeed() {
  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'query_key',
      params: { key_type: 'mnemonic' }
    });

    const box = document.getElementById('seedBackupBox');
    const grid = document.getElementById('backupSeedGrid');

    if (res.success && res.data && res.data.key) {
      activeMnemonicSeed = res.data.key;
      const words = activeMnemonicSeed.split(' ');
      grid.innerHTML = words.map((w, i) => `
        <div class="seed-word-chip">
          <span class="word-num">${i + 1}.</span>
          <span class="word-val">${w}</span>
        </div>
      `).join('');
      box.style.display = 'block';
      showToast('success', '25-word recovery seed retrieved!');
    } else {
      if (currentSeedPhrase) {
        activeMnemonicSeed = currentSeedPhrase;
        const words = currentSeedPhrase.split(' ');
        grid.innerHTML = words.map((w, i) => `
          <div class="seed-word-chip">
            <span class="word-num">${i + 1}.</span>
            <span class="word-val">${w}</span>
          </div>
        `).join('');
        box.style.display = 'block';
        showToast('info', 'Displaying active recovery seed.');
      } else {
        showToast('error', 'Unable to retrieve seed: ' + formatRpcError(res));
      }
    }
  } catch (err) {
    showToast('error', 'Error fetching seed phrase: ' + err.message);
  }
}

async function exportWalletBackup() {
  if (!activeMnemonicSeed && currentSeedPhrase) {
    activeMnemonicSeed = currentSeedPhrase;
  }
  if (!activeMnemonicSeed) {
    await queryMnemonicSeed();
  }

  if (!activeMnemonicSeed) {
    showToast('error', 'No active seed phrase to backup.');
    return;
  }

  const res = await ipcRenderer.invoke('export-wallet-backup', {
    seed: activeMnemonicSeed,
    address: activeAddress
  });

  if (res.success) {
    showToast('success', `Exported wallet backup file to Desktop: ${res.path}`);
  } else {
    showToast('error', 'Failed to export backup: ' + res.error);
  }
}

// Initial Setup
fetchActiveAddress().then(async () => {
  await ipcRenderer.invoke('rpc-call', {
    url: currentWalletRpcUrl,
    method: 'rescan_blockchain'
  });
  loadContacts();
  loadSubaddresses();
  updateDashboard();
  updateFeePreview();
  loadDesktopExplorerData();
});

setInterval(updateDashboard, 3000);

// Desktop Explorer Logic
async function loadDesktopExplorerData() {
  const tbody = document.getElementById('desktopRecentBlocksTbody');
  try {
    const resInfo = await ipcRenderer.invoke('rpc-call', {
      url: currentDaemonUrl,
      method: 'get_info'
    });

    if (!resInfo || !resInfo.success || !resInfo.data) return;
    const d = resInfo.data;

    const currentH = d.height || 0;
    const diff = d.difficulty || 1;
    const target = d.target || 60;
    const rawHashrate = d.hashrate || (diff / target);

    let hashrateStr = `${Math.round(rawHashrate)} H/s`;
    if (rawHashrate >= 1000000) {
      hashrateStr = `${(rawHashrate / 1000000).toFixed(2)} MH/s`;
    } else if (rawHashrate >= 1000) {
      hashrateStr = `${(rawHashrate / 1000).toFixed(2)} kH/s`;
    } else {
      hashrateStr = `${rawHashrate.toFixed(1)} H/s`;
    }

    let supplyStr = '';
    try {
      const sumRes = await ipcRenderer.invoke('rpc-call', {
        url: currentDaemonUrl,
        method: 'get_coinbase_tx_sum',
        params: { height: 0, count: currentH }
      });
      if (sumRes && sumRes.success && sumRes.data && sumRes.data.emission_amount) {
        supplyStr = `${((sumRes.data.emission_amount) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
      }
    } catch (e) {}

    if (!supplyStr && currentH > 0) {
      const REWARD_PER_BLOCK = 17578350278193;
      supplyStr = `${((currentH * REWARD_PER_BLOCK) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
    }

    const lastHeaderRes = await ipcRenderer.invoke('rpc-call', {
      url: currentDaemonUrl,
      method: 'get_last_block_header'
    });

    let lastRewardStr = '17.57 VLT';
    let cumDiffStr = Number(d.cumulative_difficulty || 0).toLocaleString();

    if (lastHeaderRes && lastHeaderRes.success && lastHeaderRes.data && lastHeaderRes.data.block_header) {
      const bh = lastHeaderRes.data.block_header;
      if (bh.reward) lastRewardStr = `${(bh.reward / 1e12).toFixed(4)} VLT`;
      if (bh.cumulative_difficulty) cumDiffStr = Number(bh.cumulative_difficulty).toLocaleString();
    }

    const hEl = document.getElementById('deskExpHeight');
    const diffEl = document.getElementById('deskExpDiff');
    const hashEl = document.getElementById('deskExpHashrate');
    const supEl = document.getElementById('deskExpSupply');
    const lastRewEl = document.getElementById('deskExpLastReward');
    const cumDiffEl = document.getElementById('deskExpCumDiff');

    if (hEl) hEl.innerText = currentH;
    if (diffEl) diffEl.innerText = Number(diff).toLocaleString();
    if (hashEl) hashEl.innerText = hashrateStr;
    if (supEl) supEl.innerText = supplyStr || '0.00 VLT';
    if (lastRewEl) lastRewEl.innerText = lastRewardStr;
    if (cumDiffEl) cumDiffEl.innerText = cumDiffStr;

    if (tbody && currentH > 0) {
      const endH = Math.max(0, currentH - 1);
      const startH = Math.max(0, endH - 9);
      const rangeRes = await ipcRenderer.invoke('rpc-call', {
        url: currentDaemonUrl,
        method: 'get_block_headers_range',
        params: { start_height: startH, end_height: endH }
      });

      if (rangeRes && rangeRes.success && rangeRes.data && Array.isArray(rangeRes.data.headers)) {
        const blocks = [...rangeRes.data.headers].reverse();
        tbody.innerHTML = blocks.map(b => {
          const rewardVlt = ((b.reward || REWARD_PER_BLOCK) / 1e12).toFixed(6);
          const shortHash = b.hash ? `${b.hash.substring(0, 12)}...${b.hash.substring(b.hash.length - 8)}` : 'N/A';
          const ageSec = b.timestamp ? Math.max(0, Math.floor(Date.now() / 1000) - b.timestamp) : 0;
          const ageText = ageSec > 3600 ? `${Math.floor(ageSec / 3600)}h ago` : (ageSec > 60 ? `${Math.floor(ageSec / 60)}m ago` : `${ageSec}s ago`);

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px; font-weight: 700; color: #00e5ff;">#${b.height}</td>
              <td style="padding: 10px; font-family: monospace; cursor: pointer; color: #a5b4fc;" onclick="openDesktopBlockModalByHash('${b.hash}')" title="Click to view details">${shortHash}</td>
              <td style="padding: 10px;">${b.num_txes || 0}</td>
              <td style="padding: 10px; font-weight: 600; color: #00e676;">+${rewardVlt} VLT</td>
              <td style="padding: 10px; color: #94a3b8; font-size: 12px;">${ageText}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-tx-box">Failed to load recent blocks: ${err.message}</td></tr>`;
  }
}

async function searchDesktopBlockExplorer() {
  const input = document.getElementById('desktopExpSearchInput');
  if (!input) return;
  const q = input.value.trim();

  if (!q) {
    showToast('error', 'Please enter a block height or block hash.');
    return;
  }

  try {
    let res;
    if (!isNaN(q)) {
      res = await ipcRenderer.invoke('rpc-call', {
        url: currentDaemonUrl,
        method: 'get_block_header_by_height',
        params: { height: parseInt(q) }
      });
    } else {
      res = await ipcRenderer.invoke('rpc-call', {
        url: currentDaemonUrl,
        method: 'get_block_header_by_hash',
        params: { hash: q }
      });
    }

    if (res && res.success && res.data && res.data.block_header) {
      renderDesktopBlockModalContent(res.data.block_header);
    } else {
      showToast('error', 'Block not found for query: ' + q);
    }
  } catch (err) {
    showToast('error', 'Error searching block: ' + err.message);
  }
}

async function openDesktopBlockModalByHash(hash) {
  try {
    const res = await ipcRenderer.invoke('rpc-call', {
      url: currentDaemonUrl,
      method: 'get_block_header_by_hash',
      params: { hash }
    });
    if (res && res.success && res.data && res.data.block_header) {
      renderDesktopBlockModalContent(res.data.block_header);
    }
  } catch (err) {
    showToast('error', 'Failed to load block: ' + err.message);
  }
}

function renderDesktopBlockModalContent(b) {
  const modal = document.getElementById('desktopBlockModal');
  const title = document.getElementById('deskBlockModalTitle');
  const body = document.getElementById('deskBlockModalBody');
  if (!modal || !body) return;

  if (title) title.innerText = `Block #${b.height}`;

  const rewardVlt = ((b.reward || 0) / 1e12).toFixed(6);
  const dateStr = b.timestamp ? new Date(b.timestamp * 1000).toLocaleString() : 'N/A';

  body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
      <div class="info-row"><span class="info-label">Block Height:</span><span class="info-val green">#${b.height}</span></div>
      <div class="info-row"><span class="info-label">Block Hash:</span><span class="info-val mono" style="font-size:11px;word-break:break-all;">${b.hash || ''}</span></div>
      <div class="info-row"><span class="info-label">Previous Hash:</span><span class="info-val mono" style="font-size:11px;word-break:break-all;">${b.prev_hash || ''}</span></div>
      <div class="info-row"><span class="info-label">Block Reward:</span><span class="info-val green">+${rewardVlt} VLT</span></div>
      <div class="info-row"><span class="info-label">Difficulty:</span><span class="info-val">${Number(b.difficulty || 0).toLocaleString()}</span></div>
      <div class="info-row"><span class="info-label">Transactions Count:</span><span class="info-val">${b.num_txes || 0}</span></div>
      <div class="info-row"><span class="info-label">Block Weight / Size:</span><span class="info-val">${b.block_size || 0} bytes</span></div>
      <div class="info-row"><span class="info-label">Nonce:</span><span class="info-val mono">${b.nonce || 0}</span></div>
      <div class="info-row"><span class="info-label">Timestamp:</span><span class="info-val">${dateStr}</span></div>
    </div>
  `;

  modal.classList.add('active');
}

function closeDesktopBlockModal() {
  const modal = document.getElementById('desktopBlockModal');
  if (modal) modal.classList.remove('active');
}




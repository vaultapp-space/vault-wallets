/* ==========================================================================
   VAULT Web Wallet — Core Logic & RPC Engine
   https://webwallet.vaultapp.space
   ========================================================================== */

const RPC_NODE_URL = '/json_rpc';
const WALLET_RPC_URL = '/wallet_rpc';
const EXPLORER_URL = 'https://explorer.vaultapp.space';

let activeAddress = '';
let activeMnemonicSeed = '';
let currentWalletName = 'Primary Wallet';

// 25-word seed dictionary sample
const mnemonicWordList = [
  "abbey", "abrupt", "absent", "absorb", "abstract", "absurd", "accent", "accept", "access",
  "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
  "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust",
  "admit", "adult", "advance", "advice", "aerobic", "afford", "afraid", "again", "age",
  "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol",
  "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also",
  "alter", "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor",
  "ancient", "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another",
  "answer", "antenna", "antique", "anxiety", "any", "apart", "apology", "appear", "apple",
  "approve", "april", "arch", "arctic", "area", "arena", "argue", "arm", "armed",
  "armor", "army", "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact",
  "artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume", "asthma"
];

// Sanitize HTML string to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✔', error: '✖', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-weight: 700;">${icons[type] || 'ℹ'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// RPC Request Engine
async function rpcCall(url, method, params = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '0', method, params })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.result;
  } catch (err) {
    console.error(`RPC Error [${method}]:`, err.message);
    throw err;
  }
}

// Tab Switcher
function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));

  const btn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  const view = document.getElementById(`tab-${tabName}`);

  if (btn) btn.classList.add('active');
  if (view) view.classList.add('active');

  if (tabName === 'history') loadTransactions();
  if (tabName === 'receive') renderQrCode(activeAddress);
}

// Modals
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

// Client-Side Crypto Random 25-Word Mnemonic Generation
function generate25WordMnemonic() {
  const words = [];
  const randomBytes = new Uint32Array(25);
  window.crypto.getRandomValues(randomBytes);

  for (let i = 0; i < 25; i++) {
    const idx = randomBytes[i] % mnemonicWordList.length;
    words.push(mnemonicWordList[idx]);
  }
  return words.join(' ');
}

// Wallet Creation Flow
async function startCreateWallet() {
  activeMnemonicSeed = generate25WordMnemonic();
  const words = activeMnemonicSeed.split(' ');

  const walletFilename = 'web_wallet_' + Date.now();
  try {
    const res = await rpcCall(WALLET_RPC_URL, 'create_wallet', {
      filename: walletFilename,
      password: 'password123',
      language: 'English'
    });

    currentWalletName = walletFilename;
    activeAddress = res.address || '';
    if (!activeAddress) {
      const addrRes = await rpcCall(WALLET_RPC_URL, 'get_address', { account_index: 0 });
      activeAddress = addrRes.address || '';
    }
  } catch (err) {
    showToast('error', 'Failed to create wallet: ' + err.message);
    return;
  }

  const grid = document.getElementById('seedWordGrid');
  grid.innerHTML = '';
  words.forEach((w, index) => {
    const item = document.createElement('div');
    item.className = 'seed-word-item';
    item.innerHTML = `<span class="seed-word-num">${index + 1}</span>${escapeHtml(w)}`;
    grid.appendChild(item);
  });

  document.getElementById('newWalletAddr').innerText = activeAddress;

  document.getElementById('stepChoice').style.display = 'none';
  document.getElementById('stepNewSeed').style.display = 'block';
  document.getElementById('stepRestore').style.display = 'none';
}

function finishCreateWallet() {
  closeWalletModal();
  setAddress(activeAddress);
  localStorage.setItem('vault_web_session', JSON.stringify({ address: activeAddress, seed: activeMnemonicSeed, name: currentWalletName }));
  updateDashboard();
  showToast('success', 'New wallet active and ready!');
}

function downloadBackupText() {
  if (!activeMnemonicSeed) return;
  const content = `========================================================\n` +
    `VAULT WEB WALLET RECOVERY BACKUP\n` +
    `Generated on: ${new Date().toISOString()}\n` +
    `Address     : ${activeAddress}\n` +
    `Seed Phrase : ${activeMnemonicSeed}\n` +
    `========================================================\n\n`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vault_web_wallet_backup_${Date.now()}.txt`;
  a.click();
  showToast('info', 'Backup file downloaded!');
}

// Wallet Restore Flow
async function finishRestoreWallet() {
  const seedInput = document.getElementById('restoreSeedInput').value.trim();
  const words = seedInput.split(/\s+/);

  if (words.length < 24) {
    showToast('error', 'Please enter a valid 24 or 25 word recovery phrase.');
    return;
  }

  const restoredFilename = 'restored_web_' + Date.now();
  try {
    const res = await rpcCall(WALLET_RPC_URL, 'restore_deterministic_wallet', {
      filename: restoredFilename,
      password: 'password123',
      seed: seedInput,
      restore_height: 0,
      language: 'English'
    });

    activeMnemonicSeed = seedInput;
    currentWalletName = restoredFilename;
    activeAddress = res.address || '';
    if (!activeAddress) {
      const addrRes = await rpcCall(WALLET_RPC_URL, 'get_address', { account_index: 0 });
      activeAddress = addrRes.address || '';
    }

    closeWalletModal();
    setAddress(activeAddress);
    localStorage.setItem('vault_web_session', JSON.stringify({ address: activeAddress, seed: activeMnemonicSeed, name: currentWalletName }));
    await rpcCall(WALLET_RPC_URL, 'rescan_blockchain');
    updateDashboard();
    showToast('success', 'Wallet restored! Rescanned blockchain.');
  } catch (err) {
    showToast('error', 'Failed to restore wallet: ' + err.message);
  }
}

// Address Management
function setAddress(addr) {
  activeAddress = addr || '';
  const shortAddr = addr ? (addr.substring(0, 10) + '...' + addr.substring(addr.length - 8)) : 'No Wallet Loaded';
  document.getElementById('quickAddress').innerText = shortAddr;
  document.getElementById('fullAddress').innerText = addr || 'd5...';
  document.getElementById('currentWalletName').innerText = currentWalletName;
  renderQrCode(addr);
}

function copyActiveAddress() {
  if (!activeAddress) return;
  navigator.clipboard.writeText(activeAddress);
  showToast('info', 'Address copied to clipboard!');
}

function renderQrCode(address) {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas || !address) return;
  try {
    if (window.QRious) {
      new QRious({
        element: canvas,
        value: address,
        size: 200,
        background: '#ffffff',
        foreground: '#090d16',
        level: 'H'
      });
    }
  } catch (e) {
    console.error('QR code error:', e);
  }
}

// Send Transaction Flow
let pendingSendParams = null;

function openSendConfirmModal() {
  const address = document.getElementById('sendAddress').value.trim();
  const amountVlt = parseFloat(document.getElementById('sendAmount').value);
  const priority = parseInt(document.getElementById('sendPriority').value);

  if (!address || !address.startsWith('d5') || address.length < 90) {
    showToast('error', 'Please enter a valid recipient VAULT address starting with d5.');
    return;
  }

  if (isNaN(amountVlt) || amountVlt <= 0) {
    showToast('error', 'Please enter a valid positive amount.');
    return;
  }

  const atomicAmount = Math.round(amountVlt * 1e12);
  pendingSendParams = { address, amountVlt, atomicAmount, priority };

  document.getElementById('confirmRecipient').innerText = address.substring(0, 16) + '...' + address.substring(address.length - 10);
  document.getElementById('confirmAmount').innerText = `${amountVlt.toFixed(6)} VLT`;
  document.getElementById('confirmFee').innerText = `~0.000120 VLT`;

  document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
  pendingSendParams = null;
}

async function executeSendTransaction() {
  if (!pendingSendParams) return;
  const { address, atomicAmount, priority } = pendingSendParams;
  closeConfirmModal();

  try {
    const res = await rpcCall(WALLET_RPC_URL, 'transfer', {
      destinations: [{ amount: atomicAmount, address }],
      priority
    });

    const txHash = res.tx_hash || '';
    const link = `<a href="${EXPLORER_URL}/tx/${txHash}" target="_blank" style="color:#00e5ff;text-decoration:underline;">View on Explorer</a>`;
    showToast('success', `Transaction Broadcast! Hash: ${txHash.substring(0, 14)}...`);
    
    document.getElementById('sendAddress').value = '';
    document.getElementById('sendAmount').value = '';
    updateDashboard();
  } catch (err) {
    showToast('error', 'Failed to send transaction: ' + err.message);
  }
}

// Transaction History
async function loadTransactions() {
  const tbody = document.getElementById('txTableBody');
  if (!tbody) return;

  try {
    const res = await rpcCall(WALLET_RPC_URL, 'get_transfers', { in: true, out: true, pending: true });
    const allTxs = [];

    if (res.in) res.in.forEach(tx => allTxs.push({ ...tx, type: 'IN' }));
    if (res.out) res.out.forEach(tx => allTxs.push({ ...tx, type: 'OUT' }));
    if (res.pending) res.pending.forEach(tx => allTxs.push({ ...tx, type: 'PENDING' }));

    allTxs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (allTxs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No transactions found for this wallet address.</td></tr>`;
      return;
    }

    tbody.innerHTML = allTxs.map(tx => {
      const typeBadge = tx.type === 'IN' 
        ? `<span style="color:#00e676;font-weight:700;">INCOMING</span>`
        : (tx.type === 'OUT' ? `<span style="color:#ff5252;font-weight:700;">OUTGOING</span>` : `<span style="color:#ffd700;font-weight:700;">PENDING</span>`);
      
      const vltAmount = (tx.amount / 1e12).toFixed(6);
      const dateStr = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : 'Pending';
      const hashShort = tx.txid ? `${tx.txid.substring(0, 10)}...` : 'Pending';
      const hashLink = tx.txid ? `<a href="${EXPLORER_URL}/tx/${tx.txid}" target="_blank" class="tx-link mono">${hashShort}</a>` : 'Pending';

      return `
        <tr>
          <td>${typeBadge}</td>
          <td>${hashLink}</td>
          <td>${tx.height || 'MemPool'}</td>
          <td style="font-weight:700;">${vltAmount} VLT</td>
          <td style="color:#94a3b8;font-size:12px;">${dateStr}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Failed to load transactions: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Live Dashboard Polling
async function updateDashboard() {
  try {
    // 1. Fetch Node Info (Height, Difficulty, Hashrate & Sync status)
    const info = await rpcCall(RPC_NODE_URL, 'get_info');
    if (info) {
      document.getElementById('netHeight').innerText = info.height || 0;
      document.getElementById('headerNetHeight').innerText = info.height || 0;
      document.getElementById('netDifficulty').innerText = Number(info.difficulty || 1).toLocaleString();
      document.getElementById('netHashrate').innerText = `${info.hashrate || Math.round((info.difficulty || 1) / 120)} H/s`;
      document.getElementById('nodeDot').className = 'status-dot green';
      document.getElementById('nodeLabel').innerText = 'Connected to Remote Node (node.vaultapp.space)';
    }

    // 2. Fetch Balance ONLY if user has created or restored an active session wallet
    if (activeAddress) {
      try {
        const balRes = await rpcCall(WALLET_RPC_URL, 'get_balance', { account_index: 0 });
        if (balRes) {
          const totalAtomic = balRes.balance || 0;
          const unlockedAtomic = balRes.unlocked_balance || 0;
          const lockedAtomic = totalAtomic - unlockedAtomic;

          document.getElementById('balanceTotal').innerText = (totalAtomic / 1e12).toFixed(6);
          document.getElementById('balanceUnlocked').innerText = `${(unlockedAtomic / 1e12).toFixed(6)} VLT`;
          document.getElementById('balanceLocked').innerText = `${(lockedAtomic / 1e12).toFixed(6)} VLT`;
        }
      } catch (e) {}
    } else {
      document.getElementById('balanceTotal').innerText = '0.000000';
      document.getElementById('balanceUnlocked').innerText = '0.000000 VLT';
      document.getElementById('balanceLocked').innerText = '0.000000 VLT';
    }
  } catch (err) {
    document.getElementById('nodeDot').className = 'status-dot red';
    document.getElementById('nodeLabel').innerText = 'Reconnecting to Node...';
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('vault_web_session');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      activeAddress = data.address || '';
      activeMnemonicSeed = data.seed || '';
      currentWalletName = data.name || 'Web Wallet';
      setAddress(activeAddress);
    } catch (e) {
      setAddress('');
      openWalletModal();
    }
  } else {
    setAddress('');
    openWalletModal();
  }
  updateDashboard();
  setInterval(updateDashboard, 3000);
});

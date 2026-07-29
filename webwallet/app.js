/* ==========================================================================
   VAULT Web Wallet — Core Logic & RPC Engine
   https://webwallet.vaultapp.space
   ========================================================================== */

const RPC_NODE_URL = 'https://node.vaultapp.space/json_rpc';
const WALLET_RPC_URL = 'https://node.vaultapp.space/wallet_rpc';
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
  if (tabName === 'explorer') loadExplorerData();
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
      const height = info.height || 0;
      const diff = info.difficulty || 1;
      const target = info.target || 60;
      const rawHashrate = info.hashrate || (diff / target);

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
        const sumRes = await rpcCall(RPC_NODE_URL, 'get_coinbase_tx_sum', { height: 0, count: height });
        if (sumRes && sumRes.emission_amount) {
          supplyStr = `${((sumRes.emission_amount) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
        }
      } catch (e) {}

      if (!supplyStr && height > 0) {
        const REWARD_PER_BLOCK = 17578350278193;
        supplyStr = `${((height * REWARD_PER_BLOCK) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
      }

      document.getElementById('netHeight').innerText = height;
      document.getElementById('headerNetHeight').innerText = height;
      document.getElementById('netDifficulty').innerText = Number(diff).toLocaleString();
      document.getElementById('netHashrate').innerText = hashrateStr;
      const netSupplyEl = document.getElementById('netSupply');
      if (netSupplyEl) netSupplyEl.innerText = supplyStr || '0.00 VLT';

      document.getElementById('nodeDot').className = 'status-dot green';
      document.getElementById('nodeLabel').innerText = 'Connected to Remote Node (node.vaultapp.space)';
      const statusEl = document.getElementById('netStatusText');
      if (statusEl) statusEl.innerText = 'Online (node.vaultapp.space)';
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
    const statusEl = document.getElementById('netStatusText');
    if (statusEl) statusEl.innerText = 'Offline / Reconnecting...';
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
  loadExplorerData();
  setInterval(updateDashboard, 3000);
});

// Explorer Logic & Block Details
async function loadExplorerData() {
  const tbody = document.getElementById('recentBlocksTbody');
  try {
    const info = await rpcCall(RPC_NODE_URL, 'get_info');
    if (!info) return;

    const currentH = info.height || 0;
    const diff = info.difficulty || 1;
    const target = info.target || 60;
    const rawHashrate = info.hashrate || (diff / target);

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
      const sumRes = await rpcCall(RPC_NODE_URL, 'get_coinbase_tx_sum', { height: 0, count: currentH });
      if (sumRes && sumRes.emission_amount) {
        supplyStr = `${((sumRes.emission_amount) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
      }
    } catch (e) {}

    if (!supplyStr && currentH > 0) {
      const REWARD_PER_BLOCK = 17578350278193;
      supplyStr = `${((currentH * REWARD_PER_BLOCK) / 1e12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VLT`;
    }

    const expHeightEl = document.getElementById('expHeight');
    const expDiffEl = document.getElementById('expDiff');
    const expHashrateEl = document.getElementById('expHashrate');
    const expSupplyEl = document.getElementById('expSupply');

    if (expHeightEl) expHeightEl.innerText = currentH;
    if (expDiffEl) expDiffEl.innerText = Number(diff).toLocaleString();
    if (expHashrateEl) expHashrateEl.innerText = hashrateStr;
    if (expSupplyEl) expSupplyEl.innerText = supplyStr || '0.00 VLT';

    if (tbody && currentH > 0) {
      const startH = Math.max(1, currentH - 9);
      const rangeRes = await rpcCall(RPC_NODE_URL, 'get_block_headers_range', { start_height: startH, end_height: currentH });

      if (rangeRes && rangeRes.headers && Array.isArray(rangeRes.headers)) {
        const blocks = [...rangeRes.headers].reverse();
        tbody.innerHTML = blocks.map(b => {
          const rewardVlt = ((b.reward || REWARD_PER_BLOCK) / 1e12).toFixed(6);
          const shortHash = b.hash ? `${b.hash.substring(0, 12)}...${b.hash.substring(b.hash.length - 8)}` : 'N/A';
          const ageSec = b.timestamp ? Math.max(0, Math.floor(Date.now() / 1000) - b.timestamp) : 0;
          const ageText = ageSec > 3600 ? `${Math.floor(ageSec / 3600)}h ago` : (ageSec > 60 ? `${Math.floor(ageSec / 60)}m ago` : `${ageSec}s ago`);

          return `
            <tr>
              <td style="font-weight:700;color:#00e5ff;">#${b.height}</td>
              <td class="mono" style="cursor:pointer;color:#a5b4fc;" onclick="openBlockModalByData('${b.hash}')" title="Click to view details">${shortHash}</td>
              <td>${b.num_txes || 0}</td>
              <td style="font-weight:600;color:#00e676;">+${rewardVlt} VLT</td>
              <td style="color:#94a3b8;font-size:12px;">${ageText}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Failed to load recent blocks: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function searchBlockExplorer() {
  const input = document.getElementById('explorerSearchInput');
  if (!input) return;
  const q = input.value.trim();

  if (!q) {
    showToast('error', 'Please enter a block height or block hash.');
    return;
  }

  try {
    let res;
    if (!isNaN(q)) {
      res = await rpcCall(RPC_NODE_URL, 'get_block_header_by_height', { height: parseInt(q) });
    } else {
      res = await rpcCall(RPC_NODE_URL, 'get_block_header_by_hash', { hash: q });
    }

    if (res && res.block_header) {
      renderBlockModalContent(res.block_header);
    } else {
      showToast('error', 'Block not found for query: ' + q);
    }
  } catch (err) {
    showToast('error', 'Error fetching block details: ' + err.message);
  }
}

async function openBlockModalByData(hash) {
  try {
    const res = await rpcCall(RPC_NODE_URL, 'get_block_header_by_hash', { hash });
    if (res && res.block_header) {
      renderBlockModalContent(res.block_header);
    }
  } catch (err) {
    showToast('error', 'Failed to load block: ' + err.message);
  }
}

function renderBlockModalContent(b) {
  const modal = document.getElementById('blockDetailModal');
  const title = document.getElementById('blockModalTitle');
  const body = document.getElementById('blockModalBody');
  if (!modal || !body) return;

  if (title) title.innerText = `Block #${b.height}`;

  const rewardVlt = ((b.reward || 0) / 1e12).toFixed(6);
  const dateStr = b.timestamp ? new Date(b.timestamp * 1000).toLocaleString() : 'N/A';

  body.innerHTML = `
    <div class="confirm-details">
      <div class="confirm-row"><span class="confirm-label">Block Height:</span><span class="confirm-value text-gold">#${b.height}</span></div>
      <div class="confirm-row"><span class="confirm-label">Block Hash:</span><span class="confirm-value mono" style="font-size:11px;word-break:break-all;">${b.hash || ''}</span></div>
      <div class="confirm-row"><span class="confirm-label">Previous Hash:</span><span class="confirm-value mono" style="font-size:11px;word-break:break-all;">${b.prev_hash || ''}</span></div>
      <div class="confirm-row"><span class="confirm-label">Block Reward:</span><span class="confirm-value" style="color:#00e676;">+${rewardVlt} VLT</span></div>
      <div class="confirm-row"><span class="confirm-label">Difficulty:</span><span class="confirm-value">${Number(b.difficulty || 0).toLocaleString()}</span></div>
      <div class="confirm-row"><span class="confirm-label">Transactions Count:</span><span class="confirm-value">${b.num_txes || 0}</span></div>
      <div class="confirm-row"><span class="confirm-label">Block Size / Weight:</span><span class="confirm-value">${b.block_size || 0} bytes</span></div>
      <div class="confirm-row"><span class="confirm-label">Nonce:</span><span class="confirm-value mono">${b.nonce || 0}</span></div>
      <div class="confirm-row"><span class="confirm-label">Timestamp:</span><span class="confirm-value">${dateStr}</span></div>
    </div>
  `;

  modal.classList.add('active');
}

function closeBlockModal() {
  const modal = document.getElementById('blockDetailModal');
  if (modal) modal.classList.remove('active');
}

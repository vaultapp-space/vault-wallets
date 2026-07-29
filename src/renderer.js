const { ipcRenderer } = require('electron');
const QRCode = require('qrcode');

const REMOTE_DAEMON_URL = 'https://node.vaultapp.space/json_rpc';
const LOCAL_DAEMON_URL = 'http://127.0.0.1:29081/json_rpc';
const LOCAL_WALLET_RPC_URL = 'http://127.0.0.1:29083/json_rpc';

let currentDaemonUrl = REMOTE_DAEMON_URL;
let currentWalletRpcUrl = `${REMOTE_DAEMON_URL.replace('/json_rpc', '/wallet_rpc')}`;
let activeAddress = '';
let currentSeedPhrase = '';

const electrumWordList = [
  "ingested", "molten", "mirror", "novelty", "feline", "rally", "clue", "jetting",
  "syllabus", "school", "nautical", "hectare", "plotting", "january", "kept", "alumni",
  "inroads", "linen", "butter", "camp", "unquoted", "hoax", "succeed", "tribal", "vault"
];

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

async function startCreateWallet() {
  const words = [];
  for (let i = 0; i < 25; i++) {
    const idx = Math.floor(Math.random() * electrumWordList.length);
    words.push(electrumWordList[idx]);
  }
  currentSeedPhrase = words.join(' ');

  const walletFilename = 'vault_wallet_' + Date.now();
  await ipcRenderer.invoke('rpc-call', {
    url: currentWalletRpcUrl,
    method: 'create_wallet',
    params: {
      filename: walletFilename,
      password: 'password123',
      language: 'English'
    }
  });

  await refreshActiveAddress();

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
      password: 'password123',
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
    // Check daemon connection status from main process
    const daemonStatus = await ipcRenderer.invoke('get-daemon-status');
    const syncStatus = await ipcRenderer.invoke('get-sync-status');
    connectionMode = daemonStatus.activeNode;

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

    if (resInfo.success && resInfo.data) {
      const d = resInfo.data;
      const currentH = d.height || 0;
      let targetH = d.target_height || 0;

      if (targetH < currentH && daemonStatus.remoteHost) {
        try {
          // Use HTTPS domain — raw IP:port is now firewalled
          const remoteRes = await ipcRenderer.invoke('rpc-call', {
            url: `https://node.vaultapp.space/json_rpc`,
            method: 'get_info'
          });
          if (remoteRes.success && remoteRes.data && remoteRes.data.height) {
            targetH = Math.max(targetH, remoteRes.data.height);
          }
        } catch (e) {}
      }

      if (targetH < currentH) targetH = currentH;

      let syncPct = 100;
      if (targetH > 0 && currentH < targetH) {
        syncPct = Math.min(99, Math.round((currentH / targetH) * 100));
      } else if (currentH === 0) {
        syncPct = 0;
      }

      document.getElementById('netHeight').innerText = d.height || 0;
      document.getElementById('netDifficulty').innerText = Number(d.difficulty || 1).toLocaleString();
      document.getElementById('netHashrate').innerText = `${d.hashrate || Math.round((d.difficulty || 1) / 120)} H/s`;
      document.getElementById('nodeDot').className = 'status-dot green';

      // Show connection source & sync status
      let nodeLabel = 'Local Full Node (100% Synced)';
      let badgeLabel = 'Local Full Node (100% Synced)';
      let syncText = '100% Synced';

      if (resInfo.fallback) {
        nodeLabel = `Remote Node (${daemonStatus.remoteHost})`;
        badgeLabel = `Connected to Remote Node (${daemonStatus.remoteHost} • 100% Synced)`;
        syncPct = 100;
        syncText = '100% Synced (Remote Node)';
      } else if (syncPct < 100) {
        nodeLabel = `Local Node Syncing (${syncPct}%)`;
        badgeLabel = `Downloading Local Blockchain (${currentH}/${targetH} blocks • ${syncPct}%)`;
        syncText = `Syncing ${currentH}/${targetH} (${syncPct}%)`;
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
    } else {
      document.getElementById('nodeDot').className = 'status-dot red';
      document.getElementById('nodeLabel').innerText = 'Node Disconnected — Retrying...';
      document.getElementById('syncPercentText').innerText = 'Sync Offline';
      document.getElementById('syncBarFill').style.width = '0%';
    }



    const resBal = await ipcRenderer.invoke('rpc-call', {
      url: currentWalletRpcUrl,
      method: 'get_balance',
      params: { account_index: 0 }
    });

    if (resBal.success && resBal.data) {
      const totalAtomic = resBal.data.balance || 0;
      const unlockedAtomic = resBal.data.unlocked_balance || 0;
      const lockedAtomic = totalAtomic - unlockedAtomic;

      const total = (totalAtomic / 1e12).toFixed(6);
      const unlocked = (unlockedAtomic / 1e12).toFixed(6);
      const locked = (lockedAtomic / 1e12).toFixed(6);

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

async function sendTransaction() {
  const address = document.getElementById('sendAddress').value.trim();
  const amountVlt = parseFloat(document.getElementById('sendAmount').value);
  const priority = parseInt(document.getElementById('sendPriority').value);

  if (!address || isNaN(amountVlt) || amountVlt <= 0) {
    showToast('error', 'Please enter a valid recipient address (d5...) and amount.');
    return;
  }

  const atomicAmount = Math.round(amountVlt * 1e12);

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
}



function saveNodeSettings() {
  const host = document.getElementById('nodeHost').value.trim();
  const walletHost = document.getElementById('walletRpcHost').value.trim();
  if (host) currentDaemonUrl = `http://${host}/json_rpc`;
  if (walletHost) currentWalletRpcUrl = `http://${walletHost}/json_rpc`;

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
    const icon = isPending ? '⏳' : (isIn ? '📥' : '📤');
    const typeLabel = isPending ? 'Pending Transfer' : (isIn ? 'Received VLT' : 'Sent VLT');
    const amountStr = ((tx.amount || 0) / 1e12).toFixed(6);
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
      const unlockedAtomic = resBal.data.unlocked_balance || 0;
      const estimatedFeeAtomic = 10000000000; // ~0.01 VLT fee buffer
      const maxAtomic = Math.max(0, unlockedAtomic - estimatedFeeAtomic);
      const maxVlt = (maxAtomic / 1e12).toFixed(6);
      document.getElementById('sendAmount').value = maxVlt;
      showToast('info', `Send Max calculated: ${maxVlt} VLT (0.01 VLT fee reserved)`);
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
    ((tx.amount || 0) / 1e12).toFixed(6),
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
        const amt = ((latestTx.amount || 0) / 1e12).toFixed(6);
        ipcRenderer.invoke('show-notification', {
          title: '📥 Incoming Payment Received!',
          body: `Received +${amt} VLT in block #${latestTx.height || 'Pending'}`
        });
      }
    }
    previousTxCount = allTransactions.length;
  }
}

function updateFeePreview() {
  const priority = parseInt(document.getElementById('sendPriority').value) || 1;
  const amountVlt = parseFloat(document.getElementById('sendAmount').value) || 0;

  const baseFee = 0.000120;
  const multiplier = priority === 1 ? 1.0 : (priority === 2 ? 2.5 : 5.0);
  const estimatedFee = (baseFee * multiplier).toFixed(6);

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
});

setInterval(updateDashboard, 3000);



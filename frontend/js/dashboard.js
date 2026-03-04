/* ─────────────────────────────────────────────────────────
   DemoBank — Dashboard
   ───────────────────────────────────────────────────────── */

// ── Auth guard ─────────────────────────────────────────────
const token = localStorage.getItem('db_token');
if (!token) { window.location.replace('/'); }

let currentUser = null;
let accounts = [];

// ── Helpers ────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n);

const fmtDate = (str) =>
  new Date(str).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const maskNumber = (n) => `•••• ${n.slice(-4)}`;

function showToast(msg, type = 'success') {
  const tc = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert alert-${type}`;
}

function clearAlert(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.className = 'alert hidden';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Обработка…';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

const CARD_COLORS = ['blue', 'green', 'purple', 'dark'];

function renderAccountCard(acc, idx) {
  const color = CARD_COLORS[idx % CARD_COLORS.length];
  const icon = idx === 0 ? '💳' : idx === 1 ? '🏦' : '💰';
  return `
    <div class="account-card ${color}">
      <div class="account-card-top">
        <div>
          <div class="account-card-name">${acc.name}</div>
        </div>
        <div class="account-card-icon">${icon}</div>
      </div>
      <div class="account-card-balance">${fmt(acc.balance)}</div>
      <div class="account-card-footer">
        <span>${acc.account_number.replace(/(.{4})/g, '$1 ').trim()}</span>
        <span>${acc.currency}</span>
      </div>
    </div>`;
}

const TX_LABELS = { deposit: 'Пополнение', transfer: 'Перевод', client_transfer: 'Перевод клиенту' };

function renderTransactionsTable(txs, myAccountIds, limit) {
  if (!txs.length) {
    return '<div class="empty-state"><div class="empty-icon">📭</div>Операций пока нет</div>';
  }
  const rows = (limit ? txs.slice(0, limit) : txs).map(tx => {
    const isIncoming = myAccountIds.includes(tx.to_account_id) && !myAccountIds.includes(tx.from_account_id);
    const isDeposit = tx.type === 'deposit';
    const incoming = isDeposit || isIncoming;

    const amountHtml = incoming
      ? `<span class="tx-amount-in">+${fmt(tx.amount)}</span>`
      : `<span class="tx-amount-out">−${fmt(tx.amount)}</span>`;

    const badge = `<span class="tx-type-badge tx-${tx.type}">${TX_LABELS[tx.type] || tx.type}</span>`;

    const counterparty = isDeposit
      ? 'Банк'
      : incoming
        ? (tx.from_user_name || tx.from_account_number || '—')
        : (tx.to_user_name || tx.to_account_number || '—');

    return `<tr>
      <td>${fmtDate(tx.created_at)}</td>
      <td>${badge}</td>
      <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
          title="${tx.description || ''}">${tx.description || '—'}</td>
      <td>${counterparty}</td>
      <td style="text-align:right;">${amountHtml}</td>
    </tr>`;
  }).join('');

  return `<div class="transactions-table-wrap">
    <table class="transactions-table">
      <thead><tr>
        <th>Дата</th><th>Тип</th><th>Описание</th><th>Контрагент</th><th style="text-align:right;">Сумма</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Navigation ─────────────────────────────────────────────
const SECTION_TITLES = {
  overview: 'Обзор',
  deposit: 'Пополнение счёта',
  transfer: 'Перевод по номеру',
  'transfer-client': 'Перевод клиенту',
  history: 'История операций',
};

function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`section-${section}`)?.classList.add('active');
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
  document.getElementById('topbarTitle').textContent = SECTION_TITLES[section] || '';

  if (section === 'history') loadHistory();
  closeSidebar();
}

window.navigate = navigate;

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.section));
});

// ── Mobile sidebar ──────────────────────────────────────────
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').style.display = 'block';
});

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';
}
window.closeSidebar = closeSidebar;

// ── Logout ──────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('db_token');
  localStorage.removeItem('db_user');
  window.location.replace('/');
});

// ── Init greeting ───────────────────────────────────────────
function initGreeting(name) {
  const h = new Date().getHours();
  const greet = h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  document.getElementById('greetingText').textContent = `${greet}, ${name.split(' ')[0]}!`;
}

function initDate() {
  document.getElementById('topbarDate').textContent =
    new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Fill account selects ────────────────────────────────────
function fillAccountSelect(selectId, hintId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = accounts.map(a =>
    `<option value="${a.id}">${a.name} — ${fmt(a.balance)} (•••• ${a.account_number.slice(-4)})</option>`
  ).join('');

  if (hintId) {
    sel.addEventListener('change', () => {
      const acc = accounts.find(a => a.id === Number(sel.value));
      if (acc) document.getElementById(hintId).textContent = `Доступно: ${fmt(acc.balance)}`;
    });
    sel.dispatchEvent(new Event('change'));
  }
}

function renderAccountsSummary(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = accounts.map((a, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center;
                padding:10px 0; border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:14px; font-weight:600;">${a.name}</div>
        <div style="font-size:12px; color:var(--text-muted); font-family:monospace;">${a.account_number}</div>
      </div>
      <div style="font-weight:700; color:var(--primary);">${fmt(a.balance)}</div>
    </div>`).join('');
}

// ── Load overview ───────────────────────────────────────────
async function loadOverview() {
  try {
    accounts = await API.getAccounts();
    const txs = await API.getTransactions();
    const myIds = accounts.map(a => a.id);

    document.getElementById('accountsGrid').innerHTML =
      accounts.map((a, i) => renderAccountCard(a, i)).join('');

    document.getElementById('recentTransactions').innerHTML =
      renderTransactionsTable(txs, myIds, 5);

    // Refresh selects
    fillAccountSelect('depositAccount', 'depositHint');
    fillAccountSelect('transferFromAccount', 'transferFromHint');
    fillAccountSelect('clientFromAccount', 'clientFromHint');
    renderAccountsSummary('depositAccountsSummary');

    // Other accounts hint in transfer section
    // (fetch all accounts that are NOT mine — just use known ones from txs for demo)
    const others = new Set();
    txs.forEach(tx => {
      if (tx.from_account_number && !myIds.includes(tx.from_account_id)) others.add(`${tx.from_account_number} (${tx.from_user_name || ''})`);
      if (tx.to_account_number && !myIds.includes(tx.to_account_id)) others.add(`${tx.to_account_number} (${tx.to_user_name || ''})`);
    });
    const otherEl = document.getElementById('otherAccountsList');
    if (otherEl) otherEl.innerHTML = [...others].map(s => `<div style="margin-bottom:4px;">${s}</div>`).join('') || '<div style="color:var(--text-muted)">—</div>';

  } catch (err) {
    if (err.message.includes('401') || err.message.toLowerCase().includes('авторизаци')) {
      localStorage.removeItem('db_token');
      window.location.replace('/');
    }
  }
}

// ── Load history ────────────────────────────────────────────
async function loadHistory() {
  const el = document.getElementById('historyContent');
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Загрузка…</div>';
  try {
    const txs = await API.getTransactions();
    const myIds = accounts.map(a => a.id);
    el.innerHTML = renderTransactionsTable(txs, myIds, 0);
  } catch {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>Ошибка загрузки</div>';
  }
}

// ── Client list hints ────────────────────────────────────────
function renderClientListHint() {
  const el = document.getElementById('clientListHint');
  if (!el) return;
  const demoClients = [
    { login: 'ivanov', name: 'Иван Петров' },
    { login: 'sidorova', name: 'Мария Сидорова' },
    { login: 'kozlov', name: 'Алексей Козлов' },
  ].filter(c => c.login !== currentUser?.username);

  el.innerHTML = demoClients.map(c => `
    <div style="display:flex; justify-content:space-between; padding:8px 0;
                border-bottom:1px solid var(--border); font-size:14px;">
      <span>${c.name}</span>
      <code style="color:var(--primary); font-size:13px;">${c.login}</code>
    </div>`).join('');
}

// ── FORM: Deposit ───────────────────────────────────────────
document.getElementById('depositForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert('depositAlert');

  const account_id = Number(document.getElementById('depositAccount').value);
  const amount = Number(document.getElementById('depositAmount').value);
  const description = document.getElementById('depositDesc').value.trim();

  if (!amount || amount <= 0) { setAlert('depositAlert', 'Введите корректную сумму'); return; }

  setLoading('depositBtn', true);
  try {
    const res = await API.deposit({ account_id, amount, description });
    // Update local accounts
    const idx = accounts.findIndex(a => a.id === account_id);
    if (idx !== -1) accounts[idx] = res.account;
    showToast(res.message);
    document.getElementById('depositAmount').value = '';
    document.getElementById('depositDesc').value = '';
    fillAccountSelect('depositAccount', 'depositHint');
    fillAccountSelect('transferFromAccount', 'transferFromHint');
    fillAccountSelect('clientFromAccount', 'clientFromHint');
    renderAccountsSummary('depositAccountsSummary');
    // Refresh overview accounts in background
    loadOverview();
  } catch (err) {
    setAlert('depositAlert', err.message);
  } finally {
    setLoading('depositBtn', false);
  }
});

// ── FORM: Transfer by account number ───────────────────────
let transferToCheck = null;

const transferToInput = document.getElementById('transferToNumber');
transferToInput.addEventListener('input', async () => {
  const num = transferToInput.value.replace(/\s/g, '');
  const preview = document.getElementById('transferRecipientPreview');
  const nameEl = document.getElementById('transferRecipientName');
  preview.classList.add('hidden');
  transferToCheck = null;

  if (num.length === 20) {
    try {
      const info = await API.checkAccount(num);
      nameEl.textContent = `${info.full_name} — ${info.name}`;
      preview.classList.remove('hidden');
      transferToCheck = num;
    } catch {
      // not found — silent
    }
  }
});

document.getElementById('transferForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert('transferAlert');

  const from_account_id = Number(document.getElementById('transferFromAccount').value);
  const to_account_number = document.getElementById('transferToNumber').value.replace(/\s/g, '');
  const amount = Number(document.getElementById('transferAmount').value);
  const description = document.getElementById('transferDesc').value.trim();

  if (to_account_number.length !== 20) { setAlert('transferAlert', 'Введите 20-значный номер счёта'); return; }
  if (!amount || amount <= 0) { setAlert('transferAlert', 'Введите корректную сумму'); return; }

  setLoading('transferBtn', true);
  try {
    const res = await API.transfer({ from_account_id, to_account_number, amount, description });
    const idx = accounts.findIndex(a => a.id === from_account_id);
    if (idx !== -1) accounts[idx] = res.account;
    showToast(res.message);
    document.getElementById('transferToNumber').value = '';
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferDesc').value = '';
    document.getElementById('transferRecipientPreview').classList.add('hidden');
    fillAccountSelect('transferFromAccount', 'transferFromHint');
    fillAccountSelect('depositAccount', 'depositHint');
    fillAccountSelect('clientFromAccount', 'clientFromHint');
    loadOverview();
  } catch (err) {
    setAlert('transferAlert', err.message);
  } finally {
    setLoading('transferBtn', false);
  }
});

// ── FORM: Transfer to client ────────────────────────────────
let clientCheckTimer = null;

document.getElementById('clientQuery').addEventListener('input', () => {
  clearTimeout(clientCheckTimer);
  const q = document.getElementById('clientQuery').value.trim();
  const preview = document.getElementById('clientRecipientPreview');
  const nameEl = document.getElementById('clientRecipientName');
  preview.classList.add('hidden');

  if (q.length < 2) return;

  clientCheckTimer = setTimeout(async () => {
    try {
      const info = await API.checkClient(q);
      nameEl.textContent = `${info.full_name} (${info.username})`;
      preview.classList.remove('hidden');
    } catch {
      // not found
    }
  }, 400);
});

document.getElementById('clientTransferForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert('clientTransferAlert');

  const from_account_id = Number(document.getElementById('clientFromAccount').value);
  const client_query = document.getElementById('clientQuery').value.trim();
  const amount = Number(document.getElementById('clientAmount').value);
  const description = document.getElementById('clientDesc').value.trim();

  if (!client_query) { setAlert('clientTransferAlert', 'Введите логин или e-mail получателя'); return; }
  if (!amount || amount <= 0) { setAlert('clientTransferAlert', 'Введите корректную сумму'); return; }

  setLoading('clientTransferBtn', true);
  try {
    const res = await API.transferToClient({ from_account_id, client_query, amount, description });
    const idx = accounts.findIndex(a => a.id === from_account_id);
    if (idx !== -1) accounts[idx] = res.account;
    showToast(res.message);
    document.getElementById('clientQuery').value = '';
    document.getElementById('clientAmount').value = '';
    document.getElementById('clientDesc').value = '';
    document.getElementById('clientRecipientPreview').classList.add('hidden');
    fillAccountSelect('clientFromAccount', 'clientFromHint');
    fillAccountSelect('depositAccount', 'depositHint');
    fillAccountSelect('transferFromAccount', 'transferFromHint');
    loadOverview();
  } catch (err) {
    setAlert('clientTransferAlert', err.message);
  } finally {
    setLoading('clientTransferBtn', false);
  }
});

// ── Bootstrap ───────────────────────────────────────────────
(async () => {
  initDate();
  try {
    currentUser = await API.me();
    const initials = currentUser.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('sidebarUserName').textContent = currentUser.full_name;
    document.getElementById('sidebarUserLogin').textContent = '@' + currentUser.username;
    document.getElementById('userAvatar').textContent = initials;
    initGreeting(currentUser.full_name);
    renderClientListHint();
    await loadOverview();
  } catch {
    localStorage.removeItem('db_token');
    window.location.replace('/');
  }
})();

/* ─────────────────────────────────────────────────────────
   DemoBank API Client
   ───────────────────────────────────────────────────────── */

const API = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('db_token');
  }

  async function request(method, endpoint, data) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (data !== undefined) opts.body = JSON.stringify(data);

    const resp = await fetch(BASE + endpoint, opts);
    const json = await resp.json().catch(() => ({ message: 'Ошибка соединения' }));

    if (!resp.ok) throw new Error(json.message || `Ошибка ${resp.status}`);
    return json;
  }

  return {
    get:  (ep)       => request('GET',  ep),
    post: (ep, body) => request('POST', ep, body),

    /* Auth */
    login: (username, password, ksid) => request('POST', '/auth/login', { username, password, ksid }),
    me:    () => request('GET', '/auth/me'),

    /* Accounts */
    getAccounts:    () => request('GET', '/accounts'),
    getTransactions: () => request('GET', '/accounts/transactions'),
    checkAccount:   (number) => request('GET', `/accounts/check-account/${encodeURIComponent(number)}`),
    checkClient:    (query)  => request('GET', `/accounts/check-client/${encodeURIComponent(query)}`),

    deposit:          (body) => request('POST', '/accounts/deposit', body),
    transfer:         (body) => request('POST', '/accounts/transfer', body),
    transferToClient: (body) => request('POST', '/accounts/transfer-to-client', body),
  };
})();

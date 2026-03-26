const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');
const { checkKasperskyOperation } = require('../kfp');
const { callTalys } = require('../talys');

router.use(auth);

// GET /api/accounts
router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(req.userId);
  res.json(accounts);
});

// GET /api/accounts/transactions
router.get('/transactions', (req, res) => {
  const rows = db.prepare(`
    SELECT
      t.id, t.amount, t.type, t.description, t.status, t.created_at,
      t.from_account_id, t.to_account_id,
      fa.account_number AS from_account_number,
      ta.account_number AS to_account_number,
      fu.full_name AS from_user_name,
      tu.full_name AS to_user_name
    FROM transactions t
    LEFT JOIN accounts fa ON t.from_account_id = fa.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    LEFT JOIN users fu ON fa.user_id = fu.id
    LEFT JOIN users tu ON ta.user_id = tu.id
    WHERE fa.user_id = ? OR ta.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(req.userId, req.userId);

  res.json(rows);
});

// GET /api/accounts/check-account/:number — verify account exists before transfer
router.get('/check-account/:number', (req, res) => {
  const account = db.prepare(`
    SELECT a.account_number, a.name, u.full_name
    FROM accounts a JOIN users u ON a.user_id = u.id
    WHERE a.account_number = ?
  `).get(req.params.number);

  if (!account) return res.status(404).json({ message: 'Счёт не найден' });
  res.json(account);
});

// GET /api/accounts/check-client/:query — find client by username or email
router.get('/check-client/:query', (req, res) => {
  const q = req.params.query;
  const user = db.prepare(
    'SELECT id, username, full_name, email FROM users WHERE (username = ? OR email = ?) AND id != ?'
  ).get(q, q, req.userId);

  if (!user) return res.status(404).json({ message: 'Клиент не найден' });

  const account = db.prepare(
    'SELECT account_number FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1'
  ).get(user.id);

  res.json({ ...user, account_number: account?.account_number });
});

// POST /api/accounts/deposit
router.post('/deposit', async (req, res) => {
  const { account_id, amount, description, talys_enabled } = req.body;

  if (!account_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Укажите счёт и корректную сумму' });
  }

  const sum = Number(amount);

  const risk = await checkKasperskyOperation(req.ksid, 'deposit', sum, description);
  const currentUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  callTalys(risk, { eventType: 'depositCard', beneficiaryID: currentUser?.username, amount: sum, enabled: talys_enabled !== false });
  if (risk?.level === 'red') {
    return res.status(403).json({ message: 'Операция заблокирована системой безопасности' });
  }

  const account = db
    .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(account_id, req.userId);
  if (!account) return res.status(404).json({ message: 'Счёт не найден' });

  const doDeposit = db.transaction(() => {
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(sum, account_id);
    db.prepare(
      'INSERT INTO transactions (from_account_id, to_account_id, amount, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(null, account_id, sum, 'deposit', description || 'Пополнение счёта');
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
  });

  const updated = doDeposit();
  res.json({ message: 'Счёт успешно пополнен', account: updated });
});

// POST /api/accounts/transfer — transfer by account number
router.post('/transfer', async (req, res) => {
  const { from_account_id, to_account_number, amount, description, talys_enabled } = req.body;

  if (!from_account_id || !to_account_number || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Заполните все поля корректно' });
  }

  const sum = Number(amount);

  const risk = await checkKasperskyOperation(req.ksid, 'transfer_by_number', sum, description);
  if (risk?.level === 'red') {
    return res.status(403).json({ message: 'Операция заблокирована системой безопасности' });
  }

  const fromAccount = db
    .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(from_account_id, req.userId);
  if (!fromAccount) return res.status(404).json({ message: 'Счёт списания не найден' });

  if (fromAccount.account_number === to_account_number) {
    return res.status(400).json({ message: 'Нельзя переводить на тот же счёт' });
  }

  if (fromAccount.balance < sum) {
    return res.status(400).json({ message: 'Недостаточно средств' });
  }

  const toAccount = db.prepare(`
    SELECT a.*, u.username AS owner_username
    FROM accounts a JOIN users u ON a.user_id = u.id
    WHERE a.account_number = ?
  `).get(to_account_number);
  if (!toAccount) return res.status(404).json({ message: 'Счёт получателя не найден' });

  callTalys(risk, { eventType: 'p2p_debit', beneficiaryID: toAccount.owner_username, amount: sum, enabled: talys_enabled !== false });

  const doTransfer = db.transaction(() => {
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(sum, fromAccount.id);
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(sum, toAccount.id);
    db.prepare(
      'INSERT INTO transactions (from_account_id, to_account_id, amount, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(fromAccount.id, toAccount.id, sum, 'transfer', description || `Перевод на счёт ${to_account_number}`);
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(fromAccount.id);
  });

  const updated = doTransfer();
  res.json({ message: 'Перевод выполнен', account: updated });
});

// POST /api/accounts/transfer-to-client — transfer by username or email
router.post('/transfer-to-client', async (req, res) => {
  const { from_account_id, client_query, amount, description, talys_enabled } = req.body;

  if (!from_account_id || !client_query || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Заполните все поля корректно' });
  }

  const sum = Number(amount);

  const risk = await checkKasperskyOperation(req.ksid, 'transfer_by_userId', sum, description);
  if (risk?.level === 'red') {
    return res.status(403).json({ message: 'Операция заблокирована системой безопасности' });
  }

  const fromAccount = db
    .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(from_account_id, req.userId);
  if (!fromAccount) return res.status(404).json({ message: 'Счёт списания не найден' });

  if (fromAccount.balance < sum) {
    return res.status(400).json({ message: 'Недостаточно средств' });
  }

  const toUser = db
    .prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?')
    .get(client_query, client_query, req.userId);
  if (!toUser) return res.status(404).json({ message: 'Клиент не найден в системе' });

  callTalys(risk, { eventType: 'p2p_debit', beneficiaryID: toUser.username, amount: sum, enabled: talys_enabled !== false });

  const toAccount = db
    .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1')
    .get(toUser.id);
  if (!toAccount) return res.status(404).json({ message: 'У клиента нет счетов' });

  const doTransfer = db.transaction(() => {
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(sum, fromAccount.id);
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(sum, toAccount.id);
    db.prepare(
      'INSERT INTO transactions (from_account_id, to_account_id, amount, type, description) VALUES (?, ?, ?, ?, ?)'
    ).run(
      fromAccount.id,
      toAccount.id,
      sum,
      'client_transfer',
      description || `Перевод клиенту ${toUser.full_name}`
    );
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(fromAccount.id);
  });

  const updated = doTransfer();
  res.json({ message: `Перевод клиенту ${toUser.full_name} выполнен`, account: updated });
});

module.exports = router;

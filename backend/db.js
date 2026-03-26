const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bank.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    account_number TEXT UNIQUE NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'RUB',
    name TEXT NOT NULL DEFAULT 'Текущий счёт',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id INTEGER REFERENCES accounts(id),
    to_account_id INTEGER REFERENCES accounts(id),
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    ksid TEXT NOT NULL DEFAULT '',
    expires_at DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kfp_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    request_url TEXT NOT NULL,
    request_body TEXT,
    response_level TEXT,
    response_rule_versions TEXT,
    response_raw TEXT
  );

  CREATE TABLE IF NOT EXISTS talys_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,
    request_body TEXT,
    response_status INTEGER
  );
`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

if (userCount.count === 0) {
  console.log('Seeding database with demo data...');

  const insertUser = db.prepare(
    'INSERT INTO users (username, email, full_name, password_hash) VALUES (?, ?, ?, ?)'
  );
  const insertAccount = db.prepare(
    'INSERT INTO accounts (user_id, account_number, balance, name) VALUES (?, ?, ?, ?)'
  );
  const insertTx = db.prepare(
    'INSERT INTO transactions (from_account_id, to_account_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const hash = bcrypt.hashSync('password123', 10);

  const u1 = insertUser.run('ivanov', 'ivanov@demobank.ru', 'Иван Петров', hash).lastInsertRowid;
  const u2 = insertUser.run('sidorova', 'sidorova@demobank.ru', 'Мария Сидорова', hash).lastInsertRowid;
  const u3 = insertUser.run('kozlov', 'kozlov@demobank.ru', 'Алексей Козлов', hash).lastInsertRowid;

  const a1 = insertAccount.run(u1, '40817810000000000001', 47500, 'Текущий счёт').lastInsertRowid;
  const a2 = insertAccount.run(u1, '40817810000000000002', 15000, 'Сберегательный счёт').lastInsertRowid;
  const a3 = insertAccount.run(u2, '40817810000000000003', 28000, 'Текущий счёт').lastInsertRowid;
  const a4 = insertAccount.run(u3, '40817810000000000004', 102000, 'Текущий счёт').lastInsertRowid;

  const d = (daysAgo) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - daysAgo);
    return dt.toISOString().replace('T', ' ').slice(0, 19);
  };

  insertTx.run(null, a1, 50000, 'deposit', 'Начальное пополнение', d(30));
  insertTx.run(null, a2, 15000, 'deposit', 'Открытие сберегательного счёта', d(28));
  insertTx.run(a1, a3, 5000, 'transfer', 'Перевод Марии Сидоровой', d(20));
  insertTx.run(null, a3, 33000, 'deposit', 'Зарплата', d(25));
  insertTx.run(a3, a1, 8000, 'transfer', 'Возврат долга', d(15));
  insertTx.run(a1, a4, 500, 'transfer', 'Оплата услуг', d(10));
  insertTx.run(null, a4, 100000, 'deposit', 'Начальное пополнение', d(35));
  insertTx.run(a4, a1, 2000, 'transfer', 'За билеты', d(5));
  insertTx.run(null, a1, 3000, 'deposit', 'Кешбэк', d(3));
  insertTx.run(a1, a3, 1000, 'transfer', 'Перевод подруге', d(1));

  console.log('Demo database seeded. Users: ivanov, sidorova, kozlov (password: password123)');
}

module.exports = db;

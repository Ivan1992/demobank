const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const db = require('../db');
const auth = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'demobank-dev-secret-2024';

function checkKasperskyRisk(ksid, username) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      cid: 'demobank',
      ksid,
      phase: 'login',
      uid: username,
      username,
      action: 'risk_level',
      result: 'success',
      sf: 'false',
      'rule-details': '1',
    });
    const url = `https://connect-romanovka.fp.kaspersky-labs.com/events?${params}`;

    const req = https.request(url, { method: 'POST' }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* ignore */ }
        try {
          db.prepare(
            'INSERT INTO kfp_log (request_url, request_body, response_level, response_rule_versions, response_raw) VALUES (?, ?, ?, ?, ?)'
          ).run(
            url, null,
            parsed?.level ?? null,
            parsed?.['rule_versions'] != null ? JSON.stringify(parsed['rule_versions']) : null,
            data || null
          );
        } catch { /* never break main flow */ }
        resolve(parsed);
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, ksid } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Введите логин и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }

  const risk = await checkKasperskyRisk(ksid ?? "empty", user.username);
  if (risk?.level === 'red') {
    return res.status(403).json({ message: 'Вам отказали во входе' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30min' });

  const { exp } = jwt.decode(token);
  const expiresAt = new Date(exp * 1000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('INSERT OR REPLACE INTO sessions (user_id, ksid, expires_at) VALUES (?, ?, ?)')
    .run(user.id, ksid ?? 'empty', expiresAt);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
    },
  });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, email, full_name FROM users WHERE id = ?')
    .get(req.userId);
  if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
  res.json(user);
});

module.exports = router;

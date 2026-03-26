const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/authMiddleware');
const { checkKasperskyRisk } = require('../kfp');
const { callTalys } = require('../talys');

const JWT_SECRET = process.env.JWT_SECRET || 'demobank-dev-secret-2024';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, ksid, talys_enabled } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Введите логин и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }

  const risk = await checkKasperskyRisk(ksid ?? "empty", user.username);
  callTalys(risk, { eventType: 'login', beneficiaryID: user.username, enabled: talys_enabled !== false });
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

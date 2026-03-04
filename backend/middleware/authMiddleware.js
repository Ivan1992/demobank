const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'demobank-dev-secret-2024';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;

    const session = db
      .prepare("SELECT ksid FROM sessions WHERE user_id = ? AND expires_at > datetime('now')")
      .get(decoded.userId);
    req.ksid = session?.ksid ?? null;

    next();
  } catch {
    return res.status(401).json({ message: 'Неверный или истёкший токен' });
  }
};

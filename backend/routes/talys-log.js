const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/talys-log — last 200 Talys events, newest first
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, created_at, event_type, request_body, response_status FROM talys_log ORDER BY created_at DESC LIMIT 200'
  ).all();
  res.json(rows);
});

module.exports = router;

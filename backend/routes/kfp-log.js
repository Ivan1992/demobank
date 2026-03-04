const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/kfp-log — last 200 KFP events, newest first
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, created_at, request_url, request_body,
           response_level, response_rule_versions, response_raw
    FROM kfp_log
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

module.exports = router;

const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');

function createKfpAgent() {
  let cert, key;

  // Railway: cert content stored as base64 env vars
  if (process.env.KFP_CERT_CRT && process.env.KFP_CERT_KEY) {
    cert = Buffer.from(process.env.KFP_CERT_CRT, 'base64');
    key = Buffer.from(process.env.KFP_CERT_KEY, 'base64');
  } else {
    // Local dev: read from ./certs directory (or CERT_PATH env var)
    const certsDir = process.env.CERT_PATH || path.join(__dirname, 'certs');
    const crtFile = path.join(certsDir, 'client.crt');
    const keyFile = path.join(certsDir, 'client.key');
    if (fs.existsSync(crtFile) && fs.existsSync(keyFile)) {
      cert = fs.readFileSync(crtFile);
      key = fs.readFileSync(keyFile);
    }
  }

  if (!cert || !key) return null;

  const agentOptions = { cert, key };
  if (process.env.KFP_CERT_PASSPHRASE) {
    agentOptions.passphrase = process.env.KFP_CERT_PASSPHRASE;
  }
  return new https.Agent(agentOptions);
}

const kfpAgent = createKfpAgent();

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
      extended: 'true',
    });
    const url = `https://connect-romanovka.fp.kaspersky-labs.com/events?${params}`;
    const reqOptions = { method: 'POST' };
    if (kfpAgent) reqOptions.agent = kfpAgent;

    const req = https.request(url, reqOptions, (resp) => {
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

function checkKasperskyOperation(ksid, operation_type, value, comment) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      cid: 'demobank',
      ksid: ksid || 'empty',
      phase: 'post_login',
      action: 'risk_level',
      'rule-details': '1',
      extended: 'true',
    });
    const body = JSON.stringify({ operation_type, value: String(value), comment: comment || '' });
    const urlObj = new URL(`https://connect-romanovka.fp.kaspersky-labs.com/events?${params}`);
    const fullUrl = urlObj.toString();

    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    if (kfpAgent) reqOptions.agent = kfpAgent;

    const req = https.request(reqOptions, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* ignore */ }
        try {
          db.prepare(
            'INSERT INTO kfp_log (request_url, request_body, response_level, response_rule_versions, response_raw) VALUES (?, ?, ?, ?, ?)'
          ).run(
            fullUrl, body,
            parsed?.level ?? null,
            parsed?.['rule_versions'] != null ? JSON.stringify(parsed['rule_versions']) : null,
            data || null
          );
        } catch { /* never break main flow */ }
        resolve(parsed);
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

module.exports = { checkKasperskyRisk, checkKasperskyOperation };

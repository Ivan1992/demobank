const https = require('https');
const db = require('./db');

const TALYS_URL = 'https://decision-integration-prod.demo.datasapience.ru/camel/decision/c9175d47-47c7-44b9-a16f-d29722972b02';

function callTalys(kfpResponse, options) {
  if (!options.enabled) return;
  const token = process.env.TALYS_API_TOKEN;
  //if (!token) return;

  const ed = kfpResponse?.extended_data || {};
  const uei = ed.userEndpointInfo || {};

  const body = {
    eventId:       ed.eventId    || null,
    channel:       'web',
    deviceId:      ed.deviceId   || null,
    customerID:    ed.userId     || null,
    beneficiaryID: options.beneficiaryID || null,
    kfpRules:      kfpResponse?.rule_versions || [],
    eventType:     options.eventType,
  };
  if (options.amount != null) body.billingAmount = options.amount;
  if (uei.latitude != null && uei.longitude != null) {
    body.geolocation = { longitude: uei.longitude, latitude: uei.latitude };
  }

  const bodyStr = JSON.stringify(body);
  const urlObj = new URL(TALYS_URL);

  const req = https.request({
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'accept':         '*/*',
      'Authorization':  `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  }, (resp) => {
    resp.resume();
    try {
      db.prepare('INSERT INTO talys_log (event_type, request_body, response_status) VALUES (?, ?, ?)')
        .run(options.eventType, bodyStr, resp.statusCode);
    } catch { /* never break main flow */ }
  });
  req.on('error', () => {
    try {
      db.prepare('INSERT INTO talys_log (event_type, request_body, response_status) VALUES (?, ?, ?)')
        .run(options.eventType, bodyStr, null);
    } catch { /* ignore */ }
  });
  req.write(bodyStr);
  req.end();
}

module.exports = { callTalys };

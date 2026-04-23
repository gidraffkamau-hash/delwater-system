/**
 * DELWATER — FIXED M-PESA + MONGODB INTEGRATION
 */

const mongoose = require("mongoose");
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// =========================
// DATABASE CONNECTION
// =========================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

// =========================
// TRANSACTION MODEL
// =========================
const transactionSchema = new mongoose.Schema({
  CheckoutRequestID: String,
  phone: String,
  amount: Number,
  status: String,
  resultCode: Number,
  resultDesc: String,
  orderRef: String,
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model("Transaction", transactionSchema);

// =========================
// MPESA CONFIG
// =========================
const CONFIG = {
  MPESA: {
    CONSUMER_KEY:    'gGY5QPt4Ua8fSbfG7dVs1IKojEYTL20AYPXcrugNtayj1utn',
    CONSUMER_SECRET: 'aA5w6UGwQv9Y4rDiTQIPm80iSfwJaV0rKlZkIuJgtgpw2qh2HY4522H8L3FQP8j1',
    SHORTCODE:       '174379',
    PASSKEY:         'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    BASE_URL:        'https://sandbox.safaricom.co.ke',
    TRANSACTION_TYPE: 'CustomerPayBillOnline'
  }
};

// =========================
// HELPERS
// =========================
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

// =========================
// TOKEN
// =========================
let tokenCache = { token: null, expiry: 0 };

async function getMpesaToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiry) return tokenCache.token;

  const auth = Buffer.from(
    `${CONFIG.MPESA.CONSUMER_KEY}:${CONFIG.MPESA.CONSUMER_SECRET}`
  ).toString('base64');

  const parsed = new URL(`${CONFIG.MPESA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`);

  const result = await httpsRequest({
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` }
  });

  tokenCache = {
    token: result.body.access_token,
    expiry: Date.now() + 55 * 60 * 1000
  };

  return tokenCache.token;
}

// =========================
// STK PUSH
// =========================
async function initiateStkPush(phone, amount, orderRef) {
  const token = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const password = Buffer.from(
    `${CONFIG.MPESA.SHORTCODE}${CONFIG.MPESA.PASSKEY}${timestamp}`
  ).toString('base64');

  const payload = JSON.stringify({
    BusinessShortCode: CONFIG.MPESA.SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: CONFIG.MPESA.TRANSACTION_TYPE,
    Amount: Math.round(amount),
    PartyA: phone,
    PartyB: CONFIG.MPESA.SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: "https://delwater-system-production.up.railway.app/mpesa/callback",
    AccountReference: orderRef,
    TransactionDesc: `DELWATER ${orderRef}`
  });

  const apiHost = new URL(CONFIG.MPESA.BASE_URL).hostname;

  return await httpsRequest({
    hostname: apiHost,
    path: '/mpesa/stkpush/v1/processrequest',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
}

// =========================
// SERVER
// =========================
const server = http.createServer(async (req, res) => {

  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // =========================
  // STK PUSH
  // =========================
  if (pathname === '/mpesa/stkpush' && method === 'POST') {
    try {
      const { phone, amount, orderRef } = JSON.parse(await readBody(req));

      const result = await initiateStkPush(phone, amount, orderRef);
      const data = result.body;

      if (data.ResponseCode === '0' && data.CheckoutRequestID) {

        await Transaction.create({
          CheckoutRequestID: data.CheckoutRequestID,
          phone,
          amount,
          status: "pending",
          orderRef
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
      }

      res.writeHead(400);
      return res.end(JSON.stringify(data));

    } catch (e) {
      console.error(e);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // =========================
  // CALLBACK (FIXED)
  // =========================
  if (pathname === '/mpesa/callback' && method === 'POST') {
    try {
      const data = JSON.parse(await readBody(req));
      const cb = data?.Body?.stkCallback;

      if (cb) {
        const checkoutRequestID = cb.CheckoutRequestID;
        const ok = cb.ResultCode === 0;

        await Transaction.findOneAndUpdate(
          { CheckoutRequestID: checkoutRequestID },
          {
            status: ok ? "success" : "failed",
            resultCode: cb.ResultCode,
            resultDesc: cb.ResultDesc
          }
        );

        console.log(`[PAYMENT] ${checkoutRequestID} → ${ok ? "SUCCESS" : "FAILED"}`);
      }

    } catch (e) {
      console.error("CALLBACK ERROR:", e.message);
    }

    res.writeHead(200);
    return res.end(JSON.stringify({ ResultCode: 0, ResultDesc: "Success" }));
  }

  // =========================
  // STATUS CHECK
  // =========================
  const statusMatch = pathname.match(/^\/mpesa\/status\/(.+)$/);

  if (statusMatch && method === 'GET') {
    const id = decodeURIComponent(statusMatch[1]);

    const tx = await Transaction.findOne({ CheckoutRequestID: id });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(tx || { status: "unknown" }));
  }

});

server.listen(51102, () => {
  console.log("🚀 Server running on port 51102");
});
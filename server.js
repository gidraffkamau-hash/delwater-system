/**
 * ╔══════════════════════════════════════════════════╗
 * ║       DELWATER — Server + M-Pesa Integration     ║
 * ║  No npm install needed. Runs with: node server.js║
 * ╚══════════════════════════════════════════════════╝
 *
 * ⚠️  SETUP REQUIRED:
 *   1. Set NGROK_URL below after running: ngrok http 51102
 *   2. Set LNM_PASSKEY from developer.safaricom.co.ke
 *      → Your App → LNM Online Passkey
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ═══════════════════════════════════════════════════
//  CONFIGURATION  — edit these values
// ═══════════════════════════════════════════════════
const CONFIG = {
  PORT: 51102,

  MPESA: {
    CONSUMER_KEY:    'gGY5QPt4Ua8fSbfG7dVs1IKojEYTL20AYPXcrugNtayj1utn',
    CONSUMER_SECRET: 'aA5w6UGwQv9Y4rDiTQIPm80iSfwJaV0rKlZkIuJgtgpw2qh2HY4522H8L3FQP8j1',

    // ─── SANDBOX (for testing) ───────────────────────────────────────────────
    // Use these values to test without real money. Sandbox STK pushes don't
    // charge any real phone — they just simulate the flow.
    SHORTCODE: '174379',
    PASSKEY:   'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    BASE_URL:  'https://sandbox.safaricom.co.ke',
    TRANSACTION_TYPE: 'CustomerPayBillOnline',  // Sandbox uses Paybill → CustomerPayBillOnline

    // ─── PRODUCTION (when going live) ────────────────────────────────────────
    // 1. Log in to developer.safaricom.co.ke
    // 2. Regenerate your Consumer Key & Secret (the old ones were shared in chat)
    // 3. Get your LNM Passkey from your app's page
    // 4. Replace the three sandbox lines above with:
    //    SHORTCODE:        '254702882491',
    //    PASSKEY:          'YOUR_PRODUCTION_LNM_PASSKEY',
    //    BASE_URL:         'https://api.safaricom.co.ke',
    //    TRANSACTION_TYPE: 'CustomerBuyGoodsOnline',  // Pochi la Biashara is a till (Buy Goods)

    NGROK_URL: 'https://making-luxurious-ferment.ngrok-free.dev',   // ← paste your ngrok https:// URL here
  }
};

// In-memory payment store
const payments = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

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
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

let tokenCache = { token: null, expiry: 0 };

async function getMpesaToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiry) return tokenCache.token;
  const auth   = Buffer.from(`${CONFIG.MPESA.CONSUMER_KEY}:${CONFIG.MPESA.CONSUMER_SECRET}`).toString('base64');
  const parsed = new URL(`${CONFIG.MPESA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`);
  const result = await httpsRequest({
    hostname: parsed.hostname,
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers:  { 'Authorization': `Basic ${auth}` }
  });
  if (!result.body.access_token) throw new Error('Token fetch failed: ' + JSON.stringify(result.body));
  tokenCache = { token: result.body.access_token, expiry: Date.now() + 55 * 60 * 1000 };
  return tokenCache.token;
}

async function initiateStkPush(phone, amount, orderRef) {
  const token     = await getMpesaToken();
  const timestamp = mpesaTimestamp();
  const password  = Buffer.from(`${CONFIG.MPESA.SHORTCODE}${CONFIG.MPESA.PASSKEY}${timestamp}`).toString('base64');
  // Sandbox shortcode 174379 is a Paybill → CustomerPayBillOnline
  // Production Pochi la Biashara (till) → CustomerBuyGoodsOnline
  const transactionType = CONFIG.MPESA.TRANSACTION_TYPE || 'CustomerPayBillOnline';
  const payload   = JSON.stringify({
    BusinessShortCode: CONFIG.MPESA.SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   transactionType,
    Amount:            Math.round(amount),
    PartyA:            phone,
    PartyB:            CONFIG.MPESA.SHORTCODE,
    PhoneNumber:       phone,
    CallBackURL:       `${CONFIG.MPESA.NGROK_URL}/mpesa/callback`,
    AccountReference:  orderRef,
    TransactionDesc:   `DELWATER ${orderRef}`
  });
  const apiHost = new URL(CONFIG.MPESA.BASE_URL).hostname;
  return await httpsRequest({
    hostname: apiHost,
    path:     '/mpesa/stkpush/v1/processrequest',
    method:   'POST',
    headers:  {
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url);
  const pathname = parsed.pathname;
  const method   = req.method.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /mpesa/stkpush
  if (pathname === '/mpesa/stkpush' && method === 'POST') {
    try {
      const { phone, amount, orderRef } = JSON.parse(await readBody(req));
      if (!phone || !amount || !orderRef) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing phone, amount or orderRef' }));
      }
      if (CONFIG.MPESA.NGROK_URL === 'YOUR_NGROK_URL') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Ngrok URL not configured. Run: ngrok http 51102  then paste the https:// URL into server.js as NGROK_URL, and restart the server.' }));
      }
      const result = await initiateStkPush(phone, amount, orderRef);
      const data   = result.body;
      if (data.ResponseCode === '0' && data.CheckoutRequestID) {
        payments.set(data.CheckoutRequestID, { status: 'pending', orderRef, resultDesc: 'Awaiting payment' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
      }
    } catch(e) {
      console.error('[STK ERROR]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // POST /mpesa/callback  ← Safaricom sends result here
  if (pathname === '/mpesa/callback' && method === 'POST') {
    try {
      const data = JSON.parse(await readBody(req));
      console.log('[CALLBACK]', JSON.stringify(data, null, 2));
      const cb = data?.Body?.stkCallback;
      if (cb) {
        const id = cb.CheckoutRequestID;
        if (payments.has(id)) {
          const ok = cb.ResultCode === 0;
          payments.set(id, {
            status:     ok ? 'success' : 'failed',
            resultCode: cb.ResultCode,
            resultDesc: cb.ResultDesc,
            orderRef:   payments.get(id).orderRef
          });
          console.log(`[PAYMENT] ${id} → ${ok ? '✅ SUCCESS' : '❌ FAILED'}: ${cb.ResultDesc}`);
        }
      }
    } catch(e) { console.error('[CALLBACK ERROR]', e.message); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ResultCode: 0, ResultDesc: 'Success' }));
  }

  // GET /mpesa/status/:id
  const statusMatch = pathname.match(/^\/mpesa\/status\/(.+)$/);
  if (statusMatch && method === 'GET') {
    const id = decodeURIComponent(statusMatch[1]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(payments.get(id) || { status: 'unknown' }));
  }

  // Static files
  let filePath = pathname === '/' ? '/DelwaterFull.html' : pathname;
  filePath     = path.join(__dirname, filePath.split('?')[0]);
  const ext    = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(`<h1>404</h1><p>${pathname}</p><a href="/">← Home</a>`);
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(CONFIG.PORT, () => {
  const ready = CONFIG.MPESA.NGROK_URL !== 'YOUR_NGROK_URL';
  console.log('\n💧 ─────────────────────────────────────────────');
  console.log('   DELWATER Server running!');
  console.log('─────────────────────────────────────────────────');
  console.log(`\n  🌐  Website:   http://localhost:${CONFIG.PORT}/`);
  console.log(`  🔐  Admin:     http://localhost:${CONFIG.PORT}/DelwaterAdmin.html`);
  console.log(`  📱  M-Pesa:    ${ready ? '✅ Configured' : '⚠️  Needs setup (see README.md)'}`);
  if (!ready) {
    if (CONFIG.MPESA.PASSKEY === 'YOUR_LNM_PASSKEY')
      console.log('     → Set PASSKEY in server.js');
    if (CONFIG.MPESA.NGROK_URL === 'YOUR_NGROK_URL')
      console.log(`     → Run: ngrok http ${CONFIG.PORT}  then paste URL into server.js`);
  }
  console.log('\n  Ctrl+C to stop.');
  console.log('─────────────────────────────────────────────────\n');
});

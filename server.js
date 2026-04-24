const { Pool } = require("pg");
require("dotenv").config();

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ✅ SAFE DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ test DB but DO NOT crash app
pool.connect()
  .then(() => console.log("✅ PostgreSQL connected"))
  .catch(err => console.error("❌ PostgreSQL connection error:", err.message));

// ✅ USE RAILWAY PORT
const PORT = process.env.PORT || 51102;

const CONFIG = {
  MPESA: {
    CONSUMER_KEY: 'gGY5QPt4Ua8fSbfG7dVs1IKojEYTL20AYPXcrugNtayj1utn',
    CONSUMER_SECRET: 'aA5w6UGwQv9Y4rDiTQIPm80iSfwJaV0rKlZkIuJgtgpw2qh2HY4522H8L3FQP8j1',
    SHORTCODE: '174379',
    PASSKEY: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    BASE_URL: 'https://sandbox.safaricom.co.ke',
    TRANSACTION_TYPE: 'CustomerPayBillOnline',
    CALLBACK_URL: 'https://delwater-system-production.up.railway.app/mpesa/callback'
  }
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json'
};

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  const method = req.method.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.end();

  // ================= CREATE ORDER =================
  if (pathname === '/api/orders' && method === 'POST') {
    try {
      const data = JSON.parse(await readBody(req));

      const result = await pool.query(
        `INSERT INTO orders 
        (ref, customer_name, phone, email, address, city, items, total, payment, delivery_date, notes, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          data.ref,
          data.customer.name,
          data.customer.phone,
          data.customer.email,
          data.customer.address,
          data.customer.city,
          JSON.stringify(data.items),
          data.total,
          data.payment,
          data.deliveryDate,
          data.notes,
          data.status
        ]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows[0]));

    } catch (err) {
      console.error("🔥 ORDER ERROR:", err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // ================= GET ORDERS =================
  if (pathname === '/api/orders' && method === 'GET') {
    try {
      const result = await pool.query(
        "SELECT * FROM orders ORDER BY created_at DESC"
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows));

    } catch (err) {
      console.error("🔥 FETCH ERROR:", err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // ================= STATIC FILES =================
  let filePath = pathname === '/' ? '/DelwaterFull.html' : pathname;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ✅ IMPORTANT FOR RAILWAY
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
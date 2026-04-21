# DELWATER — Setup Guide (with M-Pesa STK Push)

## How It All Works
```
Customer (Browser)          Server (Node.js)       Safaricom API
──────────────────          ────────────────       ─────────────
Fills checkout form
Clicks "Place Order"
       │
       ├─ M-Pesa ──────────► POST /mpesa/stkpush ──► STK Push sent
       │                      Store: "pending"           │
       │                                          Customer enters PIN
       │                      POST /mpesa/callback ◄─────┘
       │                      Store: success/fail
       │
       ├─ polls /mpesa/status ◄── Returns result
       │
  Shows confirmation
  Saves to localStorage
  Admin panel auto-updates
```

---

## ⚠️ Regenerate Your Credentials First!
Your Consumer Key & Secret were shared in a chat. Go to:
  https://developer.safaricom.co.ke → Your App → Regenerate Keys
Then update them in server.js under CONFIG.MPESA.

---

## Step-by-Step Setup

### 1. Install Node.js
Download LTS from https://nodejs.org

### 2. Authenticate ngrok (one-time)
```
ngrok config add-authtoken 3CNmGaVHAd5F4XorZxSZP2W0OVE_2eCRfoR5k49Gejp7Qq2Ns
```

### 3. Get your LNM Passkey
  - Log in at https://developer.safaricom.co.ke
  - Open your App → find "LNM Online Passkey"
  - Copy it → paste into server.js replacing YOUR_LNM_PASSKEY

### 4. Put all files in one folder
```
delwater/
  server.js
  DelwaterFull.html
  DelwaterAdmin.html
  DEL LOGO.jpg
```

### 5. Start the server
```
node server.js
```

### 6. Start ngrok (new terminal window)
```
ngrok http 51102
```
Copy the https:// URL shown (e.g. https://abc123.ngrok-free.app)

### 7. Paste ngrok URL into server.js
Find:  NGROK_URL: 'YOUR_NGROK_URL',
Replace with your actual URL, then restart: Ctrl+C → node server.js

Server will show: 📱 M-Pesa: ✅ Configured

---

## URLs
  Customer site:  http://localhost:51102/
  Admin panel:    http://localhost:51102/DelwaterAdmin.html
  Admin login:    admin / delwater2026

## Troubleshooting
  "passkey not configured"    → Step 3
  "ngrok URL not configured"  → Step 7
  401 errors                  → Regenerate keys at developer.safaricom.co.ke
  Admin not showing orders    → Open both pages from http://localhost:51102 (not file://)

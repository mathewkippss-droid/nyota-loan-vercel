// api/stk-initiate.js
// Vercel Serverless Function for M-Pesa STK Push

import axios from ‘axios’;

export default async function handler(req, res) {
// Enable CORS
res.setHeader(‘Access-Control-Allow-Credentials’, ‘true’);
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET,OPTIONS,PATCH,DELETE,POST,PUT’);
res.setHeader(
‘Access-Control-Allow-Headers’,
‘X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version’
);

// Handle preflight OPTIONS request
if (req.method === ‘OPTIONS’) {
res.status(200).end();
return;
}

// Only allow POST requests
if (req.method !== ‘POST’) {
return res.status(405).json({
success: false,
message: ‘Method not allowed’
});
}

try {
const { phone, amount } = req.body;

```
// Validate input
if (!phone || !amount) {
  return res.status(400).json({
    success: false,
    message: 'Phone number and amount are required'
  });
}

// Validate phone format (254XXXXXXXXX)
const phoneRegex = /^254[17]\d{8}$/;
if (!phoneRegex.test(phone)) {
  return res.status(400).json({
    success: false,
    message: 'Invalid phone number format. Use 254XXXXXXXXX'
  });
}

// Validate amount
if (amount < 1 || amount > 150000) {
  return res.status(400).json({
    success: false,
    message: 'Invalid amount. Must be between 1 and 150000'
  });
}

// M-Pesa Configuration (from environment variables)
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.MPESA_SHORTCODE || '174379';
const PASSKEY = process.env.MPESA_PASSKEY;
const ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox';
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL || `${req.headers.origin}/api/mpesa-callback`;

// Check if credentials are configured
if (!CONSUMER_KEY || !CONSUMER_SECRET || !PASSKEY) {
  console.error('Missing M-Pesa credentials in environment variables');
  return res.status(500).json({
    success: false,
    message: 'M-Pesa API not configured. Please contact support.'
  });
}

// API URLs based on environment
const AUTH_URL = ENVIRONMENT === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
  : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

const STK_URL = ENVIRONMENT === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
  : 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

// ==========================================
// STEP 1: Get Access Token
// ==========================================
const authString = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

const tokenResponse = await axios.get(AUTH_URL, {
  headers: {
    Authorization: `Basic ${authString}`
  }
});

const accessToken = tokenResponse.data.access_token;

if (!accessToken) {
  throw new Error('Failed to get M-Pesa access token');
}

// ==========================================
// STEP 2: Generate Password and Timestamp
// ==========================================
const timestamp = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, -3);

const password = Buffer.from(
  `${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`
).toString('base64');

// ==========================================
// STEP 3: Initiate STK Push
// ==========================================
const stkData = {
  BusinessShortCode: BUSINESS_SHORT_CODE,
  Password: password,
  Timestamp: timestamp,
  TransactionType: 'CustomerPayBillOnline',
  Amount: Math.floor(amount), // Ensure integer
  PartyA: phone,
  PartyB: BUSINESS_SHORT_CODE,
  PhoneNumber: phone,
  CallBackURL: CALLBACK_URL,
  AccountReference: 'NyotaLoan',
  TransactionDesc: 'Loan Processing Fee'
};

const stkResponse = await axios.post(STK_URL, stkData, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

// ==========================================
// STEP 4: Process Response
// ==========================================
if (stkResponse.data.ResponseCode === '0') {
  // Success - STK Push sent
  return res.status(200).json({
    success: true,
    message: 'STK Push sent successfully',
    data: {
      CheckoutRequestID: stkResponse.data.CheckoutRequestID,
      MerchantRequestID: stkResponse.data.MerchantRequestID,
      ResponseCode: stkResponse.data.ResponseCode,
      ResponseDescription: stkResponse.data.ResponseDescription,
      CustomerMessage: stkResponse.data.CustomerMessage
    }
  });
} else {
  // M-Pesa returned an error
  return res.status(400).json({
    success: false,
    message: stkResponse.data.ResponseDescription || 'Failed to initiate payment',
    data: stkResponse.data
  });
}
```

} catch (error) {
console.error(‘STK Initiate Error:’, error.response?.data || error.message);

```
// Return appropriate error message
if (error.response?.data) {
  return res.status(500).json({
    success: false,
    message: error.response.data.errorMessage || 'M-Pesa API error',
    debug: process.env.NODE_ENV === 'development' ? error.response.data : undefined
  });
}

return res.status(500).json({
  success: false,
  message: 'Failed to process payment request. Please try again.',
  debug: process.env.NODE_ENV === 'development' ? error.message : undefined
});
```

}
}
// api/stk-status.js
// Vercel Serverless Function to check M-Pesa STK Push status

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
const { checkoutRequestId } = req.body;

```
// Validate input
if (!checkoutRequestId) {
  return res.status(400).json({
    success: false,
    message: 'CheckoutRequestId is required'
  });
}

// M-Pesa Configuration (from environment variables)
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.MPESA_SHORTCODE || '174379';
const PASSKEY = process.env.MPESA_PASSKEY;
const ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox';

// Check if credentials are configured
if (!CONSUMER_KEY || !CONSUMER_SECRET || !PASSKEY) {
  return res.status(500).json({
    success: false,
    message: 'M-Pesa API not configured'
  });
}

// API URLs based on environment
const AUTH_URL = ENVIRONMENT === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
  : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

const QUERY_URL = ENVIRONMENT === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query'
  : 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

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
// STEP 3: Query STK Push Status
// ==========================================
const queryData = {
  BusinessShortCode: BUSINESS_SHORT_CODE,
  Password: password,
  Timestamp: timestamp,
  CheckoutRequestID: checkoutRequestId
};

const queryResponse = await axios.post(QUERY_URL, queryData, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

// ==========================================
// STEP 4: Process Response
// ==========================================
const resultCode = queryResponse.data.ResultCode;
let status = 'PENDING';
let message = 'Payment is still pending';

// Map M-Pesa result codes to status
if (resultCode === '0') {
  status = 'COMPLETED';
  message = 'Payment completed successfully';
} else if (resultCode === '1032') {
  status = 'FAILED';
  message = 'Payment cancelled by user';
} else if (resultCode === '1037') {
  status = 'FAILED';
  message = 'Timeout - User did not enter PIN';
} else if (resultCode === '1') {
  status = 'FAILED';
  message = 'Insufficient funds in M-Pesa account';
} else if (resultCode === '1001') {
  status = 'FAILED';
  message = 'Invalid M-Pesa PIN';
} else if (resultCode === '1019') {
  status = 'FAILED';
  message = 'Transaction expired';
} else if (resultCode === '1025') {
  status = 'FAILED';
  message = 'Wrong PIN entered too many times';
} else if (resultCode === '1036') {
  status = 'FAILED';
  message = 'User cancelled the transaction';
} else if (resultCode === '2001') {
  status = 'FAILED';
  message = 'Wrong PIN';
} else if (resultCode === '1') {
  status = 'FAILED';
  message = 'Balance insufficient';
} else if (resultCode) {
  // Any other result code means failed
  status = 'FAILED';
  message = queryResponse.data.ResultDesc || 'Payment failed';
}

return res.status(200).json({
  success: true,
  status: status,
  message: message,
  data: {
    ResultCode: resultCode,
    ResultDesc: queryResponse.data.ResultDesc,
    CheckoutRequestID: queryResponse.data.CheckoutRequestID,
    MerchantRequestID: queryResponse.data.MerchantRequestID,
    ResponseCode: queryResponse.data.ResponseCode
  }
});
```

} catch (error) {
console.error(‘STK Status Error:’, error.response?.data || error.message);

```
// If the error is because request is still pending
if (error.response?.data?.errorCode === '500.001.1001') {
  return res.status(200).json({
    success: true,
    status: 'PENDING',
    message: 'Payment request is still being processed',
    data: error.response.data
  });
}

// Return appropriate error message
if (error.response?.data) {
  return res.status(500).json({
    success: false,
    message: error.response.data.errorMessage || 'Failed to check payment status',
    debug: process.env.NODE_ENV === 'development' ? error.response.data : undefined
  });
}

return res.status(500).json({
  success: false,
  message: 'Failed to check payment status. Please try again.',
  debug: process.env.NODE_ENV === 'development' ? error.message : undefined
});
```

}
}
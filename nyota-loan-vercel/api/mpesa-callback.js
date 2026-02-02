// api/mpesa-callback.js
// Vercel Serverless Function to receive M-Pesa payment confirmations

import { createClient } from ‘@vercel/postgres’;

export default async function handler(req, res) {
// Only M-Pesa should call this endpoint
// M-Pesa doesn’t need CORS headers, but we’ll add them anyway
res.setHeader(‘Content-Type’, ‘application/json’);

// Respond to M-Pesa immediately to prevent timeout
res.status(200).json({
ResultCode: 0,
ResultDesc: ‘Success’
});

// Only accept POST requests
if (req.method !== ‘POST’) {
return;
}

try {
const callbackData = req.body;

```
// Log callback for debugging (in production, use proper logging service)
console.log('M-Pesa Callback Received:', JSON.stringify(callbackData, null, 2));

// Extract callback data
if (!callbackData?.Body?.stkCallback) {
  console.error('Invalid callback format');
  return;
}

const callback = callbackData.Body.stkCallback;
const resultCode = callback.ResultCode;
const checkoutRequestId = callback.CheckoutRequestID;
const merchantRequestId = callback.MerchantRequestID;

// Extract metadata if payment was successful
let amount = null;
let mpesaReceiptNumber = null;
let transactionDate = null;
let phoneNumber = null;

if (resultCode === 0 && callback.CallbackMetadata?.Item) {
  callback.CallbackMetadata.Item.forEach(item => {
    switch (item.Name) {
      case 'Amount':
        amount = item.Value;
        break;
      case 'MpesaReceiptNumber':
        mpesaReceiptNumber = item.Value;
        break;
      case 'TransactionDate':
        transactionDate = item.Value;
        break;
      case 'PhoneNumber':
        phoneNumber = item.Value;
        break;
    }
  });
}

// ==========================================
// SAVE TO DATABASE (Vercel Postgres)
// ==========================================
if (process.env.POSTGRES_URL) {
  try {
    const client = createClient();
    await client.connect();

    if (resultCode === 0) {
      // Payment successful - update transaction
      await client.sql`
        UPDATE mpesa_transactions
        SET 
          status = 'COMPLETED',
          mpesa_receipt = ${mpesaReceiptNumber},
          transaction_date = ${transactionDate},
          result_code = ${resultCode},
          result_desc = ${callback.ResultDesc},
          completed_at = NOW()
        WHERE checkout_request_id = ${checkoutRequestId}
      `;

      console.log(`Transaction ${checkoutRequestId} marked as COMPLETED`);

      // TODO: Trigger loan disbursement here
      // TODO: Send SMS confirmation to customer
      
    } else {
      // Payment failed - update transaction
      await client.sql`
        UPDATE mpesa_transactions
        SET 
          status = 'FAILED',
          result_code = ${resultCode},
          result_desc = ${callback.ResultDesc},
          completed_at = NOW()
        WHERE checkout_request_id = ${checkoutRequestId}
      `;

      console.log(`Transaction ${checkoutRequestId} marked as FAILED: ${callback.ResultDesc}`);
    }

    await client.end();

  } catch (dbError) {
    console.error('Database Error:', dbError);
    // Don't throw - we already responded to M-Pesa
  }
} else {
  console.warn('POSTGRES_URL not configured - callback data not saved to database');
  
  // Alternative: Store in Vercel KV, Redis, or external database
  // For now, just log it
  console.log('Callback Data:', {
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    status: resultCode === 0 ? 'COMPLETED' : 'FAILED',
    amount,
    mpesaReceiptNumber,
    phoneNumber,
    resultDesc: callback.ResultDesc
  });
}

// ==========================================
// OPTIONAL: Send webhook to external service
// ==========================================
/*
if (process.env.WEBHOOK_URL) {
  await axios.post(process.env.WEBHOOK_URL, {
    event: 'mpesa_payment',
    status: resultCode === 0 ? 'success' : 'failed',
    checkoutRequestId,
    amount,
    mpesaReceiptNumber,
    phoneNumber
  });
}
*/
```

} catch (error) {
console.error(‘Callback Processing Error:’, error);
// Don’t send error to M-Pesa - we already sent success response
}
}
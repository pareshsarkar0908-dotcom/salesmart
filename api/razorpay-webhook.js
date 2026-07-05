import crypto from 'node:crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

const PLANS = {
  starter: { amount: 29900, credits: 150 },
  growth: { amount: 99900, credits: 600 },
  pro: { amount: 249900, credits: 1800 }
};

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function signatureMatches(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return (
    Buffer.byteLength(expected) === Buffer.byteLength(signature) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

async function fetchRazorpayResource(keyId, keySecret, path) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function finalizePayment(supabaseUrl, serviceKey, payload) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_payment_atomic`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error('Webhook payment finalization RPC failed', response.status, data?.message || '');
    throw new Error('Payment finalization failed');
  }
  const rows = await response.json().catch(() => []);
  return rows?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookSecret || !keyId || !keySecret || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rawBody = await readRawBody(req);
  const signature = String(req.headers['x-razorpay-signature'] || '');
  if (!signatureMatches(rawBody, signature, webhookSecret)) {
    return res.status(400).json({ error: 'Webhook signature is invalid' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Webhook payload is invalid' });
  }
  if (event.event !== 'payment.captured') {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const webhookPayment = event.payload?.payment?.entity || {};
  const paymentId = String(webhookPayment.id || '').slice(0, 100);
  const orderId = String(webhookPayment.order_id || '').slice(0, 100);
  if (!paymentId || !orderId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    const [order, payment] = await Promise.all([
      fetchRazorpayResource(keyId, keySecret, `orders/${encodeURIComponent(orderId)}`),
      fetchRazorpayResource(keyId, keySecret, `payments/${encodeURIComponent(paymentId)}`)
    ]);
    if (!order || !payment) {
      return res.status(502).json({ error: 'Could not confirm payment with Razorpay' });
    }

    const planKey = String(order.notes?.plan || '');
    const plan = PLANS[planKey];
    const userId = String(order.notes?.user_id || '');
    const email = String(order.notes?.email || '').toLowerCase();
    const paymentMatches =
      payment.id === paymentId &&
      payment.order_id === orderId &&
      payment.status === 'captured' &&
      payment.currency === 'INR' &&
      Number(payment.amount) === plan?.amount &&
      Number(order.amount) === plan?.amount &&
      order.currency === 'INR';

    if (!plan || !userId || !email || !paymentMatches) {
      return res.status(400).json({ error: 'Payment details do not match a valid SaleSmart order' });
    }

    const result = await finalizePayment(supabaseUrl, serviceKey, {
      p_user_id: userId,
      p_email: email,
      p_plan: planKey,
      p_amount: Math.round(plan.amount / 100),
      p_credits: plan.credits,
      p_payment_id: paymentId,
      p_order_id: orderId
    });
    if (!result) throw new Error('Empty finalization result');

    return res.status(200).json({
      ok: true,
      processed: Boolean(result.processed),
      balance: Number(result.balance || 0)
    });
  } catch (error) {
    console.error('razorpay-webhook failed', error);
    return res.status(500).json({ error: 'Could not process webhook' });
  }
}

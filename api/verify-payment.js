import crypto from 'node:crypto';

const PLANS = {
  starter: { amount: 29900, credits: 150 },
  growth: { amount: 99900, credits: 600 },
  pro: { amount: 249900, credits: 1800 }
};

async function verifyToken(supabaseUrl, serviceKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
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
    console.error('Payment finalization RPC failed', response.status, data?.message || '');
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

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !keyId || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const user = await verifyToken(supabaseUrl, serviceKey, token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });

  const orderId = String(req.body?.razorpay_order_id || '').slice(0, 100);
  const paymentId = String(req.body?.razorpay_payment_id || '').slice(0, 100);
  const signature = String(req.body?.razorpay_signature || '').slice(0, 200);
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Payment verification fields are missing' });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const verified =
    Buffer.byteLength(expected) === Buffer.byteLength(signature) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!verified) {
    return res.status(400).json({ error: 'Payment signature is invalid', verified: false });
  }

  try {
    const [order, payment] = await Promise.all([
      fetchRazorpayResource(keyId, secret, `orders/${encodeURIComponent(orderId)}`),
      fetchRazorpayResource(keyId, secret, `payments/${encodeURIComponent(paymentId)}`)
    ]);
    if (!order || !payment) {
      return res.status(502).json({ error: 'Could not confirm payment with Razorpay' });
    }

    const planKey = String(order.notes?.plan || '');
    const plan = PLANS[planKey];
    const ownerMatches =
      String(order.notes?.user_id || '') === user.id &&
      String(order.notes?.email || '').toLowerCase() === user.email.toLowerCase();
    const paymentMatches =
      payment.order_id === orderId &&
      payment.status === 'captured' &&
      payment.currency === 'INR' &&
      Number(payment.amount) === plan?.amount &&
      Number(order.amount) === plan?.amount &&
      order.currency === 'INR';

    if (!plan || !ownerMatches || !paymentMatches) {
      return res.status(400).json({ error: 'Payment details do not match this account or plan' });
    }

    const result = await finalizePayment(supabaseUrl, serviceKey, {
      p_user_id: user.id,
      p_email: user.email,
      p_plan: planKey,
      p_amount: Math.round(plan.amount / 100),
      p_credits: plan.credits,
      p_payment_id: paymentId,
      p_order_id: orderId
    });
    if (!result) throw new Error('Empty finalization result');

    return res.status(200).json({
      ok: true,
      verified: true,
      processed: Boolean(result.processed),
      balance: Number(result.balance || 0),
      message: result.processed ? 'Payment credited' : 'Payment was already credited'
    });
  } catch (error) {
    console.error('verify-payment failed', error);
    return res.status(500).json({ error: 'Could not finalize payment' });
  }
}

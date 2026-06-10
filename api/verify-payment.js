import crypto from 'node:crypto';

const PLANS = {
  starter: { amount: 29900, credits: 150, name: 'Starter Pack' },
  growth:  { amount: 99900, credits: 600, name: 'Growth Pack' },
  pro:     { amount: 249900, credits: 1800, name: 'Pro Pack' }
};

async function verifyToken(supabaseUrl, serviceKey, token) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.email ? user : null;
}

async function fetchRazorpayOrder(keyId, keySecret, orderId) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function addCreditsAndRecordOrder(supabaseUrl, serviceKey, email, planKey, plan, razorpayPaymentId, razorpayOrderId) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/credits?email=eq.${encodeURIComponent(email)}&select=balance&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await selectRes.json().catch(() => []);
  const currentBalance = rows?.[0]?.balance ?? 0;
  const newBalance = currentBalance + plan.credits;

  await fetch(
    `${supabaseUrl}/rest/v1/credits?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() })
    }
  );

  if (!rows?.length) {
    await fetch(`${supabaseUrl}/rest/v1/credits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, balance: plan.credits, updated_at: new Date().toISOString() })
    });
  }

  await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      email,
      plan: planKey,
      amount: Math.round(plan.amount / 100),
      credits: plan.credits,
      status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId
    })
  });

  return newBalance;
}

export default async function handler(req, res) {
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

  const orderId   = String(req.body?.razorpay_order_id  || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature  || '');

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

  const razorpayOrder = await fetchRazorpayOrder(keyId, secret, orderId);
  if (!razorpayOrder) {
    return res.status(502).json({ error: 'Could not fetch order details from Razorpay' });
  }

  const planKey = String(razorpayOrder.notes?.plan || '');
  const plan = PLANS[planKey];
  if (!plan) {
    return res.status(400).json({ error: 'Unknown plan in order' });
  }

  try {
    const newBalance = await addCreditsAndRecordOrder(
      supabaseUrl, serviceKey,
      user.email, planKey, plan,
      paymentId, orderId
    );
    return res.status(200).json({ ok: true, verified: true, balance: newBalance });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not finalize payment' });
  }
}

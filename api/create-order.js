import crypto from 'node:crypto';

const PLANS = {
  starter: { amount: 299, credits: 150 },
  growth: { amount: 999, credits: 600 },
  pro: { amount: 2499, credits: 1800 }
};

async function verifyToken(supabaseUrl, serviceKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
}

async function checkRateLimit(supabaseUrl, serviceKey, userId) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_subject_key: userId,
      p_route: 'create-order',
      p_limit: 10,
      p_window_seconds: 600
    })
  });
  if (!response.ok) throw new Error('Rate-limit service unavailable');
  const rows = await response.json().catch(() => []);
  return rows?.[0] || { allowed: false, retry_after: 60 };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!keyId || !keySecret || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const user = await verifyToken(supabaseUrl, serviceKey, token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });

  const planKey = String(req.body?.plan || '');
  const plan = PLANS[planKey];
  const name = String(req.body?.customer?.name || '').trim().slice(0, 100);
  const phone = String(req.body?.customer?.phone || '').replace(/[^\d+ -]/g, '').slice(0, 20);

  if (!plan) return res.status(400).json({ error: 'Invalid plan' });
  if (!name || !phone) {
    return res.status(400).json({ error: 'Customer name and phone are required' });
  }

  try {
    const limit = await checkRateLimit(supabaseUrl, serviceKey, user.id);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retry_after || 60));
      return res.status(429).json({ error: 'Too many checkout attempts. Please try again shortly.' });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: plan.amount * 100,
        currency: 'INR',
        receipt: `sm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        notes: {
          plan: planKey,
          user_id: user.id,
          email: user.email.toLowerCase(),
          credits: String(plan.credits)
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Razorpay order creation failed', response.status, data?.error?.code || '');
      return res.status(502).json({ error: 'Could not create payment order' });
    }

    return res.status(200).json({
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      credits: plan.credits
    });
  } catch (error) {
    console.error('create-order failed', error);
    return res.status(500).json({ error: 'Could not create payment order' });
  }
}

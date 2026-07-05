const TRIAL_CREDITS = 10;

async function verifyToken(supabaseUrl, serviceKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
}

async function callRpc(supabaseUrl, serviceKey, name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error(`${name} RPC failed`, response.status, data?.message || '');
    throw new Error(`${name} failed`);
  }
  return response.json().catch(() => []);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const user = await verifyToken(supabaseUrl, serviceKey, token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const rateRows = await callRpc(supabaseUrl, serviceKey, 'check_rate_limit', {
      p_subject_key: user.id,
      p_route: 'grant-trial',
      p_limit: 5,
      p_window_seconds: 3600
    });
    const limit = rateRows?.[0];
    if (!limit?.allowed) {
      res.setHeader('Retry-After', String(limit?.retry_after || 60));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const rows = await callRpc(supabaseUrl, serviceKey, 'grant_trial_atomic', {
      p_user_id: user.id,
      p_email: user.email,
      p_credits: TRIAL_CREDITS
    });
    const result = rows?.[0] || { granted: false, balance: 0 };
    return res.status(200).json({
      granted: Boolean(result.granted),
      balance: Number(result.balance || 0),
      message: result.granted ? 'Trial activated' : 'Trial already claimed'
    });
  } catch (error) {
    console.error('grant-trial failed', error);
    return res.status(500).json({ error: 'Could not activate trial' });
  }
}

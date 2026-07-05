async function verifyToken(supabaseUrl, serviceKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email ? user : null;
}

async function callRpc(supabaseUrl, serviceKey, name, body = {}) {
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
  return response.json().catch(() => null);
}

function isAuthorizedAdmin(user) {
  const allowedIds = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowedEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return allowedIds.includes(user.id) || allowedEmails.includes(user.email.toLowerCase());
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
  if (!isAuthorizedAdmin(user)) return res.status(403).json({ error: 'Admin access required' });

  try {
    const rateRows = await callRpc(supabaseUrl, serviceKey, 'check_rate_limit', {
      p_subject_key: user.id,
      p_route: 'admin-summary',
      p_limit: 30,
      p_window_seconds: 60
    });
    const limit = rateRows?.[0];
    if (!limit?.allowed) {
      res.setHeader('Retry-After', String(limit?.retry_after || 60));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    const summary = await callRpc(supabaseUrl, serviceKey, 'admin_dashboard_summary');
    return res.status(200).json(summary || { totals: {}, orders: [] });
  } catch (error) {
    console.error('admin-summary failed', error);
    return res.status(500).json({ error: 'Could not load admin dashboard' });
  }
}

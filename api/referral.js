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

  const action = String(req.body?.action || '').trim();

  try {
    if (action === 'code') {
      const code = await callRpc(supabaseUrl, serviceKey, 'get_or_create_referral_code', {
        p_user_id: user.id
      });
      return res.status(200).json({ code });
    }

    if (action === 'claim') {
      const code = String(req.body?.code || '').trim().slice(0, 32);
      if (!code) return res.status(400).json({ error: 'Missing referral code' });
      const rows = await callRpc(supabaseUrl, serviceKey, 'apply_referral_welcome', {
        p_referred_user_id: user.id,
        p_referred_email: user.email,
        p_code: code
      });
      const result = rows?.[0] || {};
      return res.status(200).json({
        success: !!result.success,
        balance: result.balance,
        message: result.message || ''
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('referral failed', error);
    return res.status(500).json({ error: 'Referral request failed' });
  }
}

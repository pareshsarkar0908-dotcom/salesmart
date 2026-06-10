const TRIAL_CREDITS = 10;

async function verifyToken(supabaseUrl, serviceKey, token) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.email ? user : null;
}

export default async function handler(req, res) {
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

  const email = user.email;
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  const trialRes = await fetch(
    `${supabaseUrl}/rest/v1/orders?email=eq.${encodeURIComponent(email)}&status=eq.trial&select=id&limit=1`,
    { headers: dbHeaders }
  );
  const trialRows = await trialRes.json().catch(() => []);
  if (Array.isArray(trialRows) && trialRows.length) {
    const creditRes = await fetch(
      `${supabaseUrl}/rest/v1/credits?email=eq.${encodeURIComponent(email)}&select=balance&limit=1`,
      { headers: dbHeaders }
    );
    const creditRows = await creditRes.json().catch(() => []);
    const balance = creditRows?.[0]?.balance ?? 0;
    return res.status(200).json({ granted: false, balance, message: 'Trial already claimed' });
  }

  const creditRes = await fetch(
    `${supabaseUrl}/rest/v1/credits?email=eq.${encodeURIComponent(email)}&select=balance&limit=1`,
    { headers: dbHeaders }
  );
  const creditRows = await creditRes.json().catch(() => []);
  const currentBalance = creditRows?.[0]?.balance ?? 0;
  const hasExistingRow = Array.isArray(creditRows) && creditRows.length > 0;

  if (hasExistingRow) {
    await fetch(
      `${supabaseUrl}/rest/v1/credits?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ balance: currentBalance + TRIAL_CREDITS, updated_at: new Date().toISOString() })
      }
    );
  } else {
    await fetch(`${supabaseUrl}/rest/v1/credits`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ email, balance: TRIAL_CREDITS, updated_at: new Date().toISOString() })
    });
  }

  await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: 'POST',
    headers: { ...dbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      email, plan: 'trial', amount: 0, credits: TRIAL_CREDITS, status: 'trial'
    })
  });

  return res.status(200).json({
    granted: true,
    balance: currentBalance + TRIAL_CREDITS,
    message: 'Trial activated'
  });
}

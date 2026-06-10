import crypto from 'node:crypto';

const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_ATTEMPTS) return true;
  entry.count += 1;
  attempts.set(ip, entry);
  return false;
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminPassword || !password || !timingSafeEqual(password, adminPassword)) {
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    return res.status(401).json({ error: 'Unauthorized' });
  }

  clearAttempts(ip);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase admin environment variables are missing' });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  const fetchTable = async (table, query = '') => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, { headers });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.message || `Could not load ${table}`);
    return Array.isArray(data) ? data : [];
  };

  try {
    const [orders, credits] = await Promise.all([
      fetchTable('orders', '?select=email,plan,amount,credits,status,created_at&order=created_at.desc&limit=50'),
      fetchTable('credits', '?select=email,balance')
    ]);

    const paidOrders = orders.filter(order => order.status === 'paid');
    const revenue = paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const totalCredits = credits.reduce((sum, row) => sum + Number(row.balance || 0), 0);

    return res.status(200).json({
      totals: {
        users: credits.length,
        credits: totalCredits,
        orders: orders.length,
        revenue
      },
      orders
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Admin request failed' });
  }
}

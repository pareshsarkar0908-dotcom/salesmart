export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

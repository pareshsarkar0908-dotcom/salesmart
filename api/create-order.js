const PLANS = {
  starter: { amount: 299, credits: 150 },
  growth: { amount: 999, credits: 600 },
  pro: { amount: 2499, credits: 1800 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: 'Razorpay environment variables are missing' });
  }

  const planKey = String(req.body?.plan || '');
  const plan = PLANS[planKey];
  const email = String(req.body?.customer?.email || '').trim();

  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  if (!email) {
    return res.status(400).json({ error: 'Customer email is required' });
  }

  try {
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
        receipt: `salesmart_${planKey}_${Date.now()}`,
        notes: { plan: planKey, email, credits: String(plan.credits) }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.description || data?.error?.reason || 'Could not create payment order'
      });
    }

    return res.status(200).json({
      keyId,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      credits: plan.credits
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not create payment order' });
  }
}

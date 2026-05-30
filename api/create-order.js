const PLANS = {
  starter: { name: "Starter Pack", amount: 29900, credits: 50 },
  growth: { name: "Growth Pack", amount: 99900, credits: 200 },
  pro: { name: "Pro Pack", amount: 249900, credits: 600 }
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay keys are not configured" });
    }

    const { plan: planKey = "starter" } = req.body || {};
    const plan = PLANS[planKey];

    if (!plan) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: plan.amount,
        currency: "INR",
        receipt: `salesmart_${planKey}_${Date.now()}`,
        notes: {
          plan: plan.name,
          credits: String(plan.credits)
        }
      })
    });

    const order = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: order.error?.description || "Could not create Razorpay order"
      });
    }

    return res.status(200).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.name,
      credits: plan.credits
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
};

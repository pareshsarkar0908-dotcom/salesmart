// SaleSmart AI - Seller fee, profit & RTO calculator for all marketplaces.
// Client-side, no credits. Estimates based on 2026 rate cards (incl. Amazon &
// Flipkart 0% referral under Rs 1,000, Meesho 0% commission, Flipkart fashion
// 0%). Real fees vary by category and account - confirm in your seller panel.
(function () {
  const PLATFORMS = {
    'Amazon India':  { factor: 1.0 },
    'Flipkart':      { factor: 1.0 },
    'Meesho':        { factor: 0 },
    'JioMart':       { factor: 0.8 },
    'Myntra':        { factor: 1.3 },
    'Ajio':          { factor: 1.3 },
    'Nykaa':         { factor: 1.3 },
    'Tata CLiQ':     { factor: 1.1 },
    'Snapdeal':      { factor: 0.85 },
    'IndiaMART':     { factor: 0.25 },
    'BigBasket':     { factor: 1.0 },
    'Blinkit':       { factor: 1.1 },
    'Zepto':         { factor: 1.1 },
    'FirstCry':      { factor: 1.2 },
    'Pepperfry':     { factor: 1.3 },
    'Shopify':       { ownStore: true },
    'WooCommerce':   { ownStore: true },
    'Etsy':          { factor: 0.55 },
    'eBay':          { factor: 1.0 },
    'Walmart':       { factor: 1.0 },
    'Amazon Global': { factor: 1.2 }
  };

  // Generic base commission % per category (used by non-big-3 platforms).
  const CATEGORIES = {
    'Fashion & Apparel': 15,
    'Electronics': 8,
    'Home & Kitchen': 13,
    'Beauty & Personal Care': 18,
    'Grocery & Gourmet': 10,
    'Books & Stationery': 12,
    'Toys & Baby': 14,
    'Sports & Fitness': 13,
    'Jewellery & Accessories': 16,
    'Health & Wellness': 15,
    'Other': 12
  };

  // Category commission % above the zero-fee threshold, tuned per big-3 platform.
  const AMAZON = { 'Fashion & Apparel': 17, 'Electronics': 8, 'Home & Kitchen': 12,
    'Beauty & Personal Care': 15, 'Grocery & Gourmet': 6, 'Books & Stationery': 9,
    'Toys & Baby': 12, 'Sports & Fitness': 13, 'Jewellery & Accessories': 15,
    'Health & Wellness': 15, 'Other': 12 };
  const FLIPKART = { 'Fashion & Apparel': 0, 'Electronics': 8, 'Home & Kitchen': 12,
    'Beauty & Personal Care': 15, 'Grocery & Gourmet': 8, 'Books & Stationery': 10,
    'Toys & Baby': 12, 'Sports & Fitness': 12, 'Jewellery & Accessories': 20,
    'Health & Wellness': 14, 'Other': 12 };

  const ZERO_FEE_UNDER = 1000; // Amazon + Flipkart: 0% referral below this price
  const OWN_STORE_FEE = 2;     // % payment gateway for Shopify/WooCommerce
  const GST = 18;              // % GST on marketplace fees

  function shipBase(grams) {
    if (grams <= 500) return 45;
    if (grams <= 1000) return 65;
    if (grams <= 2000) return 95;
    if (grams <= 5000) return 150;
    return 150 + Math.ceil((grams - 5000) / 1000) * 22;
  }
  const ZONES = { 'Local': 1.0, 'Regional': 1.35, 'National': 1.7 };

  function commissionPct(platform, category, price) {
    const p = PLATFORMS[platform] || { factor: 1 };
    if (platform === 'Meesho') return 0;
    if (p.ownStore) return OWN_STORE_FEE;
    if (platform === 'Amazon India') {
      if (price < ZERO_FEE_UNDER) return 0;
      return AMAZON[category] != null ? AMAZON[category] : 12;
    }
    if (platform === 'Flipkart') {
      if (category === 'Fashion & Apparel') return 0;      // fashion always 0%
      if (price < ZERO_FEE_UNDER) return 0;
      return FLIPKART[category] != null ? FLIPKART[category] : 12;
    }
    return Math.round((CATEGORIES[category] || 12) * p.factor * 10) / 10;
  }

  // Fixed / closing fee (value-based) for Amazon & Flipkart.
  function fixedFee(platform, price) {
    if (platform === 'Flipkart') return price <= 300 ? 15 : price <= 750 ? 30 : 45;
    if (platform === 'Amazon India') return price < 500 ? 20 : price <= 1000 ? 30 : 45;
    return 0;
  }
  // Collection fee: Flipkart ~2% of order value.
  function collectionFee(platform, price) {
    return platform === 'Flipkart' ? price * 0.02 : 0;
  }

  const $ = id => document.getElementById(id);
  const inr = n => '₹' + (isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = v => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; };
  function out(id, txt, cls) { const n = $(id); if (!n) return; n.textContent = txt; if (cls !== undefined) n.className = cls; }

  function calc() {
    const price = num($('fcPrice').value);
    const cogs = num($('fcCost').value);
    const platform = $('fcPlatform').value;
    const category = $('fcCategory').value;
    const grams = num($('fcWeight').value);
    const zone = $('fcZone').value;
    const packaging = num($('fcPackaging').value);
    const rtoOn = $('fcRtoToggle').checked;

    const pct = commissionPct(platform, category, price);
    const commission = price * pct / 100;
    const fixed = fixedFee(platform, price);
    const collection = collectionFee(platform, price);
    const forwardShip = Math.round(shipBase(grams) * (ZONES[zone] || 1));
    const feeBase = commission + fixed + collection + forwardShip;
    const gstOnFees = feeBase * GST / 100;
    const rtoCost = rtoOn ? Math.round(forwardShip * 1.8) : 0;

    const deductions = commission + fixed + collection + forwardShip + gstOnFees + rtoCost;
    const totalFees = deductions + packaging;
    const settlement = price - deductions;
    const netPayout = price - (deductions - rtoCost);
    const profit = settlement - cogs - packaging;
    const profitPct = price > 0 ? (profit / price) * 100 : 0;

    out('fcNetPayout', inr(netPayout));
    out('fcTotalFees', inr(totalFees));
    out('fcProfit', inr(profit), 'fc-big ' + (profit >= 0 ? 'fc-pos' : 'fc-neg'));
    out('fcProfitPct', (price > 0 ? profitPct.toFixed(1) : '0.0') + '%', 'fc-big ' + (profit >= 0 ? 'fc-pos' : 'fc-neg'));

    out('fcRowShip', inr(forwardShip));
    out('fcRowCommission', inr(commission));
    out('fcCommissionPct', pct + '%');
    out('fcRowFixed', inr(fixed + collection));
    out('fcRowGst', inr(gstOnFees));
    out('fcRowRto', rtoOn ? '−' + inr(rtoCost).slice(1) : inr(0));
    out('fcRowPackaging', inr(packaging));
    out('fcRowFees', inr(totalFees));
    out('fcRowSettlement', inr(settlement));
  }

  function init() {
    if (!$('fcPlatform')) return;
    const POPULAR = ['Amazon India', 'Flipkart', 'Meesho'];
    const gPop = document.createElement('optgroup'); gPop.label = 'Most used in India';
    const gOther = document.createElement('optgroup'); gOther.label = 'More marketplaces';
    Object.keys(PLATFORMS).forEach(name => {
      const o = document.createElement('option'); o.value = name; o.textContent = name;
      (POPULAR.includes(name) ? gPop : gOther).appendChild(o);
    });
    $('fcPlatform').append(gPop, gOther);
    Object.keys(CATEGORIES).forEach(name => {
      const o = document.createElement('option'); o.value = name; o.textContent = name; $('fcCategory').appendChild(o);
    });
    $('fcPlatform').value = 'Amazon India';
    ['fcPrice','fcCost','fcWeight','fcPackaging'].forEach(id => $(id).addEventListener('input', calc));
    ['fcPlatform','fcCategory','fcZone'].forEach(id => $(id).addEventListener('change', calc));
    $('fcRtoToggle').addEventListener('change', calc);
    calc();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

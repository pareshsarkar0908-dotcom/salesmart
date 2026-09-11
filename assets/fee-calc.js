// SaleSmart AI - Seller fee, profit & RTO calculator for all marketplaces.
// Client-side, no credits. All fees are editable estimates; real rate cards
// vary by category, weight, zone and account. For guidance only.
(function () {
  // Platforms: factor scales category commission; ownStore uses a flat payment fee.
  const PLATFORMS = {
    'Amazon India':  { factor: 1.0 },
    'Flipkart':      { factor: 1.0 },
    'Meesho':        { factor: 0.15 },
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

  // Base category commission % (before platform factor).
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

  // Forward shipping base (INR) by weight slab, before zone multiplier.
  function shipBase(grams) {
    if (grams <= 500) return 45;
    if (grams <= 1000) return 65;
    if (grams <= 2000) return 95;
    if (grams <= 5000) return 150;
    return 150 + Math.ceil((grams - 5000) / 1000) * 22;
  }
  const ZONES = { 'Local': 1.0, 'Regional': 1.35, 'National': 1.7 };
  const OWN_STORE_FEE = 2;   // % payment gateway for Shopify/WooCommerce
  const GST = 18;            // % GST on marketplace fees

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

    const p = PLATFORMS[platform] || { factor: 1 };
    let commissionPct;
    if (p.ownStore) commissionPct = OWN_STORE_FEE;
    else commissionPct = Math.round((CATEGORIES[category] || 12) * p.factor * 10) / 10;

    const commission = price * commissionPct / 100;
    const forwardShip = Math.round(shipBase(grams) * (ZONES[zone] || 1));
    const gstOnFees = (commission + forwardShip) * GST / 100;
    const rtoCost = rtoOn ? Math.round(forwardShip * 1.8) : 0;

    const totalFees = commission + forwardShip + gstOnFees + rtoCost + packaging;
    const settlement = price - commission - forwardShip - gstOnFees - rtoCost;
    const netPayout = price - commission - forwardShip - gstOnFees;
    const profit = settlement - cogs - packaging;
    const profitPct = price > 0 ? (profit / price) * 100 : 0;

    out('fcNetPayout', inr(netPayout));
    out('fcTotalFees', inr(totalFees));
    out('fcProfit', inr(profit), 'fc-big ' + (profit >= 0 ? 'fc-pos' : 'fc-neg'));
    out('fcProfitPct', (price > 0 ? profitPct.toFixed(1) : '0.0') + '%', 'fc-big ' + (profit >= 0 ? 'fc-pos' : 'fc-neg'));

    out('fcRowShip', inr(forwardShip));
    out('fcRowCommission', inr(commission));
    out('fcCommissionPct', commissionPct + '%');
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

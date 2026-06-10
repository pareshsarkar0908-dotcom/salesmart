const CONFIG = {
  supabaseUrl: window.SALESMART_SUPABASE_URL || '',
  supabaseAnonKey: window.SALESMART_SUPABASE_ANON_KEY || '',
  razorpayKeyId: window.SALESMART_RAZORPAY_KEY_ID || ''
};

const CREDIT_KEY = 'salesmart_credit_balance';
const EMAIL_KEY  = 'salesmart_current_email';
const NAME_KEY   = 'salesmart_current_name';
let supabaseClient = null;

const PLANS = {
  trial:   { name: 'Free Trial',    amount: 0,    credits: 10,   label: 'INR 0' },
  starter: { name: 'Starter Pack',  amount: 299,  credits: 150,  label: 'INR 299' },
  growth:  { name: 'Growth Pack',   amount: 999,  credits: 600,  label: 'INR 999' },
  pro:     { name: 'Pro Pack',      amount: 2499, credits: 1800, label: 'INR 2499' }
};

function hasRealValue(value, blocked = []) {
  const clean = String(value || '').trim();
  return !!clean && !blocked.some(item => clean.includes(item));
}
function hasSupabaseConfig() {
  return hasRealValue(CONFIG.supabaseUrl, ['your-project']) &&
    hasRealValue(CONFIG.supabaseAnonKey, ['your_key_here']);
}
function hasRazorpayConfig() {
  return hasRealValue(CONFIG.razorpayKeyId, ['test_or_live_key_id']);
}
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function getEmail()  { return localStorage.getItem(EMAIL_KEY) || ''; }
function setEmail(e) { const c = normalizeEmail(e); if (c) localStorage.setItem(EMAIL_KEY, c); }
function getName()   { return localStorage.getItem(NAME_KEY) || ''; }
function setName(n)  { const c = String(n || '').trim(); if (c) localStorage.setItem(NAME_KEY, c); }
function getCredits() { return Math.max(0, parseInt(localStorage.getItem(CREDIT_KEY) || '0', 10) || 0); }
function setCredits(v) { localStorage.setItem(CREDIT_KEY, String(Math.max(0, Number(v) || 0))); updateChrome(); }

async function getSessionToken() {
  if (!supabaseClient) return '';
  const { data } = await supabaseClient.auth.getSession().catch(() => ({ data: null }));
  return data?.session?.access_token || '';
}

function show(id, msg, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'notice show' + (type ? ' ' + type : '');
}

function emptyTable(tbody, colspan, message) {
  tbody.textContent = '';
  const row  = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan   = colspan;
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value == null ? '' : String(value);
  row.appendChild(cell);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function cleanAIText(text) {
  return String(text || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}/g, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trackPurchase(planKey, plan) {
  if (typeof window.gtag !== 'function') return;
  const transactionId = 'salesmart_' + Date.now();
  window.gtag('event', 'conversion', {
    send_to: 'AW-18200043019/aJi4CNq5y7YcEIu8uuZD',
    value: Number(plan?.amount || 0),
    currency: 'INR',
    transaction_id: transactionId
  });
  window.gtag('event', 'purchase', {
    send_to: 'AW-18200043019',
    transaction_id: transactionId,
    value: Number(plan?.amount || 0),
    currency: 'INR',
    items: [{ item_id: planKey, item_name: plan?.name || planKey, quantity: 1, price: Number(plan?.amount || 0) }]
  });
}

function initSupabase() {
  if (window.supabase && hasSupabaseConfig()) {
    supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }
}

function updateChrome() {
  const email   = getEmail();
  const credits = getCredits();
  document.querySelectorAll('[data-auth="in"]').forEach(el  => el.style.display = email ? '' : 'none');
  document.querySelectorAll('[data-auth="out"]').forEach(el => el.style.display = email ? 'none' : '');
  document.querySelectorAll('[data-credit]').forEach(el  => el.textContent = credits.toLocaleString('en-IN'));
  document.querySelectorAll('[data-email]').forEach(el   => el.textContent = email || 'Not signed in');
  document.querySelectorAll('[data-name]').forEach(el    => el.textContent = getName() || 'Seller');
  const checkoutEmail = document.getElementById('checkoutEmail');
  if (checkoutEmail) {
    checkoutEmail.readOnly = !!email;
    if (email) checkoutEmail.value = email;
  }
  const checkoutName = document.getElementById('checkoutName');
  if (checkoutName && getName() && !checkoutName.value) checkoutName.value = getName();
  updateToolCreditPanel();
}

function toggleMobileMenu()  { document.getElementById('mobileDrawer')?.classList.toggle('open'); }
function closeMobileMenu()   { document.getElementById('mobileDrawer')?.classList.remove('open'); }

async function loadCredits() {
  if (!supabaseClient || !getEmail()) return;
  const token = await getSessionToken();
  if (!token) return;
  const { data, error } = await supabaseClient
    .from('credits')
    .select('balance')
    .eq('email', getEmail())
    .limit(1);
  if (!error && typeof data?.[0]?.balance === 'number') {
    setCredits(data[0].balance);
  }
}

async function signup() {
  const name     = document.getElementById('signupName')?.value.trim();
  const email    = document.getElementById('signupEmail')?.value.trim();
  const password = document.getElementById('signupPassword')?.value.trim();
  if (!name || !email || !password) return show('signupNote', 'Enter name, email, and password.', 'bad');
  if (password.length < 8) return show('signupNote', 'Password must be at least 8 characters.', 'bad');
  if (!supabaseClient) return show('signupNote', 'Supabase is not connected.', 'bad');
  show('signupNote', 'Creating your account...');
  try {
    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return show('signupNote', error.message, 'bad');
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CREDIT_KEY);
    updateChrome();
    show('signupNote', 'Account created. Please log in with your email and password.', 'good');
    setTimeout(() => { location.href = 'account.html'; }, 1200);
  } catch (error) {
    show('signupNote', error.message || 'Could not create account. Please try again.', 'bad');
  }
}

async function login() {
  const email    = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value.trim();
  if (!email || !password) return show('loginNote', 'Enter email and password.', 'bad');
  if (!supabaseClient) return show('loginNote', 'Supabase is not connected.', 'bad');
  show('loginNote', 'Logging in...');
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return show('loginNote', error.message || 'Invalid login credentials.', 'bad');
    setEmail(email);
    setName(data?.user?.user_metadata?.full_name || getName());
    await loadCredits();
    const trialResult = await grantAutomaticTrial();
    updateChrome();
    show('loginNote', trialResult?.granted ? 'Logged in. 10 free trial credits added.' : 'Logged in. Your account dashboard is ready.', 'good');
  } catch (error) {
    show('loginNote', error.message || 'Login failed. Please try again.', 'bad');
  }
}

async function sendPasswordReset() {
  const email = document.getElementById('loginEmail')?.value.trim();
  if (!email) return show('loginNote', 'Enter your email first, then click forgot password.', 'bad');
  if (!supabaseClient) return show('loginNote', 'Supabase is not connected.', 'bad');
  show('loginNote', 'Sending password reset email...');
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}?reset=1`
    });
    if (error) return show('loginNote', error.message, 'bad');
    show('loginNote', 'Password reset email sent. Open the email link to create a new password.', 'good');
  } catch (error) {
    show('loginNote', error.message || 'Could not send reset email. Please try again.', 'bad');
  }
}

async function updatePassword() {
  const password = document.getElementById('newPassword')?.value.trim();
  if (!password) return show('resetNote', 'Enter your new password.', 'bad');
  if (password.length < 8) return show('resetNote', 'Password must be at least 8 characters.', 'bad');
  if (!supabaseClient) return show('resetNote', 'Supabase is not connected.', 'bad');
  show('resetNote', 'Updating password...');
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) return show('resetNote', error.message, 'bad');
    await supabaseClient.auth.signOut().catch(() => null);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CREDIT_KEY);
    show('resetNote', 'Password updated. Please log in with your new password.', 'good');
    setTimeout(() => { location.href = 'account.html'; }, 1400);
  } catch (error) {
    show('resetNote', error.message || 'Could not update password. Please try again.', 'bad');
  }
}

function initPasswordReset() {
  const isReset = location.search.includes('reset=1') || location.hash.includes('type=recovery');
  const panel   = document.getElementById('resetPanel');
  if (!isReset || !panel) return;
  panel.style.display = '';
  document.querySelectorAll('[data-auth="out"], [data-auth="in"]').forEach(el => {
    if (el.closest('#resetPanel')) return;
    el.style.display = 'none';
  });
}

async function createOrLoginCheckoutAccount(name, email, password) {
  if (getEmail()) return true;
  if (!name || !email || !password) {
    show('checkoutNote', 'Enter name, email, and password to create your account.', 'bad');
    return false;
  }
  if (password.length < 8) {
    show('checkoutNote', 'Password must be at least 8 characters.', 'bad');
    return false;
  }
  if (!supabaseClient) {
    show('checkoutNote', 'Supabase is not connected.', 'bad');
    return false;
  }
  show('checkoutNote', 'Creating your account...');
  const signupResult = await supabaseClient.auth.signUp({
    email, password, options: { data: { full_name: name } }
  });
  if (signupResult.error) {
    const loginResult = await supabaseClient.auth.signInWithPassword({ email, password });
    if (loginResult.error) {
      show('checkoutNote', signupResult.error.message || loginResult.error.message, 'bad');
      return false;
    }
    setName(loginResult.data?.user?.user_metadata?.full_name || name);
  } else {
    setName(name);
  }
  setEmail(email);
  await loadCredits();
  await grantAutomaticTrial();
  updateChrome();
  return true;
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut().catch(() => null);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(CREDIT_KEY);
  updateChrome();
  location.href = 'account.html';
}

async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;
  const email = getEmail();
  if (!email) { emptyTable(tbody, 6, 'Log in to view your orders.'); return; }
  if (!supabaseClient) { emptyTable(tbody, 6, 'Supabase is not connected.'); return; }
  const result = await supabaseClient
    .from('orders')
    .select('created_at,plan,amount,credits,status,razorpay_payment_id,razorpay_order_id')
    .eq('email', email)
    .order('created_at', { ascending: false });
  if (result.error) { emptyTable(tbody, 6, 'Could not load orders.'); return; }
  const rows = result.data || [];
  if (!rows.length) { emptyTable(tbody, 6, 'No orders yet.'); return; }
  tbody.textContent = '';
  rows.forEach(item => {
    const row = document.createElement('tr');
    appendCell(row, formatDate(item.created_at));
    appendCell(row, item.plan || '');
    appendCell(row, 'INR ' + (item.amount || 0));
    appendCell(row, item.credits || 0);
    appendCell(row, item.status || '');
    appendCell(row, item.razorpay_payment_id || item.razorpay_order_id || '');
    tbody.appendChild(row);
  });
}

async function loadAdmin() {
  const password = document.getElementById('adminPassword')?.value.trim();
  if (!password) return show('adminNote', 'Enter admin password.', 'bad');
  show('adminNote', 'Loading admin data...');
  const res  = await fetch('/api/admin-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return show('adminNote', data.error || 'Could not load admin data.', 'bad');
  show('adminNote', 'Admin data loaded.', 'good');
  const totals = data.totals || {};
  document.getElementById('adminUsers').textContent    = totals.users || 0;
  document.getElementById('adminCredits').textContent  = totals.credits || 0;
  document.getElementById('adminOrders').textContent   = totals.orders || 0;
  document.getElementById('adminRevenue').textContent  = 'INR ' + (totals.revenue || 0);
  const body = document.getElementById('adminOrdersBody');
  if (body) {
    const rows = data.orders || [];
    if (!rows.length) {
      emptyTable(body, 6, 'No orders.');
    } else {
      body.textContent = '';
      rows.forEach(item => {
        const row = document.createElement('tr');
        appendCell(row, formatDate(item.created_at));
        appendCell(row, item.email || '');
        appendCell(row, item.plan || '');
        appendCell(row, 'INR ' + (item.amount || 0));
        appendCell(row, item.credits || 0);
        appendCell(row, item.status || '');
        body.appendChild(row);
      });
    }
  }
}

async function grantAutomaticTrial() {
  const token = await getSessionToken();
  if (!token) return { granted: false };
  try {
    const res  = await fetch('/api/grant-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.balance === 'number') setCredits(data.balance);
    return data;
  } catch {
    return { granted: false };
  }
}

async function claimTrial() {
  const email = getEmail();
  if (!email) return show('checkoutNote', 'Create an account or log in before claiming the free trial.', 'bad');
  const result = await grantAutomaticTrial();
  show(
    'checkoutNote',
    result?.granted ? 'Free trial activated. 10 credits added.' : 'Free trial already claimed for this account.',
    result?.granted ? 'good' : 'bad'
  );
}

async function startPayment() {
  const planKey      = document.getElementById('checkoutPlan')?.value || 'growth';
  const plan         = PLANS[planKey];
  const currentEmail = getEmail();
  const checkoutEmail = normalizeEmail(document.getElementById('checkoutEmail')?.value);
  const email        = currentEmail || checkoutEmail;
  const name         = document.getElementById('checkoutName')?.value.trim() || getName();
  const password     = document.getElementById('checkoutPassword')?.value.trim();
  const phone        = document.getElementById('checkoutPhone')?.value.trim();

  if (planKey !== 'trial' && (!name || !phone)) return show('checkoutNote', 'Enter name and phone number.', 'bad');
  const accountReady = await createOrLoginCheckoutAccount(name, email, password);
  if (!accountReady) return;
  if (planKey === 'trial') return claimTrial();
  if (!hasRazorpayConfig()) return show('checkoutNote', 'Razorpay key is not configured.', 'bad');
  if (!window.Razorpay)    return show('checkoutNote', 'Razorpay could not load.', 'bad');

  const token = await getSessionToken();
  if (!token) return show('checkoutNote', 'Session expired. Please log in again.', 'bad');

  const orderRes = await fetch('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planKey, customer: { name, email, phone } })
  });
  const order = await orderRes.json().catch(() => ({}));
  if (!orderRes.ok) return show('checkoutNote', order.error || 'Could not create payment order.', 'bad');

  new Razorpay({
    key: CONFIG.razorpayKeyId,
    amount: order.amount,
    currency: order.currency || 'INR',
    name: 'SaleSmart AI',
    description: plan.name,
    order_id: order.orderId || order.id,
    prefill: { name, email, contact: phone },
    handler: async response => {
      const verifyRes = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(response)
      });
      const verified = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verified.ok) return show('checkoutNote', 'Payment verification pending. Contact support if credits are not added.', 'bad');
      if (typeof verified.balance === 'number') setCredits(verified.balance);
      trackPurchase(planKey, plan);
      show('checkoutNote', 'Payment successful. Credits added to your account.', 'good');
    }
  }).open();
}

function updateToolCreditPanel() {
  const panel = document.getElementById('toolCreditPanel');
  if (!panel) return;
  const email = getEmail();
  panel.textContent = '';

  const status = document.createElement('span');
  if (email) {
    status.append('Signed in as ');
    const emailText = document.createElement('strong');
    emailText.textContent = email;
    status.appendChild(emailText);
    panel.appendChild(status);

    const creditText = document.createElement('span');
    creditText.append('Credits available: ');
    const creditValue = document.createElement('strong');
    creditValue.dataset.credit = '';
    creditValue.textContent = getCredits().toLocaleString('en-IN');
    creditText.appendChild(creditValue);
    panel.appendChild(creditText);

    const buy = document.createElement('a');
    buy.className = 'btn tiny';
    buy.href = 'pricing.html';
    buy.textContent = 'Buy credits';
    panel.appendChild(buy);
    return;
  }

  status.textContent = 'Please log in to use this tool.';
  panel.appendChild(status);
  const loginLink  = document.createElement('a');
  loginLink.className  = 'btn tiny primary';
  loginLink.href       = 'account.html';
  loginLink.textContent = 'Log in';
  panel.appendChild(loginLink);
  const signupLink = document.createElement('a');
  signupLink.className  = 'btn tiny';
  signupLink.href       = 'signup.html';
  signupLink.textContent = 'Create account';
  panel.appendChild(signupLink);
}

function initToolCreditPanel() {
  if (!document.body.dataset.tool || document.getElementById('toolCreditPanel')) return;
  const wrap   = document.querySelector('main .wrap');
  const layout = document.querySelector('.tool-layout');
  if (!wrap || !layout) return;
  const panel = document.createElement('div');
  panel.id        = 'toolCreditPanel';
  panel.className = 'tool-credit-panel';
  wrap.insertBefore(panel, layout);
  updateToolCreditPanel();
}

async function generateAI() {
  const email = getEmail();
  if (!email) return show('toolNote', 'Log in or create an account before using AI tools.', 'bad');

  const token = await getSessionToken();
  if (!token) return show('toolNote', 'Session expired. Please log in again.', 'bad');

  const tool    = document.body.dataset.tool || document.getElementById('toolType')?.value || 'listing';
  const product = document.getElementById('productName')?.value.trim();
  const fieldDetails = Array.from(document.querySelectorAll('[data-ai-field]'))
    .map(field => {
      const label = field.dataset.label || field.previousElementSibling?.textContent || field.id || 'Field';
      return `${label}: ${field.value || ''}`;
    })
    .join('\n');
  const details = fieldDetails || document.getElementById('productDetails')?.value.trim() || '';
  const output  = document.getElementById('toolOutput');

  if (!product) return show('toolNote', 'Enter a product or topic.', 'bad');

  show('toolNote', 'Generating with SaleSmart AI...');
  output.textContent = 'Generating...';

  const res  = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool, product, details })
  });
  const data = await res.json().catch(() => ({}));

  if (typeof data.balance === 'number') setCredits(data.balance);

  if (!res.ok) {
    return show('toolNote', data.error || 'AI generation failed.', 'bad');
  }

  output.textContent = cleanAIText(data.text || 'No output returned.');

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'ai_generation', { tool, value: 1 });
  }

  show('toolNote', 'Generated. 1 credit used.', 'good');
}

function copyOutput() {
  const text = document.getElementById('toolOutput')?.textContent || '';
  navigator.clipboard.writeText(text);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('/service-worker.js').catch(() => null);
}

function init() {
  registerServiceWorker();
  initSupabase();
  initToolCreditPanel();
  updateChrome();
  initPasswordReset();
  loadCredits();
  loadOrders();
}
document.addEventListener('DOMContentLoaded', init);

window.signup             = signup;
window.login              = login;
window.sendPasswordReset  = sendPasswordReset;
window.updatePassword     = updatePassword;
window.logout             = logout;
window.startPayment       = startPayment;
window.claimTrial         = claimTrial;
window.generateAI         = generateAI;
window.copyOutput         = copyOutput;
window.toggleMobileMenu   = toggleMobileMenu;
window.closeMobileMenu    = closeMobileMenu;

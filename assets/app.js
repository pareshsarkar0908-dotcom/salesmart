const CONFIG = {
  supabaseUrl: localStorage.getItem('salesmart_supabase_url') || window.SALESMART_SUPABASE_URL || '',
  supabaseAnonKey: localStorage.getItem('salesmart_supabase_anon_key') || window.SALESMART_SUPABASE_ANON_KEY || '',
  razorpayKeyId: localStorage.getItem('salesmart_razorpay_key_id') || window.SALESMART_RAZORPAY_KEY_ID || ''
};

const CREDIT_KEY = 'salesmart_credit_balance';
const EMAIL_KEY = 'salesmart_current_email';
const NAME_KEY = 'salesmart_current_name';
const TRIAL_KEY = 'salesmart_trial_emails';
let supabaseClient = null;

const PLANS = {
  trial: { name: 'Free Trial', amount: 0, credits: 10, label: 'INR 0' },
  starter: { name: 'Starter Pack', amount: 299, credits: 150, label: 'INR 299' },
  growth: { name: 'Growth Pack', amount: 999, credits: 600, label: 'INR 999' },
  pro: { name: 'Pro Pack', amount: 2499, credits: 1800, label: 'INR 2499' }
};

function hasRealValue(value, blocked=[]){
  const clean = String(value || '').trim();
  return !!clean && !blocked.some(item => clean.includes(item));
}
function hasSupabaseConfig(){
  return hasRealValue(CONFIG.supabaseUrl, ['your-project']) &&
    hasRealValue(CONFIG.supabaseAnonKey, ['your_key_here']);
}
function hasRazorpayConfig(){
  return hasRealValue(CONFIG.razorpayKeyId, ['test_or_live_key_id']);
}
function normalizeEmail(email){ return String(email || '').trim().toLowerCase(); }
function getEmail(){ return localStorage.getItem(EMAIL_KEY) || ''; }
function setEmail(email){ const clean = normalizeEmail(email); if(clean) localStorage.setItem(EMAIL_KEY, clean); }
function getName(){ return localStorage.getItem(NAME_KEY) || ''; }
function setName(name){ const clean = String(name || '').trim(); if(clean) localStorage.setItem(NAME_KEY, clean); }
function getCredits(){ return Math.max(0, parseInt(localStorage.getItem(CREDIT_KEY) || '0', 10) || 0); }
function setCredits(value){ localStorage.setItem(CREDIT_KEY, String(Math.max(0, Number(value) || 0))); updateChrome(); }
function addCredits(value){ setCredits(getCredits() + Number(value || 0)); }
function deductCredits(value){ if(getCredits() < value) return false; setCredits(getCredits() - value); return true; }
function trialEmails(){ try { return JSON.parse(localStorage.getItem(TRIAL_KEY) || '[]'); } catch { return []; } }
function markTrial(email){ const set = new Set(trialEmails()); set.add(normalizeEmail(email)); localStorage.setItem(TRIAL_KEY, JSON.stringify([...set])); }

function show(id, msg, type=''){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = msg;
  el.className = 'notice show' + (type ? ' ' + type : '');
}

function emptyTable(tbody, colspan, message){
  tbody.textContent = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function appendCell(row, value){
  const cell = document.createElement('td');
  cell.textContent = value == null ? '' : String(value);
  row.appendChild(cell);
}

function formatDate(value){
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function cleanAIText(text){
  return String(text || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}/g, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trackPurchase(planKey, plan){
  if(typeof window.gtag !== 'function') return;
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
    items: [{
      item_id: planKey,
      item_name: plan?.name || planKey,
      quantity: 1,
      price: Number(plan?.amount || 0)
    }]
  });
}

function initSupabase(){
  if(window.supabase && hasSupabaseConfig()){
    supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }
}

function updateChrome(){
  const email = getEmail();
  const credits = getCredits();
  document.querySelectorAll('[data-auth="in"]').forEach(el => el.style.display = email ? '' : 'none');
  document.querySelectorAll('[data-auth="out"]').forEach(el => el.style.display = email ? 'none' : '');
  document.querySelectorAll('[data-credit]').forEach(el => el.textContent = credits.toLocaleString('en-IN'));
  document.querySelectorAll('[data-email]').forEach(el => el.textContent = email || 'Not signed in');
  document.querySelectorAll('[data-name]').forEach(el => el.textContent = getName() || 'Seller');
  const checkoutEmail = document.getElementById('checkoutEmail');
  if(checkoutEmail){
    checkoutEmail.readOnly = !!email;
    if(email) checkoutEmail.value = email;
  }
  const checkoutName = document.getElementById('checkoutName');
  if(checkoutName && getName() && !checkoutName.value) checkoutName.value = getName();
  updateToolCreditPanel();
}

function toggleMobileMenu(){
  document.getElementById('mobileDrawer')?.classList.toggle('open');
}

function closeMobileMenu(){
  document.getElementById('mobileDrawer')?.classList.remove('open');
}

async function loadCredits(){
  const email = getEmail();
  if(!supabaseClient || !email) return;
  const result = await supabaseClient.from('credits').select('balance').eq('email', email).limit(1);
  if(!result.error && typeof result.data?.[0]?.balance === 'number') setCredits(result.data[0].balance);
}

async function saveCredits(){
  const email = getEmail();
  if(!supabaseClient || !email) return;
  await supabaseClient.from('credits').upsert({
    email,
    balance: getCredits(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'email' });
}

async function signup(){
  const name = document.getElementById('signupName')?.value.trim();
  const email = document.getElementById('signupEmail')?.value.trim();
  const password = document.getElementById('signupPassword')?.value.trim();
  if(!name || !email || !password) return show('signupNote','Enter name, email, and password.','bad');
  if(password.length < 6) return show('signupNote','Password must be at least 6 characters.','bad');
  if(!supabaseClient) return show('signupNote','Supabase is not connected.','bad');
  show('signupNote','Creating your account...');
  try {
    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if(error) return show('signupNote', error.message, 'bad');
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CREDIT_KEY);
    updateChrome();
    show('signupNote','Account created. Please log in with your email and password.','good');
    setTimeout(() => {
      location.href = 'account.html';
    }, 1200);
  } catch(error) {
    show('signupNote', error.message || 'Could not create account. Please try again.', 'bad');
  }
}

async function login(){
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value.trim();
  if(!email || !password) return show('loginNote','Enter email and password.','bad');
  if(!supabaseClient) return show('loginNote','Supabase is not connected.','bad');
  show('loginNote','Logging in...');
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error) return show('loginNote', error.message || 'Invalid login credentials.', 'bad');
    setEmail(email);
    setName(data?.user?.user_metadata?.full_name || getName());
    await loadCredits();
    const trialAdded = await grantAutomaticTrial();
    updateChrome();
    show('loginNote', trialAdded ? 'Logged in. 10 free trial credits added.' : 'Logged in. Your account dashboard is ready.','good');
  } catch(error) {
    show('loginNote', error.message || 'Login failed. Please try again.', 'bad');
  }
}

async function sendPasswordReset(){
  const email = document.getElementById('loginEmail')?.value.trim();
  if(!email) return show('loginNote','Enter your email first, then click forgot password.','bad');
  if(!supabaseClient) return show('loginNote','Supabase is not connected.','bad');
  show('loginNote','Sending password reset email...');
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}?reset=1`
    });
    if(error) return show('loginNote', error.message, 'bad');
    show('loginNote','Password reset email sent. Open the email link to create a new password.','good');
  } catch(error) {
    show('loginNote', error.message || 'Could not send reset email. Please try again.', 'bad');
  }
}

async function updatePassword(){
  const password = document.getElementById('newPassword')?.value.trim();
  if(!password) return show('resetNote','Enter your new password.','bad');
  if(password.length < 6) return show('resetNote','Password must be at least 6 characters.','bad');
  if(!supabaseClient) return show('resetNote','Supabase is not connected.','bad');
  show('resetNote','Updating password...');
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if(error) return show('resetNote', error.message, 'bad');
    await supabaseClient.auth.signOut().catch(() => null);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CREDIT_KEY);
    show('resetNote','Password updated. Please log in with your new password.','good');
    setTimeout(() => {
      location.href = 'account.html';
    }, 1400);
  } catch(error) {
    show('resetNote', error.message || 'Could not update password. Please try again.', 'bad');
  }
}

function initPasswordReset(){
  const isReset = location.search.includes('reset=1') || location.hash.includes('type=recovery');
  const panel = document.getElementById('resetPanel');
  if(!isReset || !panel) return;
  panel.style.display = '';
  document.querySelectorAll('[data-auth="out"], [data-auth="in"]').forEach(el => {
    if(el.closest('#resetPanel')) return;
    el.style.display = 'none';
  });
}

async function createOrLoginCheckoutAccount(name, email, password){
  if(getEmail()) return true;
  if(!name || !email || !password) {
    show('checkoutNote','Enter name, email, and password to create your account.','bad');
    return false;
  }
  if(password.length < 6) {
    show('checkoutNote','Password must be at least 6 characters.','bad');
    return false;
  }
  if(!supabaseClient) {
    show('checkoutNote','Supabase is not connected.','bad');
    return false;
  }

  show('checkoutNote','Creating your account...');
  const signupResult = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });

  if(signupResult.error){
    const loginResult = await supabaseClient.auth.signInWithPassword({ email, password });
    if(loginResult.error){
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

async function logout(){
  if(supabaseClient) await supabaseClient.auth.signOut().catch(() => null);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(CREDIT_KEY);
  updateChrome();
  location.href = 'account.html';
}

async function loadOrders(){
  const tbody = document.getElementById('ordersBody');
  if(!tbody) return;
  const email = getEmail();
  if(!email){
    emptyTable(tbody, 6, 'Log in to view your orders.');
    return;
  }
  if(!supabaseClient){
    emptyTable(tbody, 6, 'Supabase is not connected.');
    return;
  }
  const result = await supabaseClient
    .from('orders')
    .select('created_at,plan,amount,credits,status,razorpay_payment_id,razorpay_order_id')
    .eq('email', email)
    .order('created_at', { ascending: false });
  if(result.error){
    emptyTable(tbody, 6, 'Could not load orders.');
    return;
  }
  const rows = result.data || [];
  if(!rows.length){
    emptyTable(tbody, 6, 'No orders yet.');
    return;
  }
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

async function loadAdmin(){
  const note = document.getElementById('adminNote');
  const password = document.getElementById('adminPassword')?.value.trim();
  if(!password) return show('adminNote','Enter admin password.','bad');
  show('adminNote','Loading admin data...');
  const res = await fetch('/api/admin-summary', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ password })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok) return show('adminNote', data.error || 'Could not load admin data.', 'bad');
  show('adminNote','Admin data loaded.','good');
  const totals = data.totals || {};
  document.getElementById('adminUsers').textContent = totals.users || 0;
  document.getElementById('adminCredits').textContent = totals.credits || 0;
  document.getElementById('adminOrders').textContent = totals.orders || 0;
  document.getElementById('adminRevenue').textContent = 'INR ' + (totals.revenue || 0);
  const body = document.getElementById('adminOrdersBody');
  if(body){
    const rows = data.orders || [];
    if(!rows.length){
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

async function claimTrial(){
  const email = getEmail();
  if(!email) return show('checkoutNote','Create an account or log in before claiming the free trial.','bad');
  const added = await grantAutomaticTrial();
  show('checkoutNote', added ? 'Free trial activated. 10 credits added.' : 'Free trial already claimed for this account.', added ? 'good' : 'bad');
}

async function grantAutomaticTrial(){
  const email = normalizeEmail(getEmail());
  if(!email || trialEmails().includes(email)) return false;

  if(supabaseClient){
    const existing = await supabaseClient
      .from('orders')
      .select('id')
      .eq('email', email)
      .eq('status', 'trial')
      .limit(1);

    if(!existing.error && existing.data?.length){
      markTrial(email);
      return false;
    }

    const inserted = await supabaseClient
      .from('orders')
      .insert({ email, plan: 'trial', amount: 0, credits: PLANS.trial.credits, status: 'trial' });

    if(inserted.error){
      console.error('Automatic trial error:', inserted.error);
      return false;
    }
  }

  markTrial(email);
  addCredits(PLANS.trial.credits);
  await saveCredits();
  return true;
}

async function startPayment(){
  const planKey = document.getElementById('checkoutPlan')?.value || 'growth';
  const plan = PLANS[planKey];
  const currentEmail = getEmail();
  const checkoutEmail = normalizeEmail(document.getElementById('checkoutEmail')?.value);
  const email = currentEmail || checkoutEmail;
  const name = document.getElementById('checkoutName')?.value.trim() || getName();
  const password = document.getElementById('checkoutPassword')?.value.trim();
  const phone = document.getElementById('checkoutPhone')?.value.trim();
  if(planKey !== 'trial' && (!name || !phone)) return show('checkoutNote','Enter name and phone number.','bad');
  const accountReady = await createOrLoginCheckoutAccount(name, email, password);
  if(!accountReady) return;
  if(planKey === 'trial') return claimTrial();
  if(!hasRazorpayConfig()) return show('checkoutNote','Razorpay key is not configured.','bad');
  if(!window.Razorpay) return show('checkoutNote','Razorpay could not load.','bad');
  const orderRes = await fetch('/api/create-order', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ plan: planKey, customer: { name, email, phone } })
  });
  const order = await orderRes.json().catch(() => ({}));
  if(!orderRes.ok) return show('checkoutNote', order.error || 'Could not create payment order.', 'bad');
  new Razorpay({
    key: order.keyId || CONFIG.razorpayKeyId,
    amount: order.amount,
    currency: order.currency || 'INR',
    name: 'SaleSmart AI',
    description: plan.name,
    order_id: order.orderId || order.id,
    prefill: { name, email, contact: phone },
    handler: async response => {
      const verifyRes = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(response)
      });
      const verified = await verifyRes.json().catch(() => ({}));
      if(!verifyRes.ok || (!verified.ok && !verified.verified)) return show('checkoutNote','Payment verification pending.','bad');
      if(supabaseClient){
        await supabaseClient.from('orders').insert({
          email, plan: planKey, amount: plan.amount, credits: plan.credits, status: 'paid',
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id || order.orderId || ''
        });
      }
      addCredits(plan.credits); await saveCredits();
      trackPurchase(planKey, plan);
      show('checkoutNote','Payment successful. Credits added to your account.','good');
    }
  }).open();
}

function updateToolCreditPanel(){
  const panel = document.getElementById('toolCreditPanel');
  if(!panel) return;
  const email = getEmail();
  panel.textContent = '';

  const status = document.createElement('span');
  if(email){
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
  const loginLink = document.createElement('a');
  loginLink.className = 'btn tiny primary';
  loginLink.href = 'account.html';
  loginLink.textContent = 'Log in';
  panel.appendChild(loginLink);
  const signupLink = document.createElement('a');
  signupLink.className = 'btn tiny';
  signupLink.href = 'signup.html';
  signupLink.textContent = 'Create account';
  panel.appendChild(signupLink);
}

function initToolCreditPanel(){
  if(!document.body.dataset.tool || document.getElementById('toolCreditPanel')) return;
  const wrap = document.querySelector('main .wrap');
  const layout = document.querySelector('.tool-layout');
  if(!wrap || !layout) return;
  const panel = document.createElement('div');
  panel.id = 'toolCreditPanel';
  panel.className = 'tool-credit-panel';
  wrap.insertBefore(panel, layout);
  updateToolCreditPanel();
}

async function generateAI(){
  const email = getEmail();
  if(!email) return show('toolNote','Log in or create an account before using AI tools.','bad');
  if(!deductCredits(1)) return show('toolNote','You need credits to generate. Claim trial or buy credits.','bad');
  const tool = document.body.dataset.tool || document.getElementById('toolType')?.value || 'listing';
  const product = document.getElementById('productName')?.value.trim();
  const fieldDetails = Array.from(document.querySelectorAll('[data-ai-field]'))
    .map(field => {
      const label = field.dataset.label || field.previousElementSibling?.textContent || field.id || 'Field';
      return `${label}: ${field.value || ''}`;
    })
    .join('\n');
  const details = fieldDetails || document.getElementById('productDetails')?.value.trim();
  const output = document.getElementById('toolOutput');
  if(!product) { addCredits(1); return show('toolNote','Enter a product or topic.','bad'); }
  show('toolNote','Generating with SaleSmart AI...');
  output.textContent = 'Generating...';
  const prompt = `SaleSmart AI tool: ${tool}
Product/topic: ${product}
Details:
${details}

Create a complete ecommerce result for this exact tool and marketplace.
Write in clean plain text only.
Do not use Markdown.
Do not use # headings.
Do not use asterisks, bold marks, code blocks, or decorative separators.
Make the answer detailed and practical, around 700 to 1,100 words when the tool needs listing, research, review analysis, keywords, or multilingual copy.
Use simple section titles on their own line, followed by clear bullets or short paragraphs.
For listing output, include: optimized title, 5 bullet points, product description, search keywords, backend keyword ideas, target customer, pricing/positioning notes, image suggestions, and marketplace improvement tips.
For other tools, include complete useful sections, examples, and next actions.`;
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ prompt })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok){ addCredits(1); updateChrome(); return show('toolNote', data.error || 'AI generation failed.', 'bad'); }
  output.textContent = cleanAIText(data.text || 'No output returned.');
  await saveCredits();
  if(supabaseClient){
    const logResult = await supabaseClient
      .from('usage_logs')
      .insert({ email, tool, cost: 1, balance_after: getCredits() });
    if(logResult.error) console.error('Usage log error:', logResult.error);
  }
  show('toolNote','Generated. 1 credit used.','good');
}

function copyOutput(){
  const text = document.getElementById('toolOutput')?.textContent || '';
  navigator.clipboard.writeText(text);
}

function init(){
  initSupabase();
  initToolCreditPanel();
  updateChrome();
  initPasswordReset();
  loadCredits();
  loadOrders();
}
document.addEventListener('DOMContentLoaded', init);

window.signup = signup;
window.login = login;
window.sendPasswordReset = sendPasswordReset;
window.updatePassword = updatePassword;
window.logout = logout;
window.startPayment = startPayment;
window.claimTrial = claimTrial;
window.generateAI = generateAI;
window.copyOutput = copyOutput;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;

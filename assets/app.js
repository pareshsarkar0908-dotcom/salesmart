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

function initSupabase(){
  if(window.supabase && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey){
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
  if(checkoutEmail && email){ checkoutEmail.value = email; checkoutEmail.readOnly = true; }
  const checkoutName = document.getElementById('checkoutName');
  if(checkoutName && getName() && !checkoutName.value) checkoutName.value = getName();
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
  const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
  if(error) return show('signupNote', error.message, 'bad');
  setEmail(email); setName(name); await loadCredits(); updateChrome();
  show('signupNote','Account created. You can now claim the free trial or buy credits.','good');
}

async function login(){
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value.trim();
  if(!email || !password) return show('loginNote','Enter email and password.','bad');
  if(!supabaseClient) return show('loginNote','Supabase is not connected.','bad');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if(error) return show('loginNote', error.message, 'bad');
  setEmail(email); setName(data?.user?.user_metadata?.full_name || getName()); await loadCredits(); updateChrome();
  show('loginNote','Logged in. Your account dashboard is ready.','good');
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
    tbody.innerHTML = '<tr><td colspan="6">Log in to view your orders.</td></tr>';
    return;
  }
  if(!supabaseClient){
    tbody.innerHTML = '<tr><td colspan="6">Supabase is not connected.</td></tr>';
    return;
  }
  const result = await supabaseClient
    .from('orders')
    .select('created_at,plan,amount,credits,status,razorpay_payment_id,razorpay_order_id')
    .eq('email', email)
    .order('created_at', { ascending: false });
  if(result.error){
    tbody.innerHTML = '<tr><td colspan="6">Could not load orders.</td></tr>';
    return;
  }
  const rows = result.data || [];
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="6">No orders yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.plan || ''}</td>
      <td>INR ${row.amount || 0}</td>
      <td>${row.credits || 0}</td>
      <td>${row.status || ''}</td>
      <td>${row.razorpay_payment_id || row.razorpay_order_id || ''}</td>
    </tr>
  `).join('');
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
    body.innerHTML = (data.orders || []).map(row => `
      <tr>
        <td>${new Date(row.created_at).toLocaleString()}</td>
        <td>${row.email || ''}</td>
        <td>${row.plan || ''}</td>
        <td>INR ${row.amount || 0}</td>
        <td>${row.credits || 0}</td>
        <td>${row.status || ''}</td>
      </tr>
    `).join('') || '<tr><td colspan="6">No orders.</td></tr>';
  }
}

async function claimTrial(){
  const email = getEmail();
  if(!email) return show('checkoutNote','Create an account or log in before claiming the free trial.','bad');
  if(trialEmails().includes(email)) return show('checkoutNote','Free trial already claimed for this account.','bad');
  if(supabaseClient){
    const existing = await supabaseClient.from('orders').select('id').eq('email', email).eq('status','trial').limit(1);
    if(existing.data?.length) return show('checkoutNote','Free trial already claimed for this account.','bad');
    await supabaseClient.from('orders').insert({ email, plan: 'trial', amount: 0, credits: 10, status: 'trial' });
  }
  markTrial(email); addCredits(10); await saveCredits();
  show('checkoutNote','Free trial activated. 10 credits added.','good');
}

async function startPayment(){
  const email = getEmail();
  if(!email) return show('checkoutNote','Log in before buying credits.','bad');
  const planKey = document.getElementById('checkoutPlan')?.value || 'growth';
  const plan = PLANS[planKey];
  if(planKey === 'trial') return claimTrial();
  const name = document.getElementById('checkoutName')?.value.trim() || getName();
  const phone = document.getElementById('checkoutPhone')?.value.trim();
  if(!name || !phone) return show('checkoutNote','Enter name and phone number.','bad');
  if(!window.Razorpay) return show('checkoutNote','Razorpay could not load.','bad');
  const orderRes = await fetch('/api/create-order', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ plan: planKey, customer: { name, email, phone } })
  });
  const order = await orderRes.json().catch(() => ({}));
  if(!orderRes.ok) return show('checkoutNote', order.error || 'Could not create payment order.', 'bad');
  new Razorpay({
    key: CONFIG.razorpayKeyId || order.keyId,
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
      if(!verifyRes.ok && !verified.ok && !verified.verified) return show('checkoutNote','Payment verification pending.','bad');
      if(supabaseClient){
        await supabaseClient.from('orders').insert({
          email, plan: planKey, amount: plan.amount, credits: plan.credits, status: 'paid',
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id || order.orderId || ''
        });
      }
      addCredits(plan.credits); await saveCredits();
      show('checkoutNote','Payment successful. Credits added to your account.','good');
    }
  }).open();
}

async function generateAI(){
  const email = getEmail();
  if(!email) return show('toolNote','Log in or create an account before using AI tools.','bad');
  if(!deductCredits(1)) return show('toolNote','You need credits to generate. Claim trial or buy credits.','bad');
  const tool = document.getElementById('toolType')?.value || 'listing';
  const product = document.getElementById('productName')?.value.trim();
  const details = document.getElementById('productDetails')?.value.trim();
  const output = document.getElementById('toolOutput');
  if(!product) { addCredits(1); return show('toolNote','Enter a product or topic.','bad'); }
  show('toolNote','Generating with SaleSmart AI...');
  output.textContent = 'Generating...';
  const prompt = `SaleSmart AI tool: ${tool}\\nProduct/topic: ${product}\\nDetails: ${details}\\nCreate a professional, structured ecommerce output with headings, bullets, marketplace SEO guidance, and practical next actions.`;
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ prompt })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok){ addCredits(1); updateChrome(); return show('toolNote', data.error || 'AI generation failed.', 'bad'); }
  output.textContent = data.text || 'No output returned.';
  await saveCredits();
  if(supabaseClient) await supabaseClient.from('usage_logs').insert({ email, tool, cost: 1, balance_after: getCredits() }).catch(() => null);
  show('toolNote','Generated. 1 credit used.','good');
}

function copyOutput(){
  const text = document.getElementById('toolOutput')?.textContent || '';
  navigator.clipboard.writeText(text);
}

function init(){
  initSupabase();
  updateChrome();
  loadCredits();
  loadOrders();
}
document.addEventListener('DOMContentLoaded', init);

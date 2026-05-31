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

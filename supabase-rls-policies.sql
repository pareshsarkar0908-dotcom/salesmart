-- SaleSmart AI production RLS policies
-- Run this in Supabase SQL Editor after confirming your tables exist.
-- Tables expected: orders, credits, usage_logs.

alter table orders enable row level security;
alter table credits enable row level security;
alter table usage_logs enable row level security;

drop policy if exists "Users can read their own orders" on orders;
drop policy if exists "Users can insert their own orders" on orders;
drop policy if exists "Users can read their own credits" on credits;
drop policy if exists "Users can upsert their own credits" on credits;
drop policy if exists "Users can update their own credits" on credits;
drop policy if exists "Users can read their own usage logs" on usage_logs;
drop policy if exists "Users can insert their own usage logs" on usage_logs;

create policy "Users can read their own orders"
on orders for select
using (email = auth.jwt() ->> 'email');

create policy "Users can insert their own orders"
on orders for insert
with check (email = auth.jwt() ->> 'email');

create policy "Users can read their own credits"
on credits for select
using (email = auth.jwt() ->> 'email');

create policy "Users can upsert their own credits"
on credits for insert
with check (email = auth.jwt() ->> 'email');

create policy "Users can update their own credits"
on credits for update
using (email = auth.jwt() ->> 'email')
with check (email = auth.jwt() ->> 'email');

create policy "Users can read their own usage logs"
on usage_logs for select
using (email = auth.jwt() ->> 'email');

create policy "Users can insert their own usage logs"
on usage_logs for insert
with check (email = auth.jwt() ->> 'email');

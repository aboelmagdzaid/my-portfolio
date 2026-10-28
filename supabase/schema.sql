create table if not exists public.reminders (
  id bigint generated always as identity primary key,
  user_id bigint not null,
  chat_id bigint not null,
  title text not null check (char_length(title) between 1 and 250),
  kind text not null check (kind in ('task', 'appointment')),
  language text not null default 'en' check (language in ('en', 'ar')),
  due_at timestamptz not null,
  recurrence text check (recurrence in ('daily', 'weekly')),
  completed boolean not null default false,
  claimed_at timestamptz,
  notified_at timestamptz,
  last_notified_at timestamptz,
  last_callback_id text,
  telegram_update_id bigint,
  created_at timestamptz not null default now()
);

alter table public.reminders
  add column if not exists notified_at timestamptz,
  add column if not exists last_notified_at timestamptz,
  add column if not exists last_callback_id text;

create table if not exists public.money_transactions (
  id bigint generated always as identity primary key,
  user_id bigint not null,
  chat_id bigint not null,
  transaction_type text not null check (transaction_type in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'EGP' check (currency in ('EGP', 'USD')),
  note text,
  language text not null default 'en' check (language in ('en', 'ar')),
  telegram_update_id bigint,
  created_at timestamptz not null default now()
);

alter table public.money_transactions
  add column if not exists telegram_update_id bigint;

alter table public.reminders enable row level security;
alter table public.money_transactions enable row level security;
grant all on public.reminders to service_role;
grant all on public.money_transactions to service_role;

create index if not exists reminders_due_at_idx
  on public.reminders (due_at)
  where completed = false;

create unique index if not exists reminders_telegram_update_id_idx
  on public.reminders (telegram_update_id)
  where telegram_update_id is not null;

create index if not exists money_transactions_user_created_idx
  on public.money_transactions (user_id, created_at desc);

create unique index if not exists money_transactions_telegram_update_id_idx
  on public.money_transactions (telegram_update_id)
  where telegram_update_id is not null;

create table if not exists public.monthly_report_deliveries (
  report_month date primary key,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.monthly_report_deliveries enable row level security;
grant all on public.monthly_report_deliveries to service_role;

create or replace function public.claim_monthly_report(p_report_month date)
returns date
language sql
security definer
set search_path = public
as $$
  insert into public.monthly_report_deliveries (report_month, claimed_at, sent_at)
  values (p_report_month, now(), null)
  on conflict (report_month) do update
    set claimed_at = now()
    where monthly_report_deliveries.sent_at is null
      and monthly_report_deliveries.claimed_at < now() - interval '10 minutes'
  returning report_month;
$$;

revoke all on function public.claim_monthly_report(date) from public, anon, authenticated;
grant execute on function public.claim_monthly_report(date) to service_role;

create or replace function public.money_flow_totals(
  p_user_id bigint,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table(currency text, expenses numeric, earnings numeric)
language sql
stable
set search_path = public
as $$
  select
    money_entry.currency,
    coalesce(sum(money_entry.amount) filter (where money_entry.transaction_type = 'expense'), 0),
    coalesce(sum(money_entry.amount) filter (where money_entry.transaction_type = 'income'), 0)
  from public.money_transactions as money_entry
  where money_entry.user_id = p_user_id
    and money_entry.created_at >= p_start_at
    and money_entry.created_at <= p_end_at
  group by money_entry.currency;
$$;

revoke all on function public.money_flow_totals(bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.money_flow_totals(bigint, timestamptz, timestamptz) to service_role;

create or replace function public.respond_to_reminder(
  p_reminder_id bigint,
  p_user_id bigint,
  p_action text,
  p_callback_id text,
  p_next_due_at timestamptz default null
)
returns setof public.reminders
language sql
security definer
set search_path = public
as $$
  update public.reminders as reminder
  set completed = (p_action = 'done' and reminder.recurrence is null),
      due_at = case
        when p_action = 'later' then now() + interval '1 hour'
        when reminder.recurrence is not null then p_next_due_at
        else reminder.due_at
      end,
      notified_at = case when p_action = 'later' then reminder.notified_at else null end,
      last_notified_at = case when p_action = 'later' then reminder.last_notified_at else null end,
      claimed_at = null,
      last_callback_id = p_callback_id
  where reminder.id = p_reminder_id
    and reminder.user_id = p_user_id
    and reminder.completed = false
    and reminder.notified_at is not null
    and p_action in ('done', 'later')
    and (reminder.last_callback_id is null or reminder.last_callback_id <> p_callback_id)
  returning reminder.*;
$$;

revoke all on function public.respond_to_reminder(bigint, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.respond_to_reminder(bigint, bigint, text, text, timestamptz) to service_role;

create or replace function public.claim_due_reminders()
returns setof public.reminders
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.reminders
    where completed = false
      and due_at <= now()
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by due_at
    for update skip locked
    limit 100
  )
  update public.reminders as reminder
  set claimed_at = now(),
      notified_at = coalesce(reminder.notified_at, reminder.due_at),
      last_notified_at = now()
  from due
  where reminder.id = due.id
  returning reminder.*;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

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
  telegram_update_id bigint unique,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;
grant all on public.reminders to service_role;

create index if not exists reminders_due_at_idx
  on public.reminders (due_at)
  where completed = false;

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
  set claimed_at = now()
  from due
  where reminder.id = due.id
  returning reminder.*;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

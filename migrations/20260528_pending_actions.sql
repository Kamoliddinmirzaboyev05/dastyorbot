create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  chat_id text not null,
  action_type text not null check (action_type in ('transaction', 'task', 'reminder', 'note', 'mixed')),
  payload jsonb not null,
  original_text text,
  transcribed_text text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists pending_actions_user_status_idx
  on public.pending_actions (user_id, status, expires_at);

create or replace function public.set_pending_actions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pending_actions_set_updated_at on public.pending_actions;

create trigger pending_actions_set_updated_at
before update on public.pending_actions
for each row execute function public.set_pending_actions_updated_at();

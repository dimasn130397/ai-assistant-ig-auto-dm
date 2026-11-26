-- Instagram Auto-DM & Follower Gate Schema
-- Jalankan query ini di Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.ig_automations (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  target_url text not null,
  comment_reply text not null,
  gate_message text not null,
  success_message text not null,
  is_active boolean not null default true,
  trigger_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_ig_automations_keyword_lower
  on public.ig_automations (lower(keyword));

create table if not exists public.ig_user_states (
  ig_user_id text primary key,
  username text,
  last_automation_id uuid references public.ig_automations(id) on delete cascade,
  is_follower boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_ig_user_states_last_automation_id
  on public.ig_user_states (last_automation_id);

-- Auto-update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ig_automations_updated_at on public.ig_automations;
create trigger trg_ig_automations_updated_at
  before update on public.ig_automations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ig_user_states_updated_at on public.ig_user_states;
create trigger trg_ig_user_states_updated_at
  before update on public.ig_user_states
  for each row execute function public.set_updated_at();

-- Enable RLS (backend API & webhook menggunakan SUPABASE_SERVICE_ROLE_KEY yang mem-bypass RLS)
alter table public.ig_automations enable row level security;
alter table public.ig_user_states enable row level security;

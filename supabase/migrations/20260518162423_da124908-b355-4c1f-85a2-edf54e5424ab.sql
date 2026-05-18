
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- wellness data
create table public.wellness_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  sleep_score int,
  sleep_duration_min int,
  readiness_score int,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.wellness_data enable row level security;
create policy "own wellness all" on public.wellness_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- schedule
create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null,
  title text not null,
  subtitle text,
  level text not null default 'Medium' check (level in ('High','Medium','Low')),
  created_at timestamptz not null default now()
);
alter table public.schedule_events enable row level security;
create policy "own schedule all" on public.schedule_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chat messages
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
create policy "own messages all" on public.chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index chat_messages_user_created on public.chat_messages (user_id, created_at);

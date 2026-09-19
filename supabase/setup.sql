-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.plays (
  id          bigint generated always as identity primary key,
  player_id   text        not null,          -- random id made in the browser, not linked to a person
  quiz_id     text        not null,          -- e.g. 2026-09-19
  mode        text        not null check (mode in ('daily','archive')),
  won         boolean     not null,
  mistakes    int         not null check (mistakes between 0 and 20),
  found_order text        not null default '' check (length(found_order) <= 12),
  created_at  timestamptz not null default now(),
  unique (player_id, quiz_id)
);

alter table public.plays enable row level security;

-- Anyone may ADD a row. Nobody can read, change or delete rows through the public key.
create policy "anyone can insert plays" on public.plays
  for insert to anon with check (true);

grant insert on public.plays to anon;

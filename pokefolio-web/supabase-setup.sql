-- À copier-coller dans l'éditeur SQL de Supabase (SQL Editor), puis cliquer "Run"

create table cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  set text,
  number text,
  condition text not null default 'nearmint',
  purchase_price numeric not null default 0,
  current_price numeric not null default 0,
  quantity integer not null default 1,
  added_at timestamptz not null default now()
);

-- Autorise la lecture et l'écriture publique (simple, adapté à un usage personnel sans compte utilisateur)
alter table cards enable row level security;

create policy "Allow all access" on cards
  for all
  using (true)
  with check (true);

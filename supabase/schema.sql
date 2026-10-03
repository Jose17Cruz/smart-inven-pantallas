-- Ejecutar una sola vez en Supabase > SQL Editor.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model text not null,
  sku text not null default '',
  category text not null default 'Pantallas',
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 1 check (min_stock >= 0),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "Users can read their products" on public.products for select to authenticated using (auth.uid() = owner_id);
create policy "Users can add their products" on public.products for insert to authenticated with check (auth.uid() = owner_id);
create policy "Users can update their products" on public.products for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their products" on public.products for delete to authenticated using (auth.uid() = owner_id);

-- Habilita cambios en tiempo real para que las otras sesiones se actualicen.
alter publication supabase_realtime add table public.products;

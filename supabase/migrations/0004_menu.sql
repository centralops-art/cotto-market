-- 0004: menu categories and items

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_categories_vendor_id_idx on public.menu_categories (vendor_id);

create trigger set_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  menu_category_id uuid references public.menu_categories (id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  ingredients text,
  allergens text[] not null default '{}',
  image_urls text[] not null default '{}',
  is_available boolean not null default true,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_vendor_id_idx on public.menu_items (vendor_id);
create index menu_items_menu_category_id_idx on public.menu_items (menu_category_id);

-- Postgres full-text search across name + ingredients (spec 3.4 / 5).
alter table public.menu_items
  add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(ingredients, '')), 'B')
  ) stored;

create index menu_items_search_tsv_idx on public.menu_items using gin (search_tsv);

create trigger set_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- Full-text search across vendor names too (spec 3.4 / 5).
alter table public.vendors
  add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(storefront_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tagline, '')), 'B')
  ) stored;

create index vendors_search_tsv_idx on public.vendors using gin (search_tsv);

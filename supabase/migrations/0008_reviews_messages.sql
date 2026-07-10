-- 0008: reviews (food + driver) and per-suborder messaging

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_suborder_id uuid not null references public.vendor_suborders (id) on delete cascade,
  customer_profile_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  rating_overall smallint not null check (rating_overall between 1 and 5),
  body text,
  image_url text,
  is_flagged boolean not null default false,
  flagged_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_suborder_id, customer_profile_id)
);

create index reviews_vendor_id_idx on public.reviews (vendor_id) where is_flagged = false;
create index reviews_customer_profile_id_idx on public.reviews (customer_profile_id);

create trigger set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now()
);

create index review_items_review_id_idx on public.review_items (review_id);
create index review_items_menu_item_id_idx on public.review_items (menu_item_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  vendor_suborder_id uuid not null references public.vendor_suborders (id) on delete cascade,
  from_profile_id uuid not null references public.profiles (id) on delete cascade,
  to_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_vendor_suborder_id_idx on public.messages (vendor_suborder_id);

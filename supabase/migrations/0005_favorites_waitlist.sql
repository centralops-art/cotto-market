-- 0005: favorites (polymorphic vendor xor item) and sold-out waitlist

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid references public.vendors (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_target_xor check (
    (vendor_id is not null and menu_item_id is null) or
    (vendor_id is null and menu_item_id is not null)
  )
);

create unique index favorites_profile_vendor_uidx on public.favorites (profile_id, vendor_id) where vendor_id is not null;
create unique index favorites_profile_item_uidx on public.favorites (profile_id, menu_item_id) where menu_item_id is not null;

-- Waitlist entries are consumed on first notification (notified_at set once, then
-- the row is done -- no repeat emails on subsequent restocks; the customer would
-- need to re-join the waitlist).
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (menu_item_id, profile_id)
);

create index waitlist_entries_menu_item_id_idx on public.waitlist_entries (menu_item_id);

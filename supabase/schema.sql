create table if not exists shopping_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  constraint shopping_users_username_len check (char_length(username) between 3 and 64)
);

create table if not exists shopping_lists (
  id text primary key,
  owner_id text not null references shopping_users(id) on delete cascade,
  title text not null,
  planned_date date not null,
  updated_at timestamptz not null default now()
);

create table if not exists shopping_list_items (
  id text primary key,
  list_id text not null references shopping_lists(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  notes text not null default '',
  category text not null,
  status text not null,
  created_at timestamptz not null default now(),
  constraint shopping_items_quantity_min check (quantity >= 1),
  constraint shopping_items_status_check check (status in ('pending', 'bought', 'out_of_stock')),
  constraint shopping_items_name_len check (char_length(name) <= 80),
  constraint shopping_items_notes_len check (char_length(notes) <= 200)
);

create table if not exists shopping_list_shares (
  list_id text not null references shopping_lists(id) on delete cascade,
  user_id text not null references shopping_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table if not exists shopping_user_item_history (
  user_id text not null references shopping_users(id) on delete cascade,
  item_name_norm text not null,
  weeks_in_row integer not null default 0,
  total_times integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_name_norm),
  constraint shopping_history_weeks_nonneg check (weeks_in_row >= 0),
  constraint shopping_history_total_nonneg check (total_times >= 0)
);

create index if not exists idx_shopping_lists_owner_updated
  on shopping_lists (owner_id, updated_at desc);

create index if not exists idx_shopping_list_items_list_id
  on shopping_list_items (list_id);

create index if not exists idx_shopping_list_shares_user_id
  on shopping_list_shares (user_id);

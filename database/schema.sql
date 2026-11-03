-- ===========================================================================
-- Campus Lost and Found Portal — PostgreSQL schema
--
-- Run this once in the Supabase SQL editor (or with psql) before seeding.
-- It mirrors src/models/index.js exactly; `npm run db:sync` produces the same
-- tables automatically if you prefer to let Sequelize do it.
-- ===========================================================================

-- Optional: only needed if you insert rows by hand instead of through the API.
-- create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users
create table if not exists users (
  id            uuid primary key,
  name          varchar(80)  not null,
  email         varchar(160) not null unique,
  student_id    varchar(30)  unique,
  password_hash varchar(255) not null,
  role          varchar(10)  not null default 'user',
  phone         varchar(20)  default '',
  is_blocked    boolean      not null default false,
  password_changed_at timestamptz,
  token_version integer      not null default 0,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
create index if not exists users_role_idx on users (role);

-- ---------------------------------------------------------------- items
create table if not exists items (
  id              uuid primary key,
  reporter_id     uuid not null references users (id) on delete cascade,
  type            varchar(6)   not null check (type in ('lost', 'found')),
  title           varchar(120) not null,
  category        varchar(40)  not null,
  description     text         not null,
  -- Never returned by a public endpoint. See src/utils/serialize.js.
  private_detail  text         default '',
  colour          varchar(40)  default '',
  brand           varchar(60)  default '',
  building        varchar(40)  not null,
  location_detail varchar(200) default '',
  date_occurred   date         not null,
  images          jsonb        default '[]'::jsonb,
  status          varchar(12)  not null default 'pending'
                  check (status in ('pending','active','claimed','returned','rejected','archived')),
  view_count      integer      not null default 0,
  is_deleted      boolean      not null default false,
  admin_note      varchar(500) default '',
  returned_at     timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);
create index if not exists items_filter_idx on items (status, type, category, building);
create index if not exists items_created_idx on items (created_at desc);
create index if not exists items_title_idx on items (title);
create index if not exists items_reporter_idx on items (reporter_id);

-- ---------------------------------------------------------------- claims
create table if not exists claims (
  id                  uuid primary key,
  item_id             uuid not null references items (id) on delete cascade,
  claimant_id         uuid not null references users (id) on delete cascade,
  message             text not null,
  verification_answer text not null,
  proof_image         varchar(255) default '',
  status              varchar(12)  not null default 'pending'
                      check (status in ('pending','approved','rejected','cancelled','collected')),
  decision_note       varchar(500) default '',
  decided_by          uuid references users (id) on delete set null,
  decided_at          timestamptz,
  pickup_code         varchar(12) default '',
  collected_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists claims_item_claimant_idx on claims (item_id, claimant_id, status);
create index if not exists claims_status_idx on claims (status);

-- ---------------------------------------------------------------- matches
create table if not exists matches (
  id            uuid primary key,
  lost_item_id  uuid not null references items (id) on delete cascade,
  found_item_id uuid not null references items (id) on delete cascade,
  score         double precision not null,
  reasons       jsonb default '[]'::jsonb,
  status        varchar(12) not null default 'suggested'
                check (status in ('suggested','dismissed','confirmed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint matches_pair_unique unique (lost_item_id, found_item_id)
);

-- ---------------------------------------------------------- notifications
create table if not exists notifications (
  id         uuid primary key,
  user_id    uuid not null references users (id) on delete cascade,
  type       varchar(40)  not null,
  title      varchar(160) not null,
  message    text         default '',
  link       varchar(255) default '',
  is_read    boolean      not null default false,
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, is_read);

-- ------------------------------------------------------ password resets
-- Only a keyed hash of the six-digit code is stored, never the code itself.
create table if not exists password_resets (
  id           uuid primary key,
  user_id      uuid not null references users (id) on delete cascade,
  otp_hash     varchar(64) not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  consumed_at  timestamptz,
  requested_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets (user_id, consumed_at);

-- -------------------------------------------------------------- audit log
-- Append only: the application never updates or deletes these rows.
create table if not exists audit_logs (
  id          uuid primary key,
  actor_id    uuid references users (id) on delete set null,
  actor_role  varchar(12)  default '',
  action      varchar(60)  not null,
  entity_type varchar(30)  default '',
  entity_id   varchar(40)  default '',
  summary     varchar(500) default '',
  ip          varchar(60)  default '',
  user_agent  varchar(300) default '',
  created_at  timestamptz  not null default now()
);
create index if not exists audit_created_idx on audit_logs (created_at desc);

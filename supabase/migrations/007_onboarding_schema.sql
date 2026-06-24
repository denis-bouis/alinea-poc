-- 007_onboarding_schema.sql
-- Tables pour l'onboarding, les thématiques, la frise et les personnes

-- user_memory : mémoire globale de l'utilisateur (1 ligne par user)
create table if not exists user_memory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  birth_year      int,
  portrait        text,
  default_narrative_style text not null default 'intimate',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id)
);

-- themes : thématiques de vie
create table if not exists themes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  color       text not null default '#9B5E3A',
  maturity    text not null default 'emerging'
              check (maturity in ('emerging', 'active', 'major', 'closed')),
  ai_summary  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- life_events : événements de la frise de vie
create table if not exists life_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  year        int not null,
  title       text not null,
  status      text not null default 'undocumented'
              check (status in ('undocumented', 'draft', 'validated')),
  theme_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- alinea_themes : jonction alinéas ↔ thématiques
create table if not exists alinea_themes (
  alinea_id           uuid not null references alineas(id) on delete cascade,
  theme_id            uuid not null references themes(id) on delete cascade,
  relevance_score     float not null default 0.5,
  validated_by_user   boolean not null default false,
  attached_at         timestamptz not null default now(),
  primary key (alinea_id, theme_id)
);

-- people : personnes qui comptent
create table if not exists people (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles(id) on delete cascade,
  name                  text not null,
  nickname              text,
  relation              text,
  relation_type         text check (relation_type in ('famille', 'amitié', 'professionnel', 'romantique', 'autre')),
  birth_year            int,
  is_deceased           boolean not null default false,
  death_year            int,
  first_mention         text not null default 'manual'
                        check (first_mention in ('onboarding', 'frise', 'alinea', 'manual')),
  ai_summary            text,
  alinea_count          int not null default 0,
  pending_qualification boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- people_relations : liens déclarés entre personnes
create table if not exists people_relations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  person_a_id     uuid not null references people(id) on delete cascade,
  person_b_id     uuid not null references people(id) on delete cascade,
  relation_label  text,
  confirmed       boolean not null default false,
  declared_in     text not null default 'dialogue'
                  check (declared_in in ('dialogue', 'manual')),
  created_at      timestamptz not null default now()
);

-- life_event_people : personnes liées à un événement de frise
create table if not exists life_event_people (
  life_event_id   uuid not null references life_events(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  primary key (life_event_id, person_id)
);

-- alinea_people : personnes liées à un alinéa
create table if not exists alinea_people (
  alinea_id   uuid not null references alineas(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  role        text not null default 'present'
              check (role in ('present', 'mentioned', 'addressee')),
  primary key (alinea_id, person_id)
);

-- Ajouter le statut aux alinéas existants
alter table alineas add column if not exists
  status text not null default 'draft'
  check (status in ('draft', 'validated'));

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table user_memory       enable row level security;
alter table themes             enable row level security;
alter table life_events        enable row level security;
alter table alinea_themes      enable row level security;
alter table people             enable row level security;
alter table people_relations   enable row level security;
alter table life_event_people  enable row level security;
alter table alinea_people      enable row level security;

create policy "user_memory_own" on user_memory using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "themes_own"      on themes      using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "life_events_own" on life_events using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "people_own"      on people      using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "people_relations_own" on people_relations using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "alinea_themes_select" on alinea_themes for select using (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);
create policy "alinea_themes_write" on alinea_themes for all with check (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);
create policy "life_event_people_select" on life_event_people for select using (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);
create policy "life_event_people_write" on life_event_people for all with check (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);
create policy "alinea_people_select" on alinea_people for select using (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);
create policy "alinea_people_write" on alinea_people for all with check (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);

-- ── Index ─────────────────────────────────────────────────────────────────────

create index if not exists themes_user_id_idx        on themes(user_id);
create index if not exists life_events_user_year_idx on life_events(user_id, year);
create index if not exists people_user_id_idx        on people(user_id);
create index if not exists people_relations_user_idx on people_relations(user_id);

-- ── Triggers updated_at ───────────────────────────────────────────────────────

create or replace function update_updated_at_col()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger user_memory_upd   before update on user_memory   for each row execute function update_updated_at_col();
create trigger themes_upd        before update on themes        for each row execute function update_updated_at_col();
create trigger life_events_upd   before update on life_events   for each row execute function update_updated_at_col();
create trigger people_upd        before update on people        for each row execute function update_updated_at_col();

-- 016_agentic_memory_engine.sql
-- Moteur de mémoire agentique (Conception-moteur-memoire-agentique, 07/07/2026)
-- ============================================================
-- Changements :
--   1. Table places (promotion depuis le JSONB user_memory.key_places) + jonctions
--   2. people : faits structurés dates/lieux (naissance, décès)
--   3. review_queue : file de révision généralisée (alimentée par flag_ambiguous)
--   4. user_memory.last_consolidation_at (posé pour la future Boucle 2)
-- Non appliquée automatiquement — à lancer via ./scripts/migrate.sh dev
-- ============================================================


-- ============================================================
-- 1. TABLE places
-- Lieu de premier rang — remplace le JSONB user_memory.key_places pour tout
-- nouveau lieu capté par le moteur agentique. Pas de backfill des key_places
-- existants (base de dev/POC) : la colonne reste en place mais n'est plus
-- alimentée par le nouveau moteur.
-- ============================================================
create table if not exists places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  region      text,
  country     text,
  ai_summary  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table places enable row level security;

create policy "places_own" on places using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists places_user_id_idx on places(user_id);

create trigger places_upd before update on places
  for each row execute function update_updated_at_col();

-- Jonctions
create table if not exists alinea_places (
  alinea_id   uuid not null references alineas(id) on delete cascade,
  place_id    uuid not null references places(id) on delete cascade,
  primary key (alinea_id, place_id)
);

create table if not exists life_event_places (
  life_event_id uuid not null references life_events(id) on delete cascade,
  place_id      uuid not null references places(id) on delete cascade,
  primary key (life_event_id, place_id)
);

alter table alinea_places     enable row level security;
alter table life_event_places enable row level security;

create policy "alinea_places_select" on alinea_places for select using (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);
create policy "alinea_places_write" on alinea_places for all with check (
  exists (select 1 from alineas where alineas.id = alinea_id and alineas.user_id = auth.uid())
);
create policy "life_event_places_select" on life_event_places for select using (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);
create policy "life_event_places_write" on life_event_places for all with check (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);


-- ============================================================
-- 2. people : faits structurés — dates pleines + lieux (naissance/décès)
-- Réutilise le triplet year/month/day déjà en place (birth_year/death_year
-- existent depuis la migration 001) — on complète juste month/day + lieux.
-- ============================================================
alter table people
  add column if not exists birth_month integer check (birth_month between 1 and 12),
  add column if not exists birth_day   integer check (birth_day   between 1 and 31),
  add column if not exists death_month integer check (death_month between 1 and 12),
  add column if not exists death_day   integer check (death_day   between 1 and 31),
  add column if not exists birth_place text,
  add column if not exists death_place text;


-- ============================================================
-- 3. TABLE review_queue
-- Généralisation de theme_proposals — file d'ambiguïtés déposées par le tool
-- flag_ambiguous (boucle 1), consommée plus tard par la boucle 2 de
-- consolidation différée (non implémentée dans cette phase).
-- ============================================================
create table if not exists review_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  entity_type text not null,
  description text not null,
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at  timestamptz not null default now()
);

alter table review_queue enable row level security;

create policy "review_queue_own" on review_queue using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists review_queue_user_status_idx on review_queue(user_id, status);


-- ============================================================
-- 5. alineas.status : ajout de 'seed' (amorçage par le tool seed_alinea)
-- Cycle de vie proposé dans Conception-memoire-IA : seed → draft → validated.
-- ============================================================
alter table alineas drop constraint if exists alineas_status_check;
alter table alineas add constraint alineas_status_check check (status in ('seed', 'draft', 'validated'));


-- ============================================================
-- 4. user_memory.last_consolidation_at
-- Fenêtre de la future boucle 2 (« tout ce qui a changé depuis la dernière
-- passe ») — colonne posée maintenant, non lue/écrite dans cette phase.
-- ============================================================
alter table user_memory
  add column if not exists last_consolidation_at timestamptz;

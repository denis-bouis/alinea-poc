-- ============================================================
-- MIGRATION 013 — Phases de vie + restructuration life_event/alinea
-- 2026-06-26
-- ============================================================
-- Changements :
--   1. Nouvelle table life_phases
--   2. life_events : ajout event_month, event_day, life_phase_id
--   3. alineas : ajout life_event_id (FK nullable), sort_order
--   4. Migration des données life_event_alineas → alineas.life_event_id
--   5. Trigger : life_events.documented sync depuis alineas.life_event_id
--   6. Suppression de life_event_alineas
-- ============================================================


-- ============================================================
-- 1. TABLE life_phases
-- Périodes de vie — exclusives, séquentielles, nommées par l'utilisateur
-- ============================================================
create table if not exists life_phases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,       -- "L'enfance à Laayoune", "Les années Paris"
  description text,
  year_start  int  not null,
  year_end    int,                 -- null = phase en cours
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table life_phases enable row level security;

create policy "users: own life_phases" on life_phases
  for all using (auth.uid() = user_id);

create index on life_phases (user_id, year_start);


-- ============================================================
-- 2. life_events : compléter le triplet de date + FK phase
-- ============================================================
alter table life_events
  add column if not exists event_month   int
    check (event_month between 1 and 12),
  add column if not exists event_day     int
    check (event_day between 1 and 31),
  add column if not exists life_phase_id uuid
    references life_phases(id) on delete set null,
  add column if not exists documented    boolean not null default false;

create index on life_events (life_phase_id);


-- ============================================================
-- 3. alineas : FK life_event + sort_order
-- ============================================================
alter table alineas
  add column if not exists life_event_id uuid
    references life_events(id) on delete set null,
  add column if not exists sort_order    int not null default 0;

create index on alineas (life_event_id);


-- ============================================================
-- 4. Migration : life_event_alineas → alineas.life_event_id
-- Un alinéa appartient à au plus un life_event.
-- En cas de doublon improbable, on retient le life_event dont
-- l'year est le plus ancien (puis created_at).
-- NB : la table de jonction n'a jamais existé sur certaines bases ;
-- on ne migre que si elle est présente.
-- ============================================================

-- 4a. Affecter life_event_id (seulement si la table de jonction existe)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'life_event_alineas'
  ) then
    update alineas a
    set life_event_id = sub.life_event_id
    from (
      select distinct on (lea.alinea_id)
        lea.alinea_id,
        lea.life_event_id
      from life_event_alineas lea
      join life_events le on le.id = lea.life_event_id
      order by lea.alinea_id, le.year asc nulls last, le.created_at asc
    ) sub
    where a.id = sub.alinea_id;
  end if;
end $$;

-- 4b. Initialiser sort_order (position dans l'event, par date puis created_at)
update alineas a
set sort_order = sub.rn
from (
  select
    id,
    row_number() over (
      partition by life_event_id
      order by
        event_year   asc nulls last,
        event_month  asc nulls last,
        event_day    asc nulls last,
        created_at   asc
    )::int as rn
  from alineas
  where life_event_id is not null
) sub
where a.id = sub.id;


-- ============================================================
-- 5. Trigger : life_events.documented
-- Maintenu en sync depuis alineas.life_event_id
-- (remplace la logique manuelle via life_event_alineas)
-- ============================================================
create or replace function sync_life_event_documented()
returns trigger language plpgsql security definer as $$
declare
  affected_event_id uuid;
begin
  -- Déterminer l'event affecté selon l'opération
  if tg_op = 'DELETE' then
    affected_event_id := old.life_event_id;
  elsif tg_op = 'UPDATE' then
    -- Mettre à jour l'ancien event si life_event_id a changé
    if old.life_event_id is distinct from new.life_event_id
       and old.life_event_id is not null then
      update life_events set documented = exists (
        select 1 from alineas where life_event_id = old.life_event_id
      ) where id = old.life_event_id;
    end if;
    affected_event_id := new.life_event_id;
  else
    affected_event_id := new.life_event_id;
  end if;

  if affected_event_id is not null then
    update life_events set documented = exists (
      select 1 from alineas where life_event_id = affected_event_id
    ) where id = affected_event_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_alinea_documented on alineas;
create trigger trg_alinea_documented
  after insert or update of life_event_id or delete on alineas
  for each row execute procedure sync_life_event_documented();

-- Resync initial depuis les données migrées
update life_events le
set documented = exists (
  select 1 from alineas where life_event_id = le.id
);


-- ============================================================
-- 6. Supprimer life_event_alineas (remplacée par alineas.life_event_id)
-- ============================================================
drop table if exists life_event_alineas;

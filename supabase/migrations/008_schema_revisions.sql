-- 008_schema_revisions.sql
-- Révisions suite à la revue de conception du 2026-06-23
-- 1. life_event_themes : remplace life_events.theme_ids (array)
-- 2. themes.alinea_count + trigger
-- 3. people.alinea_count trigger (colonne déjà présente)
-- 4. Vue v_ai_profile — profil permanent IA (couche 1)

-- ── 1. life_event_themes ─────────────────────────────────────────────────────

create table if not exists life_event_themes (
  life_event_id  uuid not null references life_events(id) on delete cascade,
  theme_id       uuid not null references themes(id)      on delete cascade,
  validated      boolean not null default false,
  attached_at    timestamptz not null default now(),
  primary key (life_event_id, theme_id)
);

-- Migrer les données existantes depuis life_events.theme_ids
insert into life_event_themes (life_event_id, theme_id)
select le.id, unnest(le.theme_ids)
from life_events le
where array_length(le.theme_ids, 1) > 0
on conflict do nothing;

-- Supprimer la colonne array devenue redondante
alter table life_events drop column if exists theme_ids;

-- RLS
alter table life_event_themes enable row level security;

create policy "life_event_themes_select" on life_event_themes for select using (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);
create policy "life_event_themes_write" on life_event_themes for all with check (
  exists (select 1 from life_events where life_events.id = life_event_id and life_events.user_id = auth.uid())
);

create index if not exists life_event_themes_theme_idx on life_event_themes(theme_id);

-- ── 2. themes.alinea_count + trigger ─────────────────────────────────────────

alter table themes add column if not exists alinea_count int not null default 0;

-- Initialiser depuis les données existantes
update themes t set alinea_count = (
  select count(*) from alinea_themes at2 where at2.theme_id = t.id
);

create or replace function update_theme_alinea_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update themes set alinea_count = alinea_count + 1 where id = NEW.theme_id;
  elsif TG_OP = 'DELETE' then
    update themes set alinea_count = greatest(alinea_count - 1, 0) where id = OLD.theme_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_theme_alinea_count on alinea_themes;
create trigger trg_theme_alinea_count
  after insert or delete on alinea_themes
  for each row execute function update_theme_alinea_count();

-- ── 3. people.alinea_count trigger ───────────────────────────────────────────

-- Initialiser depuis les données existantes
update people p set alinea_count = (
  select count(*) from alinea_people ap where ap.person_id = p.id
);

create or replace function update_person_alinea_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update people set alinea_count = alinea_count + 1 where id = NEW.person_id;
  elsif TG_OP = 'DELETE' then
    update people set alinea_count = greatest(alinea_count - 1, 0) where id = OLD.person_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_person_alinea_count on alinea_people;
create trigger trg_person_alinea_count
  after insert or delete on alinea_people
  for each row execute function update_person_alinea_count();

-- ── 4. Vue v_ai_profile ───────────────────────────────────────────────────────
-- Profil permanent IA — couche 1, chargé à chaque appel
-- security_invoker : la vue hérite du RLS des tables sous-jacentes

create or replace view v_ai_profile
with (security_invoker = true)
as
select
  p.id                              as user_id,
  p.display_name,
  um.birth_year,
  um.portrait,
  um.default_narrative_style        as narrative_style,
  coalesce(
    (select json_agg(
              json_build_object('name', t.name, 'maturity', t.maturity)
              order by t.created_at)
       from themes t
      where t.user_id = p.id
        and t.maturity <> 'closed'),
    '[]'::json
  ) as themes_summary,
  coalesce(
    (select json_agg(
              json_build_object('name', pe.name, 'relation', pe.relation,
                                'relation_type', pe.relation_type)
              order by pe.created_at)
       from people pe
      where pe.user_id = p.id),
    '[]'::json
  ) as people_summary
from profiles p
left join user_memory um on um.user_id = p.id;

-- Migration 010 : contrainte unique sur themes(user_id, name)
-- 1. Déduplique les lignes existantes (garde l'entrée la plus ancienne)
-- 2. Ajoute la contrainte unique pour prévenir les futurs doublons

-- ── 1. Réaffecter les références vers le doublon → entrée conservée ──────────

-- life_event_themes
with dupes as (
  select
    id,
    user_id,
    name,
    first_value(id) over (partition by user_id, lower(name) order by created_at) as keep_id
  from themes
)
update life_event_themes
  set theme_id = dupes.keep_id
from dupes
where life_event_themes.theme_id = dupes.id
  and dupes.id <> dupes.keep_id;

-- alinea_themes
with dupes as (
  select
    id,
    user_id,
    name,
    first_value(id) over (partition by user_id, lower(name) order by created_at) as keep_id
  from themes
)
update alinea_themes
  set theme_id = dupes.keep_id
from dupes
where alinea_themes.theme_id = dupes.id
  and dupes.id <> dupes.keep_id;

-- ── 2. Supprimer les doublons (tout sauf le plus ancien) ─────────────────────

delete from themes
where id in (
  select id from (
    select
      id,
      row_number() over (partition by user_id, lower(name) order by created_at) as rn
    from themes
  ) ranked
  where rn > 1
);

-- ── 3. Ajouter la contrainte unique ──────────────────────────────────────────

alter table themes
  add constraint themes_user_id_name_unique unique (user_id, name);

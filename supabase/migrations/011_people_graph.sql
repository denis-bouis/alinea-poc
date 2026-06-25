-- 011_people_graph.sql
-- Modélisation arbre généalogique + toile d'amitié (2026-06-25)
-- 1. family_units          : cellule familiale (paire de parents + union)
-- 2. family_unit_children  : appartenance d'un enfant à une cellule
-- 3. people_relations      : relation_label → relation_type (enum structuré)
--                            + is_symmetric, qualifier, family_unit_id

-- ── 1. family_units ──────────────────────────────────────────────────────────
-- Brique de base de l'arbre généalogique.
-- parent_1_id / parent_2_id nullable = parent inconnu ou parent unique.
-- L'arbre se traverse en remontant les cellules où l'utilisateur est child
-- (générations +) ou en descendant celles où il est parent (générations −).

create table if not exists family_units (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  parent_1_id     uuid references people(id) on delete set null,
  parent_2_id     uuid references people(id) on delete set null,
  union_type      text not null default 'unknown'
                  check (union_type in ('married', 'civil_union', 'cohabiting', 'unknown')),
  union_year      int,
  separation_year int,
  created_at      timestamptz not null default now()
);

-- ── 2. family_unit_children ───────────────────────────────────────────────────

create table if not exists family_unit_children (
  unit_id     uuid not null references family_units(id) on delete cascade,
  child_id    uuid not null references people(id) on delete cascade,
  link_type   text not null default 'biological'
              check (link_type in ('biological', 'adoptive')),
  primary key (unit_id, child_id)
);

-- ── 3. people_relations : refonte relation_label → relation_type ──────────────

-- 3a. Nouvelles colonnes (nullable d'abord, contraintes après migration)
alter table people_relations
  add column if not exists relation_type   text,
  add column if not exists is_symmetric    boolean not null default true,
  add column if not exists qualifier       text,
  add column if not exists family_unit_id  uuid references family_units(id) on delete set null;

-- 3b. Migrer relation_label → relation_type (best-effort sur les données existantes)
update people_relations set relation_type = 'partner_of',   is_symmetric = true
  where lower(coalesce(relation_label, '')) similar to '%(conjoint|partner|couple)%';

update people_relations set relation_type = 'parent_of',    is_symmetric = false
  where lower(coalesce(relation_label, '')) similar to '%(parent|mère|père|mother|father)%'
    and relation_type is null;

update people_relations set relation_type = 'child_of',     is_symmetric = false
  where lower(coalesce(relation_label, '')) similar to '%(enfant|fils|fille|child|son|daughter)%'
    and relation_type is null;

update people_relations set relation_type = 'sibling_of',   is_symmetric = true
  where lower(coalesce(relation_label, '')) similar to '%(fr[eè]re|s[oœ]eur|fratrie|sibling)%'
    and relation_type is null;

update people_relations set relation_type = 'friend_of',    is_symmetric = true
  where lower(coalesce(relation_label, '')) similar to '%(ami|friend)%'
    and relation_type is null;

update people_relations set relation_type = 'colleague_of', is_symmetric = true
  where lower(coalesce(relation_label, '')) similar to '%(coll[eè]gue|colleague)%'
    and relation_type is null;

update people_relations set relation_type = 'mentor_of',    is_symmetric = false
  where lower(coalesce(relation_label, '')) similar to '%mentor%'
    and relation_type is null;

-- Fallback : toute ligne non mappée → friend_of
update people_relations
  set relation_type = 'friend_of', is_symmetric = true
  where relation_type is null;

-- 3c. Contrainte enum + not null sur relation_type
alter table people_relations
  add constraint people_relations_relation_type_check
  check (relation_type in (
    'parent_of', 'child_of', 'sibling_of',   -- filiation
    'partner_of',                              -- alliance
    'friend_of', 'colleague_of', 'mentor_of'  -- social
  ));

alter table people_relations
  alter column relation_type set not null;

-- 3d. Contrainte sur qualifier
alter table people_relations
  add constraint people_relations_qualifier_check
  check (qualifier in ('biological', 'adoptive'));

-- 3e. Étendre declared_in pour inclure 'onboarding'
--     Suppression dynamique : le nom auto-généré peut varier selon l'environnement
do $$
declare
  cname text;
begin
  for cname in
    select conname from pg_constraint
    where conrelid = 'people_relations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%declared_in%'
  loop
    execute format('alter table people_relations drop constraint %I', cname);
  end loop;
end;
$$;

alter table people_relations
  add constraint people_relations_declared_in_check
  check (declared_in in ('dialogue', 'manual', 'onboarding'));

-- 3f. Supprimer l'ancienne colonne
alter table people_relations drop column if exists relation_label;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table family_units         enable row level security;
alter table family_unit_children enable row level security;

create policy "family_units_own" on family_units
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "family_unit_children_select" on family_unit_children
  for select using (
    exists (select 1 from family_units
            where family_units.id = unit_id and family_units.user_id = auth.uid())
  );

create policy "family_unit_children_write" on family_unit_children
  for all with check (
    exists (select 1 from family_units
            where family_units.id = unit_id and family_units.user_id = auth.uid())
  );

-- ── Index ─────────────────────────────────────────────────────────────────────

create index if not exists family_units_user_id_idx       on family_units(user_id);
create index if not exists family_unit_children_unit_idx  on family_unit_children(unit_id);
create index if not exists family_unit_children_child_idx on family_unit_children(child_id);
create index if not exists people_relations_type_idx      on people_relations(relation_type);

-- 021_self_entity_and_relation_types.sql
-- Résout la lacune de modèle notée le 09/07 : l'utilisateur (compte)
-- n'existait pas comme entité `people`, donc impossible de déclarer un lien
-- structuré (people_relations) entre lui-même et une personne existante.
-- Conséquence directe : FamilyTree.tsx devait reconstruire les générations
-- par regex sur people.relation (texte libre) — fragile, cassé par la
-- bascule de langue de conversation (migration 020).
--
-- 1. people.is_self : un nœud "moi" par utilisateur, créé automatiquement
--    (trigger handle_new_user) et rétro-créé ici pour les comptes existants.
-- 2. people_relations.relation_type étendu — types directs (pas de calcul
--    transitif requis) pour couvrir ce que le regex détectait : grands-
--    parents, arrière-grands-parents, oncles/tantes, cousins, beaux-
--    parents, parrains/marraines.
-- 3. Correction au passage : la contrainte qualifier était calquée par
--    erreur sur family_unit_children.link_type ('biological'/'adoptive')
--    alors que qualifier est un texte libre (ex. "demi-sœur") — toute
--    déclaration avec qualifier échouait silencieusement en base.
-- 4. Backfill : nœud "moi" + traduction best-effort des people.relation
--    existants (mêmes mots-clés que l'ancien regex FamilyTree) en arêtes
--    people_relations structurées.

-- ── 1. Colonne is_self + unicité ──────────────────────────────────────────────

alter table people
  add column if not exists is_self boolean not null default false;

create unique index if not exists people_one_self_per_user_idx
  on people(user_id) where is_self;

-- ── 2. Extension de l'enum relation_type ──────────────────────────────────────

alter table people_relations drop constraint if exists people_relations_relation_type_check;

alter table people_relations
  add constraint people_relations_relation_type_check
  check (relation_type in (
    'parent_of', 'child_of', 'sibling_of',                      -- filiation directe
    'partner_of',                                                 -- alliance
    'grandparent_of', 'grandchild_of',                            -- filiation x2
    'great_grandparent_of', 'great_grandchild_of',                -- filiation x3
    'aunt_uncle_of', 'niece_nephew_of',                           -- collatéral direct
    'cousin_of',                                                   -- collatéral symétrique
    'parent_in_law_of', 'child_in_law_of',                        -- alliance filiation
    'godparent_of', 'godchild_of',                                -- parrainage
    'friend_of', 'colleague_of', 'mentor_of'                     -- social (existant)
  ));

-- ── 3. Fix qualifier (texte libre, jamais dû être contraint) ─────────────────

alter table people_relations drop constraint if exists people_relations_qualifier_check;

-- ── 4. Trigger : le nœud "moi" est créé avec le profil, pour les nouveaux comptes ─

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.people (user_id, name, is_self, first_mention)
  values (new.id, split_part(new.email, '@', 1), true, 'manual');

  return new;
end;
$$ language plpgsql security definer;

-- ── 5. Backfill comptes existants : nœud "moi" ────────────────────────────────

insert into people (user_id, name, is_self, first_mention)
select p.id, coalesce(p.display_name, split_part(p.email, '@', 1)), true, 'manual'
from profiles p
where not exists (select 1 from people pe where pe.user_id = p.id and pe.is_self);

-- ── 6. Backfill : traduction best-effort de people.relation → people_relations ──
-- Mêmes mots-clés que l'ancien FamilyTree.inferGenBasic/isSibling/isSpouseRel,
-- ordre de priorité identique (arrière-grand avant grand, grand avant père/mère).

create temporary table mapped_backfill as
select
  pe.id as person_id,
  pe.user_id,
  self.id as self_id,
  case
    when lower(coalesce(pe.relation, '')) similar to '%(arrière[- ]grand)%' then 'great_grandchild_of'
    when lower(coalesce(pe.relation, '')) similar to '%(grands?[- ]?(père|mère|pa|ma|parent)|aïeul|bisaïeul)%' then 'grandchild_of'
    when lower(coalesce(pe.relation, '')) similar to '%(père|mère|papa|maman|beau[- ]?père|belle[- ]?mère)%' then 'child_of'
    when lower(coalesce(pe.relation, '')) similar to '%(oncle|tante)%' then 'niece_nephew_of'
    when lower(coalesce(pe.relation, '')) similar to '%(parrain|marraine)%' then 'godchild_of'
    when lower(coalesce(pe.relation, '')) similar to '%(petite?[- ]?(fils|fille|enfant))%' then 'grandparent_of'
    when lower(coalesce(pe.relation, '')) similar to '%(fils|fille|beau[- ]?fils|belle[- ]?fille|enfant)%' then 'parent_of'
    when lower(coalesce(pe.relation, '')) similar to '%(neveu|nièce)%' then 'aunt_uncle_of'
    when lower(coalesce(pe.relation, '')) similar to '%(frère|sœur|soeur)%' then 'sibling_of'
    when lower(coalesce(pe.relation, '')) similar to '%(cousin|cousine)%' then 'cousin_of'
    when lower(coalesce(pe.relation, '')) similar to '%(conjoint|époux|épouse|femme|mari|compagnon|compagne|partenaire|concubin)%' then 'partner_of'
    else null
  end as rel_type
from people pe
join people self on self.user_id = pe.user_id and self.is_self = true
where pe.relation_type = 'famille' and pe.is_self = false;

-- Sens direct : moi → personne (relation_type = ce que je suis pour elle)
insert into people_relations (user_id, person_a_id, person_b_id, relation_type, is_symmetric, qualifier, family_unit_id, confirmed, declared_in)
select user_id, self_id, person_id, rel_type,
       rel_type in ('sibling_of', 'partner_of', 'cousin_of'),
       null, null, true, 'manual'
from mapped_backfill
where rel_type is not null;

-- Sens inverse (types asymétriques) : personne → moi
insert into people_relations (user_id, person_a_id, person_b_id, relation_type, is_symmetric, qualifier, family_unit_id, confirmed, declared_in)
select user_id, person_id, self_id,
  case rel_type
    when 'child_of' then 'parent_of'
    when 'parent_of' then 'child_of'
    when 'grandchild_of' then 'grandparent_of'
    when 'grandparent_of' then 'grandchild_of'
    when 'great_grandchild_of' then 'great_grandparent_of'
    when 'great_grandparent_of' then 'great_grandchild_of'
    when 'aunt_uncle_of' then 'niece_nephew_of'
    when 'niece_nephew_of' then 'aunt_uncle_of'
    when 'godchild_of' then 'godparent_of'
    when 'godparent_of' then 'godchild_of'
  end,
  false, null, null, true, 'manual'
from mapped_backfill
where rel_type in ('child_of', 'parent_of', 'grandchild_of', 'grandparent_of',
                    'great_grandchild_of', 'great_grandparent_of',
                    'aunt_uncle_of', 'niece_nephew_of', 'godchild_of', 'godparent_of');

-- Sens inverse (types symétriques) : même relation_type, personne → moi
insert into people_relations (user_id, person_a_id, person_b_id, relation_type, is_symmetric, qualifier, family_unit_id, confirmed, declared_in)
select user_id, person_id, self_id, rel_type, true, null, null, true, 'manual'
from mapped_backfill
where rel_type in ('sibling_of', 'partner_of', 'cousin_of');

drop table mapped_backfill;

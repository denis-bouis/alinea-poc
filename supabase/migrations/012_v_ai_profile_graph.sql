-- 012_v_ai_profile_graph.sql
-- Mise à jour de v_ai_profile pour inclure le graphe de relations (2026-06-25)
--
-- Changements par rapport à la version 008 :
-- 1. people_summary  : filtre les personnes en attente de qualification,
--                      ajoute alinea_count et is_deceased, trie par présence
-- 2. relations_summary (nouveau) : liens inter-personnes confirmés,
--                      noms résolus, symétriques dédupliqués

create or replace view v_ai_profile
with (security_invoker = true)
as
select
  p.id                           as user_id,
  p.display_name,
  um.birth_year,
  um.portrait,
  um.default_narrative_style     as narrative_style,

  -- Thématiques actives, triées par ancienneté
  coalesce(
    (select json_agg(
              json_build_object('name', t.name, 'maturity', t.maturity)
              order by t.created_at)
       from themes t
      where t.user_id = p.id
        and t.maturity <> 'closed'),
    '[]'::json
  ) as themes_summary,

  -- Personnes qualifiées, triées par nombre d'alinéas (les plus présentes en premier)
  coalesce(
    (select json_agg(
              json_build_object(
                'name',         pe.name,
                'relation',     pe.relation,
                'category',     pe.relation_type,
                'alinea_count', pe.alinea_count,
                'is_deceased',  pe.is_deceased
              )
              order by pe.alinea_count desc, pe.created_at)
       from people pe
      where pe.user_id = p.id
        and pe.pending_qualification = false),
    '[]'::json
  ) as people_summary,

  -- Graphe inter-personnes — relations confirmées avec noms résolus
  -- Règle de déduplication :
  --   is_symmetric = false → A→B inclus tel quel (la direction a un sens)
  --   is_symmetric = true  → une seule ligne par paire, condition person_a_id < person_b_id
  coalesce(
    (select json_agg(r.obj)
       from (
         -- Relations directionnelles : toutes
         select json_build_object(
                  'from', pa.name,
                  'to',   pb.name,
                  'type', pr.relation_type
                ) as obj
           from people_relations pr
           join people pa on pa.id = pr.person_a_id
           join people pb on pb.id = pr.person_b_id
          where pr.user_id = p.id
            and pr.confirmed = true
            and pr.is_symmetric = false

         union all

         -- Relations symétriques : une seule ligne par paire
         select json_build_object(
                  'from', pa.name,
                  'to',   pb.name,
                  'type', pr.relation_type
                ) as obj
           from people_relations pr
           join people pa on pa.id = pr.person_a_id
           join people pb on pb.id = pr.person_b_id
          where pr.user_id = p.id
            and pr.confirmed = true
            and pr.is_symmetric = true
            and pr.person_a_id < pr.person_b_id
       ) r
    ),
    '[]'::json
  ) as relations_summary

from profiles p
left join user_memory um on um.user_id = p.id;

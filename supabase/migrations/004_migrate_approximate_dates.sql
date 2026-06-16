-- Migration des approximate_date texte → event_year / event_month / event_day
-- Formats gérés :
--   YYYY-MM-DD        ex. "2026-06-15"
--   DD MMMM YYYY      ex. "12 juin 1992"
--   MMMM YYYY         ex. "juin 1985"
--   vers YYYY / YYYY  ex. "vers 1985", "1985", "été 1968"

update public.alineas
set
  -- ── Année ────────────────────────────────────────────────────────────────────
  event_year = case
    -- Format ISO YYYY-MM-DD
    when approximate_date ~ '^\d{4}-\d{2}-\d{2}$'
      then split_part(approximate_date, '-', 1)::integer
    -- Tout autre format : premier nombre à 4 chiffres (1000-2099)
    when approximate_date ~ '(1[0-9]{3}|20[0-9]{2})'
      then (regexp_match(approximate_date, '(1[0-9]{3}|20[0-9]{2})'))[1]::integer
    else null
  end,

  -- ── Mois ─────────────────────────────────────────────────────────────────────
  event_month = case
    -- Format ISO
    when approximate_date ~ '^\d{4}-\d{2}-\d{2}$'
      then split_part(approximate_date, '-', 2)::integer
    -- Noms de mois français (complets ou abrégés, avec ou sans accent)
    when lower(approximate_date) ~ 'janv'                then 1
    when lower(approximate_date) ~ 'janvier'             then 1
    when lower(approximate_date) ~ 'f[eé]vr'            then 2
    when lower(approximate_date) ~ 'mars'                then 3
    when lower(approximate_date) ~ 'avr'                 then 4
    when lower(approximate_date) ~ 'mai'                 then 5
    when lower(approximate_date) ~ 'juin'                then 6
    when lower(approximate_date) ~ 'juill'               then 7
    when lower(approximate_date) ~ 'ao[uû]t'            then 8
    when lower(approximate_date) ~ 'sept'                then 9
    when lower(approximate_date) ~ 'oct'                 then 10
    when lower(approximate_date) ~ 'nov'                 then 11
    when lower(approximate_date) ~ 'd[eé]c'             then 12
    else null
  end,

  -- ── Jour ─────────────────────────────────────────────────────────────────────
  event_day = case
    -- Format ISO
    when approximate_date ~ '^\d{4}-\d{2}-\d{2}$'
      then split_part(approximate_date, '-', 3)::integer
    -- Nombre 1-31 en début de chaîne suivi d'un espace + nom de mois
    when lower(approximate_date) ~ '^(3[01]|[12][0-9]|[1-9]) (jan|f[eé]v|mar|avr|mai|jui|ao|sep|oct|nov|d[eé]c)'
      then (regexp_match(approximate_date, '^([0-9]{1,2}) '))[1]::integer
    else null
  end

where approximate_date is not null
  and event_year is null;  -- ne pas écraser des valeurs déjà saisies manuellement

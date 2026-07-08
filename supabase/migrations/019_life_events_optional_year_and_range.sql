-- 019_life_events_optional_year_and_range.sql
-- Deux limites du modèle de date des événements :
-- 1. `year` était obligatoire, poussant à deviner l'année en cours quand
--    l'utilisateur n'a pas précisé de date (cf. remarque de test) — il doit
--    pouvoir rester non daté, à l'image de life_phases.year_start (migration 015).
-- 2. Un événement peut couvrir une période (ex. un voyage de plusieurs
--    semaines), pas seulement un jour ponctuel — on ajoute une date de fin
--    optionnelle, symétrique de year/event_month/event_day.

alter table life_events
  alter column year drop not null,
  add column year_end int,
  add column event_month_end int,
  add column event_day_end int;

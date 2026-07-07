-- 015_life_phases_year_start_nullable.sql
-- Au fil d'un récit, l'IA capte souvent une phase de vie (« l'enfance »,
-- « les années d'études ») bien avant d'en connaître l'année exacte de début.
-- On autorise donc une phase nommée mais non encore datée ; year_start sera
-- précisé plus tard (par le dialogue ou par les events qui s'y rattachent).

alter table life_phases
  alter column year_start drop not null;

-- 017_people_email_phone.sql
-- Coordonnées optionnelles d'une personne (email, téléphone) — complètent les
-- faits déjà capturés (naissance/décès). Servira à terme de base pour mettre
-- en correspondance des personnes déclarées avec de vrais comptes Alinéa.

alter table people
  add column email text,
  add column phone text;

-- 014_people_first_mention_dialogue.sql
-- La mémorisation est désormais pilotée par le chat : une personne détectée en
-- conversation a pour provenance 'dialogue'. L'ancienne contrainte CHECK ne
-- l'autorisait pas, ce qui faisait échouer silencieusement l'insertion.

alter table people
  drop constraint if exists people_first_mention_check;

-- Le nom de contrainte généré par Postgres peut varier ; on couvre les deux cas.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'people' and column_name = 'first_mention'
  ) then
    -- supprimer toute contrainte CHECK restante sur la colonne
    execute (
      select string_agg('alter table people drop constraint ' || quote_ident(conname) || ';', ' ')
      from pg_constraint
      where conrelid = 'people'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%first_mention%'
    );
  end if;
end $$;

alter table people
  add constraint people_first_mention_check
  check (first_mention in ('onboarding', 'frise', 'alinea', 'manual', 'dialogue'));

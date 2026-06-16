alter table public.alineas add column event_month integer check (event_month between 1 and 12);
alter table public.alineas add column event_day   integer check (event_day   between 1 and 31);

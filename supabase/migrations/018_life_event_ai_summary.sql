-- 018_life_event_ai_summary.sql
-- Les événements de frise n'avaient pas de synthèse IA propre, contrairement
-- aux personnes et lieux (ai_summary, fusionné à chaque nouvel apport plutôt
-- que juxtaposé). Un événement pouvant porter plusieurs alinéas, cette
-- synthèse sert de vue d'ensemble indépendante du détail de chaque alinéa.

alter table life_events
  add column ai_summary text;

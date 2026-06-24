-- 009_onboarding_step.sql
-- Révisions liées au flow d'onboarding détaillé (2026-06-23)
-- 1. onboarding_step remplace onboarding_completed
-- 2. user_memory : key_places + dominant_emotions
-- 3. life_events : is_pivot

-- ── 1. profiles : onboarding_step ────────────────────────────────────────────

alter table profiles add column if not exists onboarding_step int not null default 0;

-- Migrer les utilisateurs déjà onboardés
update profiles set onboarding_step = 10 where onboarding_completed = true;

alter table profiles drop column if exists onboarding_completed;

-- ── 2. user_memory : key_places + dominant_emotions ─────────────────────────

alter table user_memory
  add column if not exists key_places         jsonb not null default '[]',
  add column if not exists dominant_emotions  jsonb not null default '[]';

-- ── 3. life_events : is_pivot ────────────────────────────────────────────────

alter table life_events
  add column if not exists is_pivot             boolean not null default false,
  add column if not exists emotional_intensity  int     not null default 1
                           check (emotional_intensity between 0 and 3);

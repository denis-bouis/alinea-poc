-- Extensions
create extension if not exists "uuid-ossp";

-- Profiles (étend auth.users de Supabase)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  tier text not null default 'discovery' check (tier in ('discovery', 'memory')),
  created_at timestamptz not null default now()
);

-- Alinéas
create table public.alineas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text,
  content text,
  format text not null default 'text' check (format in ('text', 'voice', 'vlog', 'photo')),
  media_url text,
  visibility text not null default 'private' check (
    visibility in ('confidential', 'private', 'family', 'circle', 'public', 'testament')
  ),
  emotion text check (emotion in ('joy', 'pride', 'nostalgia', 'sadness', 'gratitude')),
  category text check (
    category in ('places', 'people', 'moments', 'transitions', 'objects', 'values')
  ),
  approximate_date text, -- "vers 1985" ou "été de mes 20 ans" — texte libre intentionnel
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cercles de partage
create table public.circles (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- Membres d'un cercle
create table public.circle_members (
  circle_id uuid references public.circles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- Association alinéa ↔ cercles autorisés
create table public.alinea_circles (
  alinea_id uuid references public.alineas(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  primary key (alinea_id, circle_id)
);

-- Trigger updated_at sur alineas
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger alineas_updated_at
  before update on public.alineas
  for each row execute function public.set_updated_at();

-- Trigger : créer le profil automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.alineas enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.alinea_circles enable row level security;

-- Policies profiles
create policy "Profil visible par son propriétaire"
  on public.profiles for select using (auth.uid() = id);

create policy "Profil modifiable par son propriétaire"
  on public.profiles for update using (auth.uid() = id);

-- Policies alinéas
create policy "Alinéas visibles par leur auteur"
  on public.alineas for select using (auth.uid() = user_id);

create policy "Alinéas publics visibles par tous"
  on public.alineas for select using (visibility = 'public');

create policy "Alinéas de cercle visibles par les membres"
  on public.alineas for select using (
    visibility in ('family', 'circle') and
    exists (
      select 1 from public.alinea_circles ac
      join public.circle_members cm on cm.circle_id = ac.circle_id
      where ac.alinea_id = alineas.id and cm.user_id = auth.uid()
    )
  );

create policy "Alinéas créables par utilisateurs authentifiés"
  on public.alineas for insert with check (auth.uid() = user_id);

create policy "Alinéas modifiables par leur auteur"
  on public.alineas for update using (auth.uid() = user_id);

create policy "Alinéas supprimables par leur auteur"
  on public.alineas for delete using (auth.uid() = user_id);

-- Policies cercles
create policy "Cercles visibles par leur propriétaire"
  on public.circles for select using (auth.uid() = owner_id);

create policy "Cercles créables par utilisateurs authentifiés"
  on public.circles for insert with check (auth.uid() = owner_id);

create policy "Cercles modifiables par leur propriétaire"
  on public.circles for update using (auth.uid() = owner_id);

create policy "Cercles supprimables par leur propriétaire"
  on public.circles for delete using (auth.uid() = owner_id);

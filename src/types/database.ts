export type VisibilityLevel =
  | 'confidential'
  | 'private'
  | 'family'
  | 'circle'
  | 'public'
  | 'testament'

export type CaptureFormat = 'text' | 'voice' | 'vlog' | 'photo'
export type EmotionTag = 'joy' | 'pride' | 'nostalgia' | 'sadness' | 'gratitude'
export type ThematicCategory = 'places' | 'people' | 'moments' | 'transitions' | 'objects' | 'values'

type ProfileRow = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  onboarding_step: number     // 0 = non commencé, 10 = terminé
  tier: 'discovery' | 'memory'
  created_at: string
}

type AlineaRow = {
  id: string
  user_id: string
  title: string | null
  content: string | null
  format: CaptureFormat
  media_url: string | null
  visibility: VisibilityLevel
  emotion: EmotionTag | null
  category: ThematicCategory | null
  approximate_date: string | null
  event_year: number | null
  event_month: number | null
  event_day: number | null
  location: string | null
  ai_memory: string | null
  status: 'seed' | 'draft' | 'validated'
  life_event_id: string | null   // migration 013
  sort_order: number             // migration 013
  created_at: string
  updated_at: string
}

type CircleRow = {
  id: string
  owner_id: string
  name: string
  created_at: string
}

type CircleMemberRow = {
  circle_id: string
  user_id: string
  added_at: string
}

type AlineaCircleRow = {
  alinea_id: string
  circle_id: string
}

type UserMemoryRow = {
  id: string
  user_id: string
  birth_year: number | null
  portrait: string | null
  default_narrative_style: string
  key_places: Array<{ name: string; role: string }>          // migration 009 — dépréciée, cf. `places` (migration 016)
  dominant_emotions: Array<{ value: string; context: string }> // migration 009
  last_consolidation_at: string | null                        // migration 016 — réservé boucle 2 (non utilisé)
  created_at: string
  updated_at: string
}

type ThemeRow = {
  id: string
  user_id: string
  name: string
  color: string
  maturity: 'emerging' | 'active' | 'major' | 'closed'
  ai_summary: string | null
  alinea_count: number   // migration 008 — maintenu par trigger
  created_at: string
  updated_at: string
}

type LifeEventRow = {
  id: string
  user_id: string
  year: number
  event_month: number | null     // migration 013
  event_day: number | null       // migration 013
  life_phase_id: string | null    // migration 013
  title: string
  status: 'undocumented' | 'draft' | 'validated'
  documented: boolean            // migration 013
  is_pivot: boolean              // migration 009
  emotional_intensity: number    // migration 009 — 0 à 3
  created_at: string
  updated_at: string
}

type LifePhaseRow = {            // migration 013
  id: string
  user_id: string
  name: string
  description: string | null
  year_start: number | null
  year_end: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

type LifeEventThemeRow = {       // migration 008 — remplace life_events.theme_ids
  life_event_id: string
  theme_id: string
  validated: boolean
  attached_at: string
}

type AlineaThemeRow = {
  alinea_id: string
  theme_id: string
  relevance_score: number
  validated_by_user: boolean
  attached_at: string
}

type PersonRow = {
  id: string
  user_id: string
  name: string
  nickname: string | null
  relation: string | null
  relation_type: 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre' | null
  birth_year: number | null
  birth_month: number | null    // migration 016
  birth_day: number | null      // migration 016
  is_deceased: boolean
  death_year: number | null
  death_month: number | null    // migration 016
  death_day: number | null      // migration 016
  birth_place: string | null    // migration 016
  death_place: string | null    // migration 016
  first_mention: 'onboarding' | 'frise' | 'alinea' | 'manual' | 'dialogue'
  ai_summary: string | null
  alinea_count: number   // maintenu par trigger
  pending_qualification: boolean
  created_at: string
  updated_at: string
}

type PlaceRow = {              // migration 016
  id: string
  user_id: string
  name: string
  region: string | null
  country: string | null
  ai_summary: string | null
  created_at: string
  updated_at: string
}

type AlineaPlaceRow = {        // migration 016
  alinea_id: string
  place_id: string
}

type LifeEventPlaceRow = {     // migration 016
  life_event_id: string
  place_id: string
}

type ReviewQueueRow = {        // migration 016
  id: string
  user_id: string
  entity_type: string
  description: string
  payload: Record<string, unknown>
  status: 'pending' | 'resolved'
  created_at: string
}

type PersonRelationRow = {
  id: string
  user_id: string
  person_a_id: string
  person_b_id: string
  relation_type: string
  is_symmetric: boolean
  qualifier: string | null
  family_unit_id: string | null
  confirmed: boolean
  declared_in: 'dialogue' | 'manual' | 'onboarding'
  created_at: string
}

type FamilyUnitRow = {
  id: string
  user_id: string
  parent_1_id: string | null
  parent_2_id: string | null
  union_type: 'married' | 'civil_union' | 'cohabiting' | 'unknown'
  union_year: number | null
  separation_year: number | null
  created_at: string
}

type FamilyUnitChildRow = {
  unit_id: string
  child_id: string
  link_type: 'biological' | 'adoptive'
}

type LifeEventPeopleRow = {
  life_event_id: string
  person_id: string
}

type AlineaPeopleRow = {
  alinea_id: string
  person_id: string
  role: 'present' | 'mentioned' | 'addressee'
}

type AiProfileView = {
  user_id: string
  display_name: string | null
  birth_year: number | null
  portrait: string | null
  narrative_style: string | null
  themes_summary: Array<{ name: string; maturity: string }> | null
  people_summary: Array<{ name: string; relation: string | null; relation_type: string | null; alinea_count: number; is_deceased: boolean }> | null
  relations_summary: Array<{ from: string; to: string; type: string }> | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Omit<ProfileRow, 'created_at'>
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at'>>
        Relationships: []
      }
      alineas: {
        Row: AlineaRow
        Insert: Omit<AlineaRow, 'id' | 'created_at' | 'updated_at' | 'title' | 'content' | 'media_url' | 'emotion' | 'category' | 'approximate_date' | 'location' | 'status' | 'life_event_id' | 'sort_order'> & {
          title?: string | null
          content?: string | null
          media_url?: string | null
          emotion?: EmotionTag | null
          category?: ThematicCategory | null
          approximate_date?: string | null
          event_year?: number | null
          event_month?: number | null
          event_day?: number | null
          location?: string | null
          status?: 'seed' | 'draft' | 'validated'
          life_event_id?: string | null
          sort_order?: number
        }
        Update: Partial<Omit<AlineaRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      user_memory: {
        Row: UserMemoryRow
        Insert: {
          user_id: string
          id?: string
          birth_year?: number | null
          portrait?: string | null
          default_narrative_style?: string
          key_places?: Array<{ name: string; role: string }>
          dominant_emotions?: Array<{ value: string; context: string }>
          last_consolidation_at?: string | null
        }
        Update: Partial<Omit<UserMemoryRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      themes: {
        Row: ThemeRow
        Insert: { user_id: string; name: string; color?: string; maturity?: string; id?: string; ai_summary?: string | null; alinea_count?: number }
        Update: Partial<Omit<ThemeRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      life_events: {
        Row: LifeEventRow
        Insert: {
          user_id: string
          year: number
          title: string
          id?: string
          status?: string
          is_pivot?: boolean
          emotional_intensity?: number
          event_month?: number | null
          event_day?: number | null
          life_phase_id?: string | null
          documented?: boolean
        }
        Update: Partial<Omit<LifeEventRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      life_phases: {
        Row: LifePhaseRow
        Insert: {
          user_id: string
          name: string
          id?: string
          description?: string | null
          year_start?: number | null
          year_end?: number | null
          sort_order?: number
        }
        Update: Partial<Omit<LifePhaseRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      life_event_themes: {
        Row: LifeEventThemeRow
        Insert: { life_event_id: string; theme_id: string; validated?: boolean }
        Update: Partial<Omit<LifeEventThemeRow, 'attached_at'>>
        Relationships: []
      }
      alinea_themes: {
        Row: AlineaThemeRow
        Insert: { alinea_id: string; theme_id: string; relevance_score?: number; validated_by_user?: boolean }
        Update: Partial<AlineaThemeRow>
        Relationships: []
      }
      people: {
        Row: PersonRow
        Insert: {
          user_id: string
          name: string
          id?: string
          nickname?: string | null
          relation?: string | null
          relation_type?: string | null
          birth_year?: number | null
          birth_month?: number | null
          birth_day?: number | null
          is_deceased?: boolean
          death_year?: number | null
          death_month?: number | null
          death_day?: number | null
          birth_place?: string | null
          death_place?: string | null
          first_mention?: string
          ai_summary?: string | null
          alinea_count?: number
          pending_qualification?: boolean
        }
        Update: Partial<Omit<PersonRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      places: {
        Row: PlaceRow
        Insert: {
          user_id: string
          name: string
          id?: string
          region?: string | null
          country?: string | null
          ai_summary?: string | null
        }
        Update: Partial<Omit<PlaceRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      alinea_places: {
        Row: AlineaPlaceRow
        Insert: AlineaPlaceRow
        Update: Record<string, unknown>
        Relationships: []
      }
      life_event_places: {
        Row: LifeEventPlaceRow
        Insert: LifeEventPlaceRow
        Update: Record<string, unknown>
        Relationships: []
      }
      review_queue: {
        Row: ReviewQueueRow
        Insert: {
          user_id: string
          entity_type: string
          description: string
          id?: string
          payload?: Record<string, unknown>
          status?: 'pending' | 'resolved'
        }
        Update: Partial<Omit<ReviewQueueRow, 'id' | 'user_id' | 'created_at'>>
        Relationships: []
      }
      people_relations: {
        Row: PersonRelationRow
        Insert: {
          user_id: string
          person_a_id: string
          person_b_id: string
          relation_type: string
          id?: string
          is_symmetric?: boolean
          qualifier?: string | null
          family_unit_id?: string | null
          confirmed?: boolean
          declared_in?: string
        }
        Update: Partial<Omit<PersonRelationRow, 'id' | 'user_id' | 'created_at'>>
        Relationships: []
      }
      family_units: {
        Row: FamilyUnitRow
        Insert: {
          user_id: string
          id?: string
          parent_1_id?: string | null
          parent_2_id?: string | null
          union_type?: 'married' | 'civil_union' | 'cohabiting' | 'unknown'
          union_year?: number | null
          separation_year?: number | null
        }
        Update: Partial<Omit<FamilyUnitRow, 'id' | 'user_id' | 'created_at'>>
        Relationships: []
      }
      family_unit_children: {
        Row: FamilyUnitChildRow
        Insert: FamilyUnitChildRow
        Update: Partial<FamilyUnitChildRow>
        Relationships: []
      }
      life_event_people: {
        Row: LifeEventPeopleRow
        Insert: LifeEventPeopleRow
        Update: Record<string, unknown>
        Relationships: []
      }
      alinea_people: {
        Row: AlineaPeopleRow
        Insert: { alinea_id: string; person_id: string; role?: 'present' | 'mentioned' | 'addressee' }
        Update: Record<string, unknown>
        Relationships: []
      }
      circles: {
        Row: CircleRow
        Insert: Omit<CircleRow, 'id' | 'created_at'>
        Update: Partial<Omit<CircleRow, 'id' | 'owner_id' | 'created_at'>>
        Relationships: []
      }
      circle_members: {
        Row: CircleMemberRow
        Insert: Omit<CircleMemberRow, 'added_at'>
        Update: Record<string, unknown>
        Relationships: []
      }
      alinea_circles: {
        Row: AlineaCircleRow
        Insert: AlineaCircleRow
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: {
      v_ai_profile: {
        Row: AiProfileView
        Relationships: []
      }
    }
    Functions: Record<string, never>
  }
}

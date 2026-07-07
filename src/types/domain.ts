export type ThemeMaturity = 'emerging' | 'active' | 'major' | 'closed'
export type EventStatus   = 'undocumented' | 'draft' | 'validated'
export type RelationType  = 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre'
export type FirstMention  = 'onboarding' | 'frise' | 'alinea' | 'manual'

export type PeopleRelationType =
  | 'parent_of'
  | 'child_of'
  | 'sibling_of'
  | 'partner_of'
  | 'friend_of'
  | 'colleague_of'
  | 'mentor_of'

export const RELATION_TYPE_LABEL: Record<PeopleRelationType, string> = {
  parent_of:   'parent de',
  child_of:    'enfant de',
  sibling_of:  'frère/sœur de',
  partner_of:  'conjoint(e) de',
  friend_of:   'ami(e) de',
  colleague_of: 'collègue de',
  mentor_of:   'mentor de',
}

export type Theme = {
  id: string
  user_id: string
  name: string
  color: string
  maturity: ThemeMaturity
  ai_summary: string | null
  created_at: string
  updated_at: string
}

export type LifeEvent = {
  id: string
  user_id: string
  year: number
  event_month: number | null   // migration 013
  event_day: number | null     // migration 013
  life_phase_id: string | null // migration 013 — rattachement à une phase de vie
  title: string
  status: EventStatus
  documented: boolean          // migration 013 — au moins un alinéa rattaché
  theme_ids: string[]          // peuplé depuis life_event_themes (join côté serveur)
  is_pivot: boolean
  emotional_intensity: number  // 0–3
  created_at: string
  updated_at: string
}

// Phase de vie — période exclusive et séquentielle (axe Y de la grille)
export type LifePhase = {
  id: string
  user_id: string
  name: string
  description: string | null
  year_start: number | null    // null = phase nommée mais pas encore datée
  year_end: number | null      // null = phase en cours
  sort_order: number
  created_at?: string
  updated_at?: string
}

// Alinéa — fragment narratif, rattaché à 0..1 life_event
export type Alinea = {
  id: string
  user_id: string
  title: string | null
  content: string | null
  status: 'draft' | 'validated'
  event_year: number | null
  life_event_id: string | null // migration 013
  sort_order: number           // migration 013 — ordre dans le life_event
  created_at: string
}

export type Person = {
  id: string
  user_id: string
  name: string
  nickname: string | null
  relation: string | null
  relation_type: RelationType | null
  birth_year: number | null
  is_deceased: boolean
  death_year: number | null
  first_mention: FirstMention
  ai_summary: string | null
  alinea_count: number
  pending_qualification: boolean
  created_at: string
  updated_at: string
}

export type PersonRelation = {
  id: string
  user_id: string
  person_a_id: string
  person_b_id: string
  relation_type: PeopleRelationType
  is_symmetric: boolean
  qualifier: string | null
  family_unit_id: string | null
  confirmed: boolean
  declared_in: 'dialogue' | 'manual' | 'onboarding'
  created_at: string
}

export type FamilyUnit = {
  id: string
  user_id: string
  parent_1_id: string | null
  parent_2_id: string | null
  union_type: 'married' | 'civil_union' | 'cohabiting' | 'unknown'
  union_year: number | null
  separation_year: number | null
  created_at: string
}

export type FamilyUnitChild = {
  unit_id: string
  child_id: string
  link_type: 'biological' | 'adoptive'
}

export type UserMemory = {
  id: string
  user_id: string
  birth_year: number | null
  portrait: string | null
  default_narrative_style: string
  created_at: string
  updated_at: string
}

// Couleurs disponibles pour les thématiques (cycle)
export const THEME_COLOR_PALETTE = [
  '#E8845C', // orange
  '#5B8FE8', // bleu
  '#6BB88E', // vert
  '#B87EBF', // violet
  '#E8C25C', // or
  '#5BB8B8', // teal
  '#E87E7E', // rose
  '#7EB87E', // vert clair
]

export function nextThemeColor(existingColors: string[]): string {
  return THEME_COLOR_PALETTE.find(c => !existingColors.includes(c))
    ?? THEME_COLOR_PALETTE[existingColors.length % THEME_COLOR_PALETTE.length]
}

// Couleurs de phases — mates, non saturées (axe Y de la grille de vie)
export const PHASE_COLORS = [
  '#B8CCE0', // bleu ardoise
  '#A8C4A8', // vert sauge
  '#D4A882', // terracotta sable
  '#C4A8C0', // mauve poudré
  '#C0B8D8', // lavande
  '#D8C4A8', // sable doré
  '#A8C8C4', // céladon
  '#D8B0B0', // rose argile
]

export function phaseColor(index: number): string {
  return PHASE_COLORS[((index % PHASE_COLORS.length) + PHASE_COLORS.length) % PHASE_COLORS.length]
}

// Hex + alpha (0..1) → rgba() — pour les lavis de fond de phase
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

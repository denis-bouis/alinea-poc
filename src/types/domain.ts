export type ThemeMaturity = 'emerging' | 'active' | 'major' | 'closed'
export type EventStatus   = 'undocumented' | 'draft' | 'validated'
export type RelationType  = 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre'
export type FirstMention  = 'onboarding' | 'frise' | 'alinea' | 'manual'

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
  title: string
  status: EventStatus
  theme_ids: string[]          // peuplé depuis life_event_themes (join côté serveur)
  is_pivot: boolean
  emotional_intensity: number  // 0–3
  created_at: string
  updated_at: string
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
  relation_label: string | null
  confirmed: boolean
  declared_in: 'dialogue' | 'manual'
  created_at: string
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

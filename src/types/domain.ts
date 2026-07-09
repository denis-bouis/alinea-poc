export type ThemeMaturity = 'emerging' | 'active' | 'major' | 'closed'
export type EventStatus   = 'undocumented' | 'draft' | 'validated'
export type RelationType  = 'famille' | 'amitié' | 'professionnel' | 'romantique' | 'autre'
export type FirstMention  = 'onboarding' | 'frise' | 'alinea' | 'manual' | 'dialogue'

// migration 021 — types étendus au-delà du cercle proche pour couvrir ce que
// l'ancien regex FamilyTree détectait (grands-parents, oncles/tantes, cousins,
// beaux-parents, parrains/marraines), en liens DIRECTS déclarés tels quels —
// pas de calcul transitif requis (ex. "ma grand-mère Renée" sans passer par sa mère).
export type PeopleRelationType =
  | 'parent_of'
  | 'child_of'
  | 'sibling_of'
  | 'partner_of'
  | 'grandparent_of'
  | 'grandchild_of'
  | 'great_grandparent_of'
  | 'great_grandchild_of'
  | 'aunt_uncle_of'
  | 'niece_nephew_of'
  | 'cousin_of'
  | 'parent_in_law_of'
  | 'child_in_law_of'
  | 'godparent_of'
  | 'godchild_of'
  | 'friend_of'
  | 'colleague_of'
  | 'mentor_of'

export const RELATION_TYPE_LABEL: Record<PeopleRelationType, string> = {
  parent_of:   'parent de',
  child_of:    'enfant de',
  sibling_of:  'frère/sœur de',
  partner_of:  'conjoint(e) de',
  grandparent_of:        'grand-parent de',
  grandchild_of:         'petit(e)-enfant de',
  great_grandparent_of:  'arrière-grand-parent de',
  great_grandchild_of:   'arrière-petit(e)-enfant de',
  aunt_uncle_of:         'oncle/tante de',
  niece_nephew_of:       'neveu/nièce de',
  cousin_of:             'cousin(e) de',
  parent_in_law_of:      'beau-parent de',
  child_in_law_of:       'beau-fils/belle-fille de',
  godparent_of:          'parrain/marraine de',
  godchild_of:           'filleul(e) de',
  friend_of: 'ami(e) de',
  colleague_of: 'collègue de',
  mentor_of:   'mentor de',
}

// Types "famille" pertinents pour l'arbre généalogique (exclut le social pur).
export const FAMILY_RELATION_TYPES: readonly PeopleRelationType[] = [
  'parent_of', 'child_of', 'sibling_of', 'partner_of',
  'grandparent_of', 'grandchild_of', 'great_grandparent_of', 'great_grandchild_of',
  'aunt_uncle_of', 'niece_nephew_of', 'cousin_of',
  'parent_in_law_of', 'child_in_law_of', 'godparent_of', 'godchild_of',
]

// Décalage de génération de PERSON_B vu depuis PERSON_A, quand relation_type
// décrit "A est relation_type de B" (convention people_relations). Utilisé
// par FamilyTree pour positionner l'arbre depuis le nœud "moi" (is_self),
// sans dépendre du texte libre de people.relation.
export const FAMILY_GENERATION_DELTA: Partial<Record<PeopleRelationType, number>> = {
  child_of: -1, parent_of: 1,
  grandchild_of: -2, grandparent_of: 2,
  great_grandchild_of: -3, great_grandparent_of: 3,
  sibling_of: 0, partner_of: 0, cousin_of: 0,
  aunt_uncle_of: 1, niece_nephew_of: -1,
  parent_in_law_of: 1, child_in_law_of: -1,
  godparent_of: 1, godchild_of: -1,
}

// Rôle de PERSON_B affiché sous son nœud dans l'arbre, déduit de "moi suis
// relation_type de B" — évite de retomber sur du texte libre (people.relation)
// qui suivrait, lui, la langue de conversation courante.
export const FAMILY_NODE_LABEL: Partial<Record<PeopleRelationType, string>> = {
  child_of: 'parent', parent_of: 'enfant',
  grandchild_of: 'grand-parent', grandparent_of: 'petit-enfant',
  great_grandchild_of: 'arrière-grand-parent', great_grandparent_of: 'arrière-petit-enfant',
  sibling_of: 'frère/sœur', partner_of: 'conjoint(e)', cousin_of: 'cousin(e)',
  aunt_uncle_of: 'neveu/nièce', niece_nephew_of: 'oncle/tante',
  parent_in_law_of: 'beau-fils/belle-fille', child_in_law_of: 'beau-parent',
  godparent_of: 'filleul(e)', godchild_of: 'parrain/marraine',
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
  year: number | null           // migration 019 — nullable, "à dater"
  event_month: number | null   // migration 013
  event_day: number | null     // migration 013
  year_end: number | null        // migration 019 — événement sur une période
  event_month_end: number | null // migration 019
  event_day_end: number | null   // migration 019
  life_phase_id: string | null // migration 013 — rattachement à une phase de vie
  title: string
  status: EventStatus
  documented: boolean          // migration 013 — au moins un alinéa rattaché
  theme_ids: string[]          // peuplé depuis life_event_themes (join côté serveur)
  is_pivot: boolean
  emotional_intensity: number  // 0–3
  ai_summary: string | null    // migration 018 — synthèse fusionnée, indépendante du détail de chaque alinéa
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
  status: 'seed' | 'draft' | 'validated'
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
  is_self: boolean  // migration 021 — nœud "moi", exclu des listes/recherches UI
  birth_year: number | null
  birth_month: number | null    // migration 016
  birth_day: number | null      // migration 016
  is_deceased: boolean
  death_year: number | null
  death_month: number | null    // migration 016
  death_day: number | null      // migration 016
  birth_place: string | null    // migration 016
  death_place: string | null    // migration 016
  email: string | null          // migration 017
  phone: string | null          // migration 017
  first_mention: FirstMention
  ai_summary: string | null
  alinea_count: number
  pending_qualification: boolean
  created_at: string
  updated_at: string
}

// Lieu de premier rang (migration 016) — remplace le JSONB user_memory.key_places
// pour tout nouveau lieu capté par le moteur agentique.
export type Place = {
  id: string
  user_id: string
  name: string
  region: string | null
  country: string | null
  ai_summary: string | null
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

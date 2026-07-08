import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { nextThemeColor } from '@/types/domain'
import { parseFrenchDate } from '@/lib/parse-date'
import type { PeopleRelationType } from '@/types/domain'
import type { Database } from '@/types/database'

export type Supa = Awaited<ReturnType<typeof createClient>>

// Ne retient que les clés dont l'appelant a fourni une valeur non-null —
// c'est la fusion "faits" décrite dans la conception : jamais d'écrasement
// silencieux d'un champ déjà renseigné par une valeur absente/nulle.
// Le typage de retour (sans index signature) est nécessaire pour satisfaire
// le client Supabase typé, qui rejette les objets à clés génériques.
function pickDefined<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  keys: readonly (keyof T & string)[],
): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) {
    const v = input[k]
    if (v !== undefined && v !== null) out[k as keyof T] = v as T[keyof T]
  }
  return out
}

// ============================================================
// Dérivation de relations symétriques/inverses — logique partagée entre
// les routes existantes (people/relations, people/family-units) et les
// tools link_people_relation / declare_family_unit ci-dessous.
// ============================================================

export const SYMMETRIC_RELATION_TYPES = new Set<PeopleRelationType>([
  'sibling_of',
  'partner_of',
  'friend_of',
  'colleague_of',
])

export const INVERSE_RELATION_TYPE: Partial<Record<PeopleRelationType, PeopleRelationType>> = {
  parent_of: 'child_of',
  child_of: 'parent_of',
}

export type RelationInsert = {
  user_id: string
  person_a_id: string
  person_b_id: string
  relation_type: string
  is_symmetric: boolean
  qualifier: string | null
  family_unit_id: string | null
  confirmed: boolean
  declared_in: string
}

// Un lien déclaré (A → B) génère la ligne miroir symétrique ou inverse adéquate.
export function deriveRelationPair(
  base: Pick<RelationInsert, 'user_id' | 'qualifier' | 'family_unit_id' | 'confirmed' | 'declared_in'>,
  personAId: string,
  personBId: string,
  relationType: PeopleRelationType,
): RelationInsert[] {
  const isSymmetric = SYMMETRIC_RELATION_TYPES.has(relationType)
  const rows: RelationInsert[] = [
    { ...base, person_a_id: personAId, person_b_id: personBId, relation_type: relationType, is_symmetric: isSymmetric },
  ]
  if (isSymmetric) {
    rows.push({ ...base, person_a_id: personBId, person_b_id: personAId, relation_type: relationType, is_symmetric: true })
  } else {
    const inverse = INVERSE_RELATION_TYPE[relationType]
    if (inverse) {
      rows.push({ ...base, person_a_id: personBId, person_b_id: personAId, relation_type: inverse, is_symmetric: false })
    }
  }
  return rows
}

// Dérivation complète d'une cellule familiale (parents ↔ enfants, fratrie, conjoints).
export function deriveFamilyUnitRelations(
  base: Pick<RelationInsert, 'user_id' | 'confirmed' | 'declared_in'>,
  unitId: string,
  parentIds: string[],
  childIds: string[],
): RelationInsert[] {
  const rows: RelationInsert[] = []
  const wrap = { ...base, qualifier: null, family_unit_id: unitId }

  for (const parentId of parentIds) {
    for (const childId of childIds) {
      rows.push(
        { ...wrap, person_a_id: parentId, person_b_id: childId, relation_type: 'parent_of', is_symmetric: false },
        { ...wrap, person_a_id: childId, person_b_id: parentId, relation_type: 'child_of', is_symmetric: false },
      )
    }
  }
  for (let i = 0; i < childIds.length; i++) {
    for (let j = i + 1; j < childIds.length; j++) {
      rows.push(
        { ...wrap, person_a_id: childIds[i], person_b_id: childIds[j], relation_type: 'sibling_of', is_symmetric: true },
        { ...wrap, person_a_id: childIds[j], person_b_id: childIds[i], relation_type: 'sibling_of', is_symmetric: true },
      )
    }
  }
  if (parentIds.length === 2) {
    const [p1, p2] = parentIds
    rows.push(
      { ...wrap, person_a_id: p1, person_b_id: p2, relation_type: 'partner_of', is_symmetric: true },
      { ...wrap, person_a_id: p2, person_b_id: p1, relation_type: 'partner_of', is_symmetric: true },
    )
  }
  return rows
}

// ============================================================
// Schémas des tools — exposés tels quels à l'API Messages
// ============================================================

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_memory',
    description:
      "Récupère le contenu complet d'un souvenir (alinéa rédigé) ou d'un événement de vie à partir de son identifiant. " +
      "Utilise cet outil dès que l'utilisateur fait référence à un souvenir ou événement présent dans l'index — avant de formuler ta réponse.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['alinea', 'life_event'], description: "'alinea' pour un souvenir rédigé, 'life_event' pour un événement de la frise" },
        id: { type: 'string', description: 'UUID tel qu\'il apparaît dans l\'index' },
      },
      required: ['type', 'id'],
    },
  },
  {
    name: 'search_people',
    description: "Cherche une personne déjà connue par son nom (recherche partielle, insensible à la casse). TOUJOURS appeler avant upsert_person ou link_people_relation pour éviter de créer un doublon.",
    input_schema: { type: 'object' as const, properties: { query: { type: 'string', description: 'nom ou fragment de nom' } }, required: ['query'] },
  },
  {
    name: 'get_person',
    description: "Lit la fiche complète d'une personne (faits + ai_summary) avant de décider d'une mise à jour.",
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'upsert_person',
    description:
      "Crée ou met à jour une personne. Cherche d'abord par nom en interne : si une personne du même nom existe, FUSIONNE les nouveaux faits avec l'existant (ne l'écrase pas) ; sinon crée une nouvelle fiche. " +
      "Écrit à la fois les faits structurés (dates, lieux, relation) et le récit (ai_summary — synthèse narrative complète et à jour du lien, 1 à 3 phrases). " +
      "N'EXÉCUTE PAS l'écriture immédiatement : ceci enregistre une PROPOSITION que l'utilisateur doit confirmer.",
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', description: 'si connu via get_person — évite une nouvelle recherche par nom' },
        name: { type: 'string' },
        relation: { type: 'string', description: 'texte libre, ex. "sœur de Laurence"' },
        relation_type: { type: 'string', enum: ['famille', 'amitié', 'professionnel', 'romantique', 'autre'] },
        birth_year: { type: 'number' },
        birth_month: { type: 'number' },
        birth_day: { type: 'number' },
        birth_place: { type: 'string' },
        is_deceased: { type: 'boolean' },
        death_year: { type: 'number' },
        death_month: { type: 'number' },
        death_day: { type: 'number' },
        death_place: { type: 'string' },
        ai_summary: { type: 'string', description: 'synthèse narrative complète et à jour (intègre l\'existant, ne le juxtapose pas)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'link_people_relation',
    description: "Déclare un lien direct entre deux personnes déjà connues (par leur nom). Dérive automatiquement la relation miroir (symétrique ou inverse).",
    input_schema: {
      type: 'object' as const,
      properties: {
        person_a_name: { type: 'string' },
        person_b_name: { type: 'string' },
        relation_type: { type: 'string', enum: ['parent_of', 'child_of', 'sibling_of', 'partner_of', 'friend_of', 'colleague_of', 'mentor_of'] },
        qualifier: { type: 'string', description: 'précision libre, ex. "demi-sœur"' },
      },
      required: ['person_a_name', 'person_b_name', 'relation_type'],
    },
  },
  {
    name: 'declare_family_unit',
    description: "Déclare une cellule familiale complète (parents + enfants) — dérive automatiquement parent_of/child_of, fratrie, conjoints.",
    input_schema: {
      type: 'object' as const,
      properties: {
        parent_names: { type: 'array', items: { type: 'string' }, description: '0 à 2 noms' },
        children_names: { type: 'array', items: { type: 'string' } },
        union_type: { type: 'string', enum: ['married', 'civil_union', 'cohabiting', 'unknown'] },
        union_year: { type: 'number' },
      },
      required: ['parent_names', 'children_names'],
    },
  },
  {
    name: 'search_themes',
    description: "Liste les thématiques déjà connues (toutes, ou filtrées par nom). Appeler avant propose_theme pour éviter un doublon.",
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: [] },
  },
  {
    name: 'get_theme',
    description: "Lit la fiche complète d'une thématique.",
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'propose_theme',
    description: "Propose une NOUVELLE thématique (absente de search_themes). Ne crée jamais une thématique dans le dos de l'utilisateur — proposition soumise à confirmation comme tout le reste.",
    input_schema: { type: 'object' as const, properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'update_theme',
    description: "Met à jour une thématique déjà validée (ai_summary, maturité). Appeler get_theme avant pour lire l'existant.",
    input_schema: {
      type: 'object' as const,
      properties: {
        theme_id: { type: 'string' },
        name: { type: 'string', description: 'si theme_id inconnu, recherche par nom' },
        ai_summary: { type: 'string' },
        maturity: { type: 'string', enum: ['emerging', 'active', 'major', 'closed'] },
      },
      required: [],
    },
  },
  {
    name: 'search_places',
    description: "Cherche un lieu déjà connu par son nom. Appeler avant upsert_place.",
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_place',
    description: "Lit la fiche complète d'un lieu.",
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'upsert_place',
    description: "Crée ou met à jour un lieu fondateur (fusion si déjà connu par son nom, sinon création).",
    input_schema: {
      type: 'object' as const,
      properties: {
        place_id: { type: 'string' },
        name: { type: 'string' },
        region: { type: 'string' },
        country: { type: 'string' },
        ai_summary: { type: 'string', description: 'ce que ce lieu évoque, synthèse complète et à jour' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_life_phases',
    description: "Liste les phases de vie déjà nommées. Appeler avant upsert_life_phase.",
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: [] },
  },
  {
    name: 'get_life_phase',
    description: "Lit la fiche complète d'une phase de vie.",
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'upsert_life_phase',
    description: "Crée ou met à jour une phase de vie (fusion si déjà nommée, sinon création). year_start peut être omis si la période n'est pas encore datée.",
    input_schema: {
      type: 'object' as const,
      properties: {
        life_phase_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        year_start: { type: 'number' },
        year_end: { type: 'number', description: 'omettre si la phase est en cours' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_life_events',
    description: "Cherche un événement de frise déjà connu par son titre. Appeler avant upsert_life_event.",
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_life_event',
    description: "Lit la fiche complète d'un événement de frise.",
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'upsert_life_event',
    description: "Crée ou met à jour un événement de la frise (fusion si déjà connu par son titre, sinon création).",
    input_schema: {
      type: 'object' as const,
      properties: {
        life_event_id: { type: 'string' },
        title: { type: 'string' },
        year: { type: 'number' },
        month: { type: 'number' },
        day: { type: 'number' },
        life_phase_name: { type: 'string', description: 'nom d\'une phase déjà connue à rattacher' },
        is_pivot: { type: 'boolean' },
        emotional_intensity: { type: 'number', description: '0 à 3' },
      },
      required: ['title'],
    },
  },
  {
    name: 'seed_alinea',
    description:
      "Amorce un futur alinéa à partir d'une trame narrative qui vient d'émerger dans le dialogue (pas encore rédigée). " +
      "Crée un alinéa à l'état 'seed' — la trame brute, telle que dite par l'utilisateur, préservée pour rédaction ultérieure sur demande.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'titre court et évocateur' },
        raw_content: { type: 'string', description: "les mots bruts de l'utilisateur, préservés tels quels" },
        life_event_title: { type: 'string', description: "titre d'un événement de frise déjà connu à rattacher" },
        theme_names: { type: 'array', items: { type: 'string' }, description: 'thématiques déjà connues concernées' },
        person_names: { type: 'array', items: { type: 'string' }, description: 'personnes déjà connues concernées' },
        approximate_date: { type: 'string', description: 'date approximative en texte libre si mentionnée' },
      },
      required: ['title', 'raw_content'],
    },
  },
  {
    name: 'flag_ambiguous',
    description:
      "Dépose une ambiguïté dans la file de révision au lieu de deviner entre deux fiches proches ou une information incertaine — ex. deux personnes au nom proche, une date contradictoire. " +
      "S'exécute immédiatement (ce n'est pas une écriture soumise à confirmation) et n'interrompt pas le dialogue.",
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_type: { type: 'string', description: "ex. 'person', 'theme', 'life_event'" },
        description: { type: 'string', description: "l'ambiguïté en clair, pour révision future" },
        payload: { type: 'object', description: 'données brutes utiles à la résolution ultérieure' },
      },
      required: ['entity_type', 'description'],
    },
  },
  {
    name: 'update_profile',
    description: "Met à jour le prénom et/ou l'année de naissance de l'utilisateur (onboarding Mode 1).",
    input_schema: {
      type: 'object' as const,
      properties: {
        display_name: { type: 'string' },
        birth_year: { type: 'number' },
      },
      required: [],
    },
  },
]

export const READ_TOOL_NAMES = new Set([
  'fetch_memory', 'search_people', 'get_person', 'search_themes', 'get_theme',
  'search_places', 'get_place', 'search_life_phases', 'get_life_phase',
  'search_life_events', 'get_life_event',
])

// flag_ambiguous s'exécute immédiatement (ce n'est pas une écriture différée) —
// tout le reste (upsert_*, propose_theme, update_theme, link_people_relation,
// declare_family_unit, seed_alinea, update_profile) est une proposition différée.
export const IMMEDIATE_WRITE_TOOL_NAMES = new Set(['flag_ambiguous'])

export function isDeferredWriteTool(name: string): boolean {
  return !READ_TOOL_NAMES.has(name) && !IMMEDIATE_WRITE_TOOL_NAMES.has(name)
}

// ============================================================
// Exécution des tools de lecture — immédiate, dans la boucle de chat
// ============================================================

export async function executeReadTool(
  name: string,
  input: Record<string, unknown>,
  supabase: Supa,
  userId: string,
): Promise<string> {
  switch (name) {
    case 'fetch_memory': {
      const { type, id } = input as { type: string; id: string }
      if (type === 'alinea') {
        const { data } = await supabase.from('alineas')
          .select('title, content, approximate_date, emotion, category')
          .eq('id', id).eq('user_id', userId).single()
        if (!data) return 'Souvenir introuvable.'
        const header = [data.title ?? 'Sans titre', data.approximate_date].filter(Boolean).join(' · ')
        return `**${header}**\n\n${data.content ?? '(contenu vide)'}`
      }
      if (type === 'life_event') {
        const { data } = await supabase.from('life_events')
          .select('year, title, is_pivot, emotional_intensity')
          .eq('id', id).eq('user_id', userId).single()
        if (!data) return 'Événement introuvable.'
        return `**${data.year} — ${data.title}**${data.is_pivot ? ' [moment tournant]' : ''}\nIntensité émotionnelle : ${data.emotional_intensity}/3`
      }
      return 'Type inconnu.'
    }

    case 'search_people': {
      const { query } = input as { query: string }
      const { data } = await supabase.from('people')
        .select('id, name, relation, relation_type, birth_year, is_deceased')
        .eq('user_id', userId).ilike('name', `%${query}%`).limit(5)
      if (!data || data.length === 0) return 'Aucune personne trouvée.'
      return data.map(p => `[${p.id}] ${p.name}${p.relation ? ` (${p.relation})` : ''}${p.is_deceased ? ' [décédé·e]' : ''}`).join('\n')
    }

    case 'get_person': {
      const { id } = input as { id: string }
      const { data } = await supabase.from('people').select('*').eq('id', id).eq('user_id', userId).single()
      if (!data) return 'Personne introuvable.'
      return JSON.stringify(data)
    }

    case 'search_themes': {
      const { query } = input as { query?: string }
      let q = supabase.from('themes').select('id, name, maturity, color').eq('user_id', userId)
      if (query) q = q.ilike('name', `%${query}%`)
      const { data } = await q.limit(20)
      if (!data || data.length === 0) return 'Aucune thématique trouvée.'
      return data.map(t => `[${t.id}] ${t.name} [${t.maturity}]`).join('\n')
    }

    case 'get_theme': {
      const { id } = input as { id: string }
      const { data } = await supabase.from('themes').select('*').eq('id', id).eq('user_id', userId).single()
      if (!data) return 'Thématique introuvable.'
      return JSON.stringify(data)
    }

    case 'search_places': {
      const { query } = input as { query: string }
      const { data } = await supabase.from('places').select('id, name, region, country').eq('user_id', userId).ilike('name', `%${query}%`).limit(5)
      if (!data || data.length === 0) return 'Aucun lieu trouvé.'
      return data.map(p => `[${p.id}] ${p.name}${p.country ? ` (${p.country})` : ''}`).join('\n')
    }

    case 'get_place': {
      const { id } = input as { id: string }
      const { data } = await supabase.from('places').select('*').eq('id', id).eq('user_id', userId).single()
      if (!data) return 'Lieu introuvable.'
      return JSON.stringify(data)
    }

    case 'search_life_phases': {
      const { query } = input as { query?: string }
      let q = supabase.from('life_phases').select('id, name, year_start, year_end').eq('user_id', userId)
      if (query) q = q.ilike('name', `%${query}%`)
      const { data } = await q.order('sort_order', { ascending: true })
      if (!data || data.length === 0) return 'Aucune phase de vie trouvée.'
      return data.map(p => `[${p.id}] ${p.name}${p.year_start ? ` (${p.year_start}–${p.year_end ?? '...'})` : ''}`).join('\n')
    }

    case 'get_life_phase': {
      const { id } = input as { id: string }
      const { data } = await supabase.from('life_phases').select('*').eq('id', id).eq('user_id', userId).single()
      if (!data) return 'Phase de vie introuvable.'
      return JSON.stringify(data)
    }

    case 'search_life_events': {
      const { query } = input as { query: string }
      const { data } = await supabase.from('life_events').select('id, year, title, status').eq('user_id', userId).ilike('title', `%${query}%`).limit(10)
      if (!data || data.length === 0) return 'Aucun événement trouvé.'
      return data.map(e => `[${e.id}] ${e.year} — ${e.title} [${e.status}]`).join('\n')
    }

    case 'get_life_event': {
      const { id } = input as { id: string }
      const { data } = await supabase.from('life_events').select('*').eq('id', id).eq('user_id', userId).single()
      if (!data) return 'Événement introuvable.'
      return JSON.stringify(data)
    }

    default:
      return 'Outil non disponible.'
  }
}

// ============================================================
// Exécution du tool immédiat flag_ambiguous
// ============================================================

export async function executeFlagAmbiguous(
  input: Record<string, unknown>,
  supabase: Supa,
  userId: string,
): Promise<string> {
  const { entity_type, description, payload } = input as { entity_type: string; description: string; payload?: Record<string, unknown> }
  const { error } = await supabase.from('review_queue').insert({
    user_id: userId,
    entity_type,
    description,
    payload: payload ?? {},
  })
  return error ? `Échec du dépôt en file de révision : ${error.message}` : 'Déposé en file de révision.'
}

// ============================================================
// Application des écritures différées — appelée uniquement après
// confirmation utilisateur (route /api/memory/confirm)
// ============================================================

export type PendingWrite = { tool: string; input: Record<string, unknown> }
export type PendingWriteResult = { tool: string; label: string; saved: boolean; error?: string }

// Ordre d'application au sein d'un même lot confirmé : les entités de base
// (personnes, lieux, phases, thématiques, événements) avant ce qui les
// référence par nom (relations, cellules familiales, alinéas amorcés).
const WRITE_ORDER: Record<string, number> = {
  update_profile: 0,
  upsert_person: 1,
  upsert_place: 1,
  upsert_life_phase: 1,
  propose_theme: 1,
  update_theme: 1,
  upsert_life_event: 2,
  link_people_relation: 3,
  declare_family_unit: 3,
  seed_alinea: 4,
}

export function sortPendingWrites(writes: PendingWrite[]): PendingWrite[] {
  return [...writes].sort((a, b) => (WRITE_ORDER[a.tool] ?? 9) - (WRITE_ORDER[b.tool] ?? 9))
}

export function labelForWrite(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'update_profile':        return String(input.display_name ?? 'Profil')
    case 'upsert_person':         return String(input.name ?? 'Personne')
    case 'upsert_place':          return String(input.name ?? 'Lieu')
    case 'upsert_life_phase':     return String(input.name ?? 'Phase de vie')
    case 'upsert_life_event':     return String(input.title ?? 'Événement')
    case 'propose_theme':         return String(input.name ?? 'Thématique')
    case 'update_theme':          return String(input.name ?? 'Thématique')
    case 'link_people_relation':  return `${input.person_a_name} ↔ ${input.person_b_name}`
    case 'declare_family_unit':   return 'Cellule familiale'
    case 'seed_alinea':           return String(input.title ?? 'Alinéa')
    default:                      return tool
  }
}

export function iconForWrite(tool: string): string {
  switch (tool) {
    case 'update_profile':        return '🪪'
    case 'upsert_person':         return '👤'
    case 'upsert_place':          return '📍'
    case 'upsert_life_phase':     return '🗓'
    case 'upsert_life_event':     return '📅'
    case 'propose_theme':         return '🏷'
    case 'update_theme':          return '🏷'
    case 'link_people_relation':  return '🔗'
    case 'declare_family_unit':   return '👪'
    case 'seed_alinea':           return '✍'
    default:                      return '•'
  }
}

async function findPersonIdByName(supabase: Supa, userId: string, name: string): Promise<string | null> {
  const { data } = await supabase.from('people').select('id').eq('user_id', userId).ilike('name', name).limit(1).single()
  return data?.id ?? null
}

export async function applyWrite(write: PendingWrite, supabase: Supa, userId: string): Promise<PendingWriteResult> {
  const label = labelForWrite(write.tool, write.input)
  try {
    switch (write.tool) {

      case 'update_profile': {
        const d = write.input as { display_name?: string; birth_year?: number }
        if (d.display_name) {
          const { error } = await supabase.from('profiles').update({ display_name: d.display_name }).eq('id', userId)
          if (error) return { tool: write.tool, label, saved: false, error: error.message }
        }
        if (d.birth_year) {
          const { error } = await supabase.from('user_memory').upsert({ user_id: userId, birth_year: d.birth_year }, { onConflict: 'user_id' })
          if (error) return { tool: write.tool, label, saved: false, error: error.message }
        }
        if (d.display_name || d.birth_year) {
          await supabase.from('profiles').update({ onboarding_step: 4 }).eq('id', userId).lt('onboarding_step', 4)
        }
        return { tool: write.tool, label, saved: true }
      }

      case 'upsert_person': {
        const d = write.input as {
          person_id?: string; name: string; relation?: string; relation_type?: string
          birth_year?: number; birth_month?: number; birth_day?: number; birth_place?: string
          is_deceased?: boolean; death_year?: number; death_month?: number; death_day?: number; death_place?: string
          ai_summary?: string
        }
        const existingId = d.person_id ?? await findPersonIdByName(supabase, userId, d.name)

        const facts = pickDefined<Database['public']['Tables']['people']['Update']>(d, [
          'relation', 'relation_type', 'birth_year', 'birth_month', 'birth_day', 'birth_place',
          'is_deceased', 'death_year', 'death_month', 'death_day', 'death_place', 'ai_summary',
        ])

        if (existingId) {
          const { error } = await supabase.from('people').update(facts).eq('id', existingId).eq('user_id', userId)
          return { tool: write.tool, label, saved: !error, error: error?.message }
        }
        const { error } = await supabase.from('people').insert({
          user_id: userId,
          name: d.name,
          first_mention: 'dialogue',
          pending_qualification: false,
          ...facts,
        })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'link_people_relation': {
        const d = write.input as { person_a_name: string; person_b_name: string; relation_type: PeopleRelationType; qualifier?: string }
        const [aId, bId] = await Promise.all([
          findPersonIdByName(supabase, userId, d.person_a_name),
          findPersonIdByName(supabase, userId, d.person_b_name),
        ])
        if (!aId || !bId) return { tool: write.tool, label, saved: false, error: 'Personne introuvable — créer la fiche avant de déclarer le lien.' }
        const rows = deriveRelationPair(
          { user_id: userId, qualifier: d.qualifier ?? null, family_unit_id: null, confirmed: true, declared_in: 'dialogue' },
          aId, bId, d.relation_type,
        )
        const { error } = await supabase.from('people_relations').upsert(rows, { ignoreDuplicates: true })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'declare_family_unit': {
        const d = write.input as { parent_names: string[]; children_names: string[]; union_type?: string; union_year?: number }
        const parentIds = (await Promise.all(d.parent_names.map(n => findPersonIdByName(supabase, userId, n)))).filter((x): x is string => !!x)
        const childIds = (await Promise.all(d.children_names.map(n => findPersonIdByName(supabase, userId, n)))).filter((x): x is string => !!x)
        if (parentIds.length === 0 && childIds.length === 0) {
          return { tool: write.tool, label, saved: false, error: 'Aucune personne trouvée — créer les fiches avant de déclarer la cellule familiale.' }
        }
        const { data: unit, error: unitError } = await supabase.from('family_units').insert({
          user_id: userId,
          parent_1_id: parentIds[0] ?? null,
          parent_2_id: parentIds[1] ?? null,
          union_type: (d.union_type as 'married' | 'civil_union' | 'cohabiting' | 'unknown') ?? 'unknown',
          union_year: d.union_year ?? null,
        }).select('id').single()
        if (unitError || !unit) return { tool: write.tool, label, saved: false, error: unitError?.message ?? 'Échec de création' }

        if (childIds.length > 0) {
          const { error } = await supabase.from('family_unit_children').insert(
            childIds.map(child_id => ({ unit_id: unit.id, child_id, link_type: 'biological' as const })),
          )
          if (error) return { tool: write.tool, label, saved: false, error: error.message }
        }
        const relRows = deriveFamilyUnitRelations({ user_id: userId, confirmed: true, declared_in: 'dialogue' }, unit.id, parentIds, childIds)
        if (relRows.length > 0) {
          const { error } = await supabase.from('people_relations').upsert(relRows, { ignoreDuplicates: true })
          if (error) return { tool: write.tool, label, saved: false, error: error.message }
        }
        return { tool: write.tool, label, saved: true }
      }

      case 'propose_theme': {
        const d = write.input as { name: string }
        const { data: existing } = await supabase.from('themes').select('color').eq('user_id', userId)
        const color = nextThemeColor((existing ?? []).map(t => t.color))
        const { error } = await supabase.from('themes').insert({ user_id: userId, name: d.name, color, maturity: 'emerging' })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'update_theme': {
        const d = write.input as { theme_id?: string; name?: string; ai_summary?: string; maturity?: string }
        let themeId = d.theme_id
        if (!themeId && d.name) {
          const { data } = await supabase.from('themes').select('id').eq('user_id', userId).ilike('name', d.name).limit(1).single()
          themeId = data?.id
        }
        if (!themeId) return { tool: write.tool, label, saved: false, error: 'Thématique introuvable.' }
        const patch = pickDefined<Database['public']['Tables']['themes']['Update']>(d, ['ai_summary', 'maturity'])
        const { error } = await supabase.from('themes').update(patch).eq('id', themeId).eq('user_id', userId)
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'upsert_place': {
        const d = write.input as { place_id?: string; name: string; region?: string; country?: string; ai_summary?: string }
        let placeId = d.place_id
        if (!placeId) {
          const { data } = await supabase.from('places').select('id').eq('user_id', userId).ilike('name', d.name).limit(1).single()
          placeId = data?.id
        }
        const facts = pickDefined<Database['public']['Tables']['places']['Update']>(d, ['region', 'country', 'ai_summary'])

        if (placeId) {
          const { error } = await supabase.from('places').update(facts).eq('id', placeId).eq('user_id', userId)
          return { tool: write.tool, label, saved: !error, error: error?.message }
        }
        const { error } = await supabase.from('places').insert({ user_id: userId, name: d.name, ...facts })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'upsert_life_phase': {
        const d = write.input as { life_phase_id?: string; name: string; description?: string; year_start?: number; year_end?: number }
        let phaseId = d.life_phase_id
        if (!phaseId) {
          const { data } = await supabase.from('life_phases').select('id').eq('user_id', userId).ilike('name', d.name).limit(1).single()
          phaseId = data?.id
        }
        const facts = pickDefined<Database['public']['Tables']['life_phases']['Update']>(d, ['description', 'year_start', 'year_end'])

        if (phaseId) {
          const { error } = await supabase.from('life_phases').update(facts).eq('id', phaseId).eq('user_id', userId)
          return { tool: write.tool, label, saved: !error, error: error?.message }
        }
        const { count } = await supabase.from('life_phases').select('id', { count: 'exact', head: true }).eq('user_id', userId)
        const { error } = await supabase.from('life_phases').insert({ user_id: userId, name: d.name, sort_order: count ?? 0, ...facts })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'upsert_life_event': {
        const d = write.input as {
          life_event_id?: string; title: string; year?: number; month?: number; day?: number
          life_phase_name?: string; is_pivot?: boolean; emotional_intensity?: number
        }
        let eventId = d.life_event_id
        if (!eventId) {
          const { data } = await supabase.from('life_events').select('id').eq('user_id', userId).ilike('title', d.title).limit(1).single()
          eventId = data?.id
        }
        let lifePhaseId: string | null | undefined
        if (d.life_phase_name) {
          const { data } = await supabase.from('life_phases').select('id').eq('user_id', userId).ilike('name', d.life_phase_name).limit(1).single()
          lifePhaseId = data?.id ?? null
        }
        const facts: Database['public']['Tables']['life_events']['Update'] = {}
        if (d.year !== undefined) facts.year = d.year
        if (d.month !== undefined) facts.event_month = d.month
        if (d.day !== undefined) facts.event_day = d.day
        if (d.is_pivot !== undefined) facts.is_pivot = d.is_pivot
        if (d.emotional_intensity !== undefined) facts.emotional_intensity = d.emotional_intensity
        if (lifePhaseId !== undefined) facts.life_phase_id = lifePhaseId

        if (eventId) {
          const { error } = await supabase.from('life_events').update(facts).eq('id', eventId).eq('user_id', userId)
          return { tool: write.tool, label, saved: !error, error: error?.message }
        }
        const { error } = await supabase.from('life_events').insert({
          user_id: userId,
          title: d.title,
          year: d.year ?? new Date().getFullYear(),
          status: 'undocumented',
          is_pivot: d.is_pivot ?? false,
          emotional_intensity: d.emotional_intensity ?? 1,
          event_month: d.month ?? null,
          event_day: d.day ?? null,
          life_phase_id: lifePhaseId ?? null,
        })
        return { tool: write.tool, label, saved: !error, error: error?.message }
      }

      case 'seed_alinea': {
        const d = write.input as {
          title: string; raw_content: string; life_event_title?: string
          theme_names?: string[]; person_names?: string[]; approximate_date?: string
        }
        let lifeEventId: string | null = null
        if (d.life_event_title) {
          const { data } = await supabase.from('life_events').select('id').eq('user_id', userId).ilike('title', d.life_event_title).limit(1).single()
          lifeEventId = data?.id ?? null
        }
        const { year, month, day } = parseFrenchDate(d.approximate_date)
        const { data: alinea, error } = await supabase.from('alineas').insert({
          user_id: userId,
          title: d.title,
          content: d.raw_content,
          format: 'text',
          visibility: 'private',
          status: 'seed',
          approximate_date: d.approximate_date ?? null,
          event_year: year,
          event_month: month,
          event_day: day,
          ai_memory: null,
          life_event_id: lifeEventId,
        }).select('id').single()
        if (error || !alinea) return { tool: write.tool, label, saved: false, error: error?.message }

        if (d.theme_names?.length) {
          const { data: themes } = await supabase.from('themes').select('id, name').eq('user_id', userId).in('name', d.theme_names)
          if (themes?.length) {
            await supabase.from('alinea_themes').insert(themes.map(t => ({ alinea_id: alinea.id, theme_id: t.id, validated_by_user: true })))
          }
        }
        if (d.person_names?.length) {
          const personIds = (await Promise.all(d.person_names.map(n => findPersonIdByName(supabase, userId, n)))).filter((x): x is string => !!x)
          if (personIds.length) {
            await supabase.from('alinea_people').insert(personIds.map(person_id => ({ alinea_id: alinea.id, person_id, role: 'mentioned' as const })))
          }
        }
        return { tool: write.tool, label, saved: true }
      }

      default:
        return { tool: write.tool, label, saved: false, error: 'Outil inconnu.' }
    }
  } catch (e) {
    return { tool: write.tool, label, saved: false, error: String(e) }
  }
}

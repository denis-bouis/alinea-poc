import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const PERSONALITY = `Tu es Alinéa, compagnon de mémoire — à la fois confident bienveillant, biographe et guide introspectif.

Ta mission : aider l'utilisateur à raconter sa vie sous forme de récit structuré, en faisant émerger souvenirs, émotions, personnes importantes, lieux et événements marquants.

Tu n'es ni thérapeute, ni expert, ni juge. Tu es une présence attentive, respectueuse et intelligente.

## Personnalité

- Empathique : tu reconnais et valides les émotions sans les juger
- Curieux avec délicatesse : questions ouvertes, jamais intrusives
- Calme et posé : tu laisses de l'espace, tu ne surcharges pas
- Inspirant mais sobre : tu aides à donner du sens sans exagérer
- Humble : tu proposes, tu ne conclus jamais à la place de l'utilisateur

## Comportement en conversation

Tu alternes entre 4 modes selon le moment :
1. Écoute et validation — reformule ce que l'utilisateur exprime, mets en lumière les émotions perçues
2. Questions ouvertes — une ou deux maximum par message, pour approfondir
3. Exploration du sens — aide à relier les événements entre eux, faire émerger les fils conducteurs
4. Reformulation narrative — transforme certains passages en récit fluide (proposé, jamais imposé)

## Règles absolues

- Ne jamais juger, donner des leçons, interpréter de façon catégorique, inventer
- Une seule question à la fois
- Phrases courtes, ton naturel — jamais technique ou froid
- Pas de liste à puces, pas de titres
- Si l'utilisateur évoque quelque chose de difficile : reconnaître la difficulté, ralentir, rester simple
- Langue : français uniquement`

const DRAFT_SIGNAL = `## Signal de fin — brouillon d'alinéa

Quand tu génères le brouillon d'alinéa final, tu DOIS terminer ton message par ce bloc JSON exactement, sur une nouvelle ligne :

\`\`\`alinea-draft
{"title": "...", "content": "...", "emotion": "joy|pride|nostalgia|sadness|gratitude", "category": "places|people|moments|transitions|objects|values", "approximate_date": "...ou null"}
\`\`\`

Le "content" doit être le texte de l'alinéa rédigé à la première personne, entre 3 et 8 phrases. Le "title" est un titre court et évocateur. Choisis l'émotion et la catégorie qui correspondent le mieux au souvenir. "approximate_date" est une date approximative en texte libre si elle est mentionnée, sinon null.`

const MEMORY_SIGNAL = `## Détection et mémorisation — règle capitale

Quand l'utilisateur mentionne une NOUVELLE entité absente de ton index (personne, événement de vie, thématique, lieu, phase de vie), tu dois :

1. Répondre naturellement dans le fil de la conversation.
2. À la fin de ton message, présenter en clair les éléments que tu souhaites retenir :
   "Dans ce que tu viens de partager, j'aimerais retenir : ..."
3. Terminer ton message par le bloc JSON ci-dessous — et UNIQUEMENT si tu as des entités nouvelles à valider.

RÈGLE ABSOLUE :
- Ne proposer QUE des entités absentes de l'index (personnes, events, thèmes déjà listés → ne pas reproposer).
- Attendre la confirmation de l'utilisateur avant tout enregistrement.
- Ne jamais émettre ce bloc pour un brouillon d'alinéa (les deux blocs ne coexistent pas).

Types supportés :
- "person"     → personne importante (data: name, relation, relation_type)
- "life_event" → événement de vie (data: title, year — year est un entier ou null)
- "theme"      → fil thématique (data: name)
- "place"      → lieu fondateur (data: name, role)
- "life_phase" → période de vie (data: name, year_start, year_end — entiers, year_end null si en cours)

Format du bloc (terminer le message par ce JSON exact) :

\`\`\`memory-pending
[{"type":"person","icon":"👤","label":"Baptiste","data":{"name":"Baptiste","relation":"ami de longue date","relation_type":"amitié"}},{"type":"life_event","icon":"📅","label":"La rencontre avec Laurence","data":{"title":"La rencontre avec Laurence","year":1982}}]
\`\`\`

Exemples d'icônes : 👤 person · 📅 life_event · 🏷 theme · 📍 place · 🗓 life_phase`

const MEMORY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_memory',
    description:
      "Récupère le contenu complet d'un souvenir (alinéa rédigé) ou d'un événement de vie à partir de son identifiant. " +
      "Utilise cet outil dès que l'utilisateur fait référence à un souvenir ou événement présent dans l'index — avant de formuler ta réponse.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['alinea', 'life_event'],
          description: "'alinea' pour un souvenir rédigé, 'life_event' pour un événement de la frise de vie",
        },
        id: {
          type: 'string',
          description: "UUID de l'élément, tel qu'il apparaît dans l'index",
        },
      },
      required: ['type', 'id'],
    },
  },
]

type AiProfile = {
  display_name: string | null
  birth_year: number | null
  portrait: string | null
  narrative_style: string | null
  themes_summary: Array<{ name: string; maturity: string }> | null
  people_summary: Array<{ name: string; relation: string | null; relation_type: string | null }> | null
}

type CompactLifeEvent = { id: string; year: number; title: string; is_pivot: boolean }
type CompactAlinea = { id: string; title: string | null; approximate_date: string | null }

function buildMemoryBlock(
  profile: AiProfile,
  events: CompactLifeEvent[],
  alineas: CompactAlinea[],
): string {
  const name = profile.display_name ?? "l'utilisateur"
  const themes = profile.themes_summary ?? []
  const people = profile.people_summary ?? []

  const lines: string[] = [`## Ce que tu sais de ${name}`]
  if (profile.portrait) lines.push(`\nPortrait : ${profile.portrait}`)
  if (people.length > 0)
    lines.push(`Personnes connues : ${people.map(p => `${p.name}${p.relation ? ` (${p.relation})` : ''}`).join(', ')}`)
  if (themes.length > 0)
    lines.push(`Thématiques de vie : ${themes.map(t => `${t.name} [${t.maturity}]`).join(', ')}`)

  // Index — titres + IDs uniquement, pas de contenu
  lines.push('\n## Index des souvenirs')

  if (events.length > 0) {
    lines.push('\nFrise de vie :')
    for (const e of events) {
      lines.push(`- [${e.id}] ${e.year} — ${e.title}${e.is_pivot ? ' [tournant]' : ''}`)
    }
  } else {
    lines.push('\nFrise de vie : vide')
  }

  if (alineas.length > 0) {
    lines.push('\nAlinéas rédigés :')
    for (const a of alineas) {
      const label = [a.title ?? 'Sans titre', a.approximate_date].filter(Boolean).join(' · ')
      lines.push(`- [${a.id}] ${label}`)
    }
  } else {
    lines.push("\nAlinéas rédigés : aucun pour l'instant")
  }

  lines.push(`
## Règles de mémoire

- Si l'utilisateur mentionne un sujet présent dans l'index → utilise fetch_memory avant de répondre.
- Si le sujet est absent de l'index → signale-le simplement et propose d'en parler.
- Ne jamais inventer de contenu non chargé via fetch_memory.
- Parle naturellement — ne mentionne jamais de base de données, d'index ou d'outil.`)

  return '\n\n' + lines.join('\n')
}

async function executeFetchMemory(
  input: { type: string; id: string },
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  if (input.type === 'alinea') {
    const { data } = await supabase
      .from('alineas')
      .select('title, content, approximate_date, emotion, category')
      .eq('id', input.id)
      .eq('user_id', userId)
      .single()
    if (!data) return 'Souvenir introuvable.'
    const header = [data.title ?? 'Sans titre', data.approximate_date].filter(Boolean).join(' · ')
    return `**${header}**\n\n${data.content ?? '(contenu vide)'}`
  }

  if (input.type === 'life_event') {
    const { data } = await supabase
      .from('life_events')
      .select('year, title, is_pivot, emotional_intensity')
      .eq('id', input.id)
      .eq('user_id', userId)
      .single()
    if (!data) return 'Événement introuvable.'
    return `**${data.year} — ${data.title}**${data.is_pivot ? ' [moment tournant]' : ''}\nIntensité émotionnelle : ${data.emotional_intensity}/3`
  }

  return 'Type inconnu.'
}

function buildNewSystemPrompt(memoryBlock: string): string {
  return `${PERSONALITY}${memoryBlock}

## Déroulement de la conversation

1. Commence par une question d'amorce sur le souvenir que l'utilisateur veut partager.
2. Creuse avec 1 à 2 questions de suivi pour obtenir des détails sensoriels, émotionnels, des personnes impliquées.
3. Quand tu as suffisamment de matière (généralement après 3–5 échanges), rédige un premier alinéa à la première personne. Annonce-le avant.
4. Propose à l'utilisateur de valider ou d'ajuster.

${DRAFT_SIGNAL}

${MEMORY_SIGNAL}`
}

function buildOnboardingMode1Prompt(memoryBlock: string): string {
  return `${PERSONALITY}${memoryBlock}

## Mode onboarding — première rencontre (Mode 1)

L'utilisateur vient de créer son compte. Tu le rencontres pour la première fois.
Ton objectif : recueillir trois informations essentielles en 3 à 4 échanges naturels, pas plus.

**Étape 1 — Prénom** (si absent du profil)
> "Bonjour ! Je vais t'accompagner pour explorer et raconter ta vie, à ton rythme. Pour commencer — comment aimerais-tu que je t'appelle ?"

**Étape 2 — Année de naissance** (si absente du profil)
> "Et en quelle année es-tu né(e) ?"

**Étape 3 — Famille immédiate** (si aucune personne en base)
> "Tu as des enfants ? Un(e) conjoint(e) ? Des parents encore présents ?"
L'IA collecte les personnes nommées et leurs liens au fil de la réponse — pas de formulaire.

**Règles strictes pour ce mode :**
- Une question à la fois, pas de liste
- Ton factuel et chaleureux — pas émotionnel, pas profond
- Dès que les 3 étapes sont faites, conclure :
  > "C'est tout ce dont j'ai besoin pour commencer. Ta grille est prête — elle se remplira au fil de nos échanges. Tu veux qu'on continue à l'explorer ensemble maintenant ?"
- Si l'utilisateur veut en dire plus → l'écouter mais rester en mode collecte léger, pas d'approfondissement
- Utiliser le bloc memory-pending dès qu'une entité est à mémoriser (prénom → profil, famille → personnes)

${MEMORY_SIGNAL}`
}

function buildEditSystemPrompt(existingContent: string, memoryBlock: string, aiMemory?: string): string {
  const memSection = aiMemory ? `\n## Mémoire de la conversation originale\n\n${aiMemory}\n` : ''
  return `${PERSONALITY}${memoryBlock}
${memSection}
## Mode révision

L'utilisateur souhaite retravailler ce récit qu'il a déjà rédigé :

---
${existingContent}
---

Commence par lui demander ce qu'il voudrait améliorer ou approfondir. Quand tu as suffisamment de matière, propose une version révisée.

${DRAFT_SIGNAL}`
}

export async function POST(request: NextRequest) {
  const { messages: incomingMessages, existingContent, aiMemory } = await request.json() as {
    messages: Anthropic.MessageParam[]
    existingContent?: string
    aiMemory?: string
  }

  // Auth + chargement de l'index mémoire
  let memoryBlock = ''
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null
  let userId: string | null = null

  try {
    supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
      const [{ data: profile }, { data: rawEvents }, { data: rawAlineas }] = await Promise.all([
        supabase
          .from('v_ai_profile')
          .select('display_name, birth_year, portrait, narrative_style, themes_summary, people_summary')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('life_events')
          .select('id, year, title, is_pivot')
          .eq('user_id', user.id)
          .order('year', { ascending: true }),
        supabase
          .from('alineas')
          .select('id, title, approximate_date')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      if (profile) {
        memoryBlock = buildMemoryBlock(
          profile as AiProfile,
          (rawEvents ?? []) as CompactLifeEvent[],
          (rawAlineas ?? []) as CompactAlinea[],
        )
      }
    }
  } catch { /* continuer sans mémoire */ }

  // Détecter le mode onboarding Mode 1
  const isOnboardingMode1 = !existingContent
    && incomingMessages.length === 1
    && (incomingMessages[0] as Anthropic.MessageParam).role === 'user'
    && (incomingMessages[0] as Anthropic.MessageParam).content === '__onboarding_mode1__'

  const systemPrompt = existingContent
    ? buildEditSystemPrompt(existingContent, memoryBlock, aiMemory)
    : isOnboardingMode1
    ? buildOnboardingMode1Prompt(memoryBlock)
    : buildNewSystemPrompt(memoryBlock)

  // Remplacer le seed technique par un déclencheur neutre pour l'IA
  const effectiveMessages = isOnboardingMode1
    ? [{ role: 'user' as const, content: 'Bonjour' }]
    : incomingMessages

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      let loopCount = 0

      try {
        let messages: Anthropic.MessageParam[] = effectiveMessages
        while (loopCount < 4) {
          const stream = client.messages.stream({
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            system: systemPrompt,
            tools: MEMORY_TOOLS,
            messages,
          })

          // Pipe les deltas texte directement vers le client
          stream.on('text', (text) => {
            controller.enqueue(encoder.encode(text))
          })

          const message = await stream.finalMessage()

          if (message.stop_reason !== 'tool_use') break

          // Exécuter les outils demandés par l'IA
          const toolUseBlocks = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async (block) => {
              let content = 'Outil non disponible'
              if (block.name === 'fetch_memory' && supabase && userId) {
                content = await executeFetchMemory(
                  block.input as { type: string; id: string },
                  supabase,
                  userId,
                )
              }
              return { type: 'tool_result' as const, tool_use_id: block.id, content }
            }),
          )

          messages = [
            ...messages,
            { role: 'assistant' as const, content: message.content },
            { role: 'user' as const, content: toolResults },
          ]
          loopCount++
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

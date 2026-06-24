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

const DRAFT_SIGNAL = `## Signal de fin

Quand tu génères le brouillon d'alinéa final, tu DOIS terminer ton message par ce bloc JSON exactement, sur une nouvelle ligne :

\`\`\`alinea-draft
{"title": "...", "content": "...", "emotion": "joy|pride|nostalgia|sadness|gratitude", "category": "places|people|moments|transitions|objects|values", "approximate_date": "...ou null"}
\`\`\`

Le "content" doit être le texte de l'alinéa rédigé à la première personne, entre 3 et 8 phrases. Le "title" est un titre court et évocateur. Choisis l'émotion et la catégorie qui correspondent le mieux au souvenir. "approximate_date" est une date approximative en texte libre si elle est mentionnée, sinon null.`

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

${DRAFT_SIGNAL}`
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

  const systemPrompt = existingContent
    ? buildEditSystemPrompt(existingContent, memoryBlock, aiMemory)
    : buildNewSystemPrompt(memoryBlock)

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      let messages: Anthropic.MessageParam[] = incomingMessages
      let loopCount = 0

      try {
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

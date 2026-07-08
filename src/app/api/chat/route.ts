import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AGENT_TOOLS, READ_TOOL_NAMES, IMMEDIATE_WRITE_TOOL_NAMES,
  executeReadTool, executeFlagAmbiguous, labelForWrite, iconForWrite,
  type PendingWrite,
} from '@/lib/agent/tools'

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

Quand tu génères le brouillon d'alinéa final (rédaction complète, sur demande explicite de l'utilisateur — bouton ou phrase du type "tu peux rédiger ça ?"), tu DOIS terminer ton message par ce bloc JSON exactement, sur une nouvelle ligne :

\`\`\`alinea-draft
{"title": "...", "content": "...", "emotion": "joy|pride|nostalgia|sadness|gratitude", "category": "places|people|moments|transitions|objects|values", "approximate_date": "...ou null"}
\`\`\`

Le "content" doit être le texte de l'alinéa rédigé à la première personne, entre 3 et 8 phrases. Le "title" est un titre court et évocateur. Choisis l'émotion et la catégorie qui correspondent le mieux au souvenir. "approximate_date" est une date approximative en texte libre si elle est mentionnée, sinon null.

Hors de cette demande explicite, tu ne rédiges pas de texte narratif fini — tu peux en revanche amorcer un futur alinéa avec l'outil seed_alinea dès qu'une trame narrative émerge, sans attendre la demande de rédaction.`

const AGENT_LOOP_RULES = `## Mémoire — règle capitale : chercher avant d'écrire, jamais de mémorisation silencieuse

Tu disposes d'outils pour consulter et faire évoluer la mémoire de vie (personnes, thématiques, lieux, phases de vie, événements, alinéas). Applique strictement :

1. **Cherche avant d'écrire.** Dès qu'une entité (personne, lieu, thématique, phase, événement) est mentionnée, utilise l'outil de recherche correspondant (search_people, search_themes, search_places, search_life_phases, search_life_events) avant toute proposition d'écriture — pour savoir si elle existe déjà.
2. **Lis avant de décider.** Si un candidat plausible ressort de la recherche, utilise l'outil get_* correspondant pour lire la fiche complète avant de choisir entre mise à jour et création.
3. **Jamais de mémorisation silencieuse.** Les outils d'écriture (upsert_person, upsert_place, upsert_life_phase, upsert_life_event, propose_theme, update_theme, link_people_relation, declare_family_unit, seed_alinea, update_profile) n'enregistrent qu'une PROPOSITION — ils ne s'exécutent jamais tout de suite. Avant de les appeler, ou juste après, EXPLICITE dans ta réponse ce que tu proposes de retenir, en langage naturel, sans jargon technique (ex. "je note ceci comme...") — jamais une affirmation déguisée en fait acquis. Termine ton message normalement ; l'utilisateur confirmera ou ajustera au tour suivant.
4. **Ambiguïté → flag_ambiguous.** Si deux fiches proches ou une information incertaine te empêchent de trancher, n'invente pas — dépose l'ambiguïté avec flag_ambiguous (celui-ci s'exécute immédiatement, ce n'est pas une proposition) et continue le dialogue normalement.
5. **Rien à retenir → rien à faire.** N'appelle aucun outil d'écriture si l'échange n'apporte rien de nouveau.
6. Ne mentionne jamais d'outil, de base de données ou de mécanisme technique à l'utilisateur — parle naturellement.`

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
## Règles d'usage de l'index

- Si l'utilisateur mentionne un sujet présent dans l'index → utilise fetch_memory avant de répondre.
- Si le sujet est absent de l'index → signale-le simplement et propose d'en parler.
- Ne jamais inventer de contenu non chargé via fetch_memory.`)

  return '\n\n' + lines.join('\n')
}

function buildNewSystemPrompt(memoryBlock: string): string {
  return `${PERSONALITY}${memoryBlock}

## Déroulement de la conversation

1. Commence par une question d'amorce sur le souvenir que l'utilisateur veut partager.
2. Creuse avec 1 à 2 questions de suivi pour obtenir des détails sensoriels, émotionnels, des personnes impliquées.
3. Quand une trame narrative émerge, amorce un alinéa (seed_alinea) — cf. règles mémoire ci-dessous.
4. Si l'utilisateur demande explicitement une rédaction complète, rédige un alinéa et annonce-le avant.

${DRAFT_SIGNAL}

${AGENT_LOOP_RULES}`
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
Collecte les personnes nommées et leurs liens au fil de la réponse — pas de formulaire.

**Règles strictes pour ce mode :**
- Une question à la fois, pas de liste
- Ton factuel et chaleureux — pas émotionnel, pas profond
- Dès que les 3 étapes sont faites, conclure :
  > "C'est tout ce dont j'ai besoin pour commencer. Ta grille est prête — elle se remplira au fil de nos échanges. Tu veux qu'on continue à l'explorer ensemble maintenant ?"
- Si l'utilisateur veut en dire plus → l'écouter mais rester en mode collecte léger, pas d'approfondissement
- Prénom/année → propose via update_profile ; famille → propose via upsert_person (un appel par personne)

${AGENT_LOOP_RULES}`
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

${DRAFT_SIGNAL}

${AGENT_LOOP_RULES}`
}

export async function POST(request: NextRequest) {
  const { messages: incomingMessages, existingContent, aiMemory } = await request.json() as {
    messages: Anthropic.MessageParam[]
    existingContent?: string
    aiMemory?: string
  }

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

  const isOnboardingMode1 = !existingContent
    && incomingMessages.length === 1
    && (incomingMessages[0] as Anthropic.MessageParam).role === 'user'
    && (incomingMessages[0] as Anthropic.MessageParam).content === '__onboarding_mode1__'

  const systemPrompt = existingContent
    ? buildEditSystemPrompt(existingContent, memoryBlock, aiMemory)
    : isOnboardingMode1
    ? buildOnboardingMode1Prompt(memoryBlock)
    : buildNewSystemPrompt(memoryBlock)

  const effectiveMessages = isOnboardingMode1
    ? [{ role: 'user' as const, content: 'Bonjour' }]
    : incomingMessages

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      let loopCount = 0
      const pendingWrites: PendingWrite[] = []

      try {
        let messages: Anthropic.MessageParam[] = effectiveMessages
        while (loopCount < 6) {
          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 1536,
            system: systemPrompt,
            tools: AGENT_TOOLS,
            messages,
          })

          stream.on('text', (text) => {
            controller.enqueue(encoder.encode(text))
          })

          const message = await stream.finalMessage()

          if (message.stop_reason !== 'tool_use') break

          const toolUseBlocks = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async (block) => {
              let content = 'Outil non disponible'
              if (supabase && userId) {
                if (READ_TOOL_NAMES.has(block.name)) {
                  content = await executeReadTool(block.name, block.input as Record<string, unknown>, supabase, userId)
                } else if (IMMEDIATE_WRITE_TOOL_NAMES.has(block.name)) {
                  content = await executeFlagAmbiguous(block.input as Record<string, unknown>, supabase, userId)
                } else {
                  // Écriture différée : on enregistre la proposition, on ne l'exécute pas.
                  pendingWrites.push({ tool: block.name, input: block.input as Record<string, unknown> })
                  content = 'Proposition enregistrée, en attente de confirmation utilisateur.'
                }
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

        if (pendingWrites.length > 0) {
          const payload = pendingWrites.map(w => ({
            tool: w.tool,
            input: w.input,
            label: labelForWrite(w.tool, w.input),
            icon: iconForWrite(w.tool),
          }))
          controller.enqueue(encoder.encode(`\n\n\`\`\`memory-pending\n${JSON.stringify(payload)}\n\`\`\``))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

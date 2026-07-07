import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PendingEntity } from '@/app/api/memory/confirm/route'

const client = new Anthropic()

const EXTRACT_PROMPT = `Tu es la mémoire d'un service d'autobiographie. Au fil d'une conversation, tu construis progressivement la liste des éléments à retenir sur l'utilisateur.

On te donne :
1. CE QUE TU RETIENS DÉJÀ — la liste accumulée jusqu'ici (peut être vide).
2. LE DERNIER ÉCHANGE — un message de l'utilisateur et la réponse de l'assistant.

Ta tâche : renvoyer la liste COMPLÈTE et MISE À JOUR de ce qu'il faut retenir.
- Conserve les entités déjà captées qui restent valides — ne perds jamais le fil.
- AFFINE une entité existante si le dernier échange la précise (ajuste son label / ses données).
- AJOUTE uniquement ce qui est vraiment nouveau et suffisamment net.
- NE FRAGMENTE PAS : une idée maîtresse bien formulée vaut mieux que dix bribes floues. Au premier échange on capte l'idée centrale ; les échanges suivants la précisent.
- N'invente rien, ne déduis pas ce qui n'est pas dit explicitement.

Types d'entités :
- "profile"    : prénom/nom d'usage, année de naissance (data: display_name?, birth_year?)
- "person"     : personne importante (data: name, relation? [texte libre, ex. "sœur de Laurence"], relation_type? STRICTEMENT parmi : "famille" | "amitié" | "professionnel" | "romantique" | "autre")
- "life_event" : événement de vie (data: title, year? [n'invente JAMAIS une année non dite])
- "theme"      : fil thématique de vie (data: name)
- "place"      : lieu fondateur (data: name, role?)
- "life_phase" : période de vie nommée (data: name, year_start? [omets si inconnu], year_end?)

Icônes : 👤 person · 📅 life_event · 🏷 theme · 📍 place · 🗓 life_phase · 🪪 profile

Réponds UNIQUEMENT avec un objet JSON, sans commentaire :
{"entities":[{"type":"theme","icon":"🏷","label":"La vie sentimentale","data":{"name":"La vie sentimentale"}}],"ready":false}

Le champ "ready" passe à true seulement quand la base te paraît assez riche et stable pour proposer à l'utilisateur de tout mémoriser.`

export async function POST(request: NextRequest) {
  const { accumulated, lastUserMessage, lastAiMessage } = await request.json() as {
    accumulated:     PendingEntity[]
    lastUserMessage: string
    lastAiMessage:   string
  }

  // Auth — juste pour valider la session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ entities: accumulated ?? [], ready: false })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: EXTRACT_PROMPT,
      messages: [{
        role: 'user',
        content: `CE QUE TU RETIENS DÉJÀ :
${accumulated?.length ? JSON.stringify(accumulated, null, 2) : 'rien encore'}

LE DERNIER ÉCHANGE :
Utilisateur : "${lastUserMessage}"
Assistant : "${lastAiMessage}"

Liste complète et mise à jour (JSON uniquement) :`,
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

    // Parser le JSON — tolérant aux backticks éventuels
    const clean = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean) as { entities?: PendingEntity[]; ready?: boolean }
    const entities = Array.isArray(parsed.entities) ? parsed.entities : []

    // Ne jamais effacer l'accumulé sur une réponse vide : on garde le fil
    if (entities.length === 0 && (accumulated?.length ?? 0) > 0) {
      return NextResponse.json({ entities: accumulated, ready: false })
    }
    return NextResponse.json({ entities, ready: Boolean(parsed.ready) })
  } catch {
    // En cas d'erreur, on conserve l'accumulé existant — on ne perd pas le fil
    return NextResponse.json({ entities: accumulated ?? [], ready: false })
  }
}

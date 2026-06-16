import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const SYNTHESIS_PROMPT = `Tu analyses une conversation dans laquelle un utilisateur a partagé des souvenirs avec Alinéa.

Extrais et synthétise en quelques lignes les informations importantes partagées par l'utilisateur — celles qui ne figurent pas nécessairement dans le récit final mais qui pourraient enrichir une révision future :

- Personnes mentionnées (prénoms, liens, anecdotes)
- Lieux (villes, maisons, quartiers, pays)
- Périodes et dates évoquées
- Détails sensoriels (sons, odeurs, couleurs, sensations physiques)
- Émotions et contexte affectif
- Anecdotes ou détails marquants

Sois factuel et concis (8 lignes max). Ne reformule pas le récit final. Écris en français.`

type Message = { role: string; content: string }

export async function POST(request: NextRequest) {
  const { messages } = await request.json() as { messages: Message[] }

  const formatted = messages
    .map((m) => `[${m.role === 'user' ? 'Utilisateur' : 'Alinéa'}] : ${m.content}`)
    .join('\n\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: SYNTHESIS_PROMPT,
    messages: [{ role: 'user', content: formatted }],
  })

  const synthesis = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ synthesis })
}

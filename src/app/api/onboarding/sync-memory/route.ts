import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

type SyncRequest = {
  recentMessages:   Array<{ role: 'user' | 'assistant'; content: string }>
  peopleNames:      string[]
  placeNames:       string[]
  hasProfileUpdate: boolean
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid  = user.id
  const body = await req.json() as SyncRequest
  const { recentMessages, peopleNames, placeNames, hasProfileUpdate } = body

  if (!hasProfileUpdate && !peopleNames.length && !placeNames.length) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    // Récupérer l'état mémoire actuel des entités concernées
    const [{ data: memory }, { data: people }] = await Promise.all([
      supabase.from('user_memory')
        .select('portrait, key_places')
        .eq('user_id', uid)
        .maybeSingle(),
      peopleNames.length
        ? supabase.from('people')
            .select('id, name, ai_summary')
            .eq('user_id', uid)
            .in('name', peopleNames)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; ai_summary: string | null }> }),
    ])

    const currentPortrait = memory?.portrait ?? null
    const keyPlaces = (memory?.key_places as Array<{ name: string; role: string; notes?: string }> | null) ?? []

    // Construire l'extrait de conversation (8 derniers messages, blocs extraits retirés)
    const excerpt = recentMessages.slice(-8).map(m => {
      const cleaned = m.content.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n').trim()
      return `${m.role === 'user' ? 'Utilisateur' : 'Alinéa'}: ${cleaned}`
    }).filter(l => l.length > 20).join('\n\n')

    // Blocs mémoire actuels des personnes et lieux concernés
    const peopleBlock = (people ?? []).map(p =>
      `- ${p.name} : ${p.ai_summary ?? 'vide'}`
    ).join('\n')

    const placesBlock = placeNames.map(name => {
      const found = keyPlaces.find(p => p.name.toLowerCase() === name.toLowerCase())
      const current = found?.notes ?? (found?.role ? `rôle : ${found.role}` : 'vide')
      return `- ${name} : ${current}`
    }).join('\n')

    // Exemples de noms pour le JSON template
    const peoplePlaceholder = peopleNames.length
      ? Object.fromEntries(peopleNames.map(n => [n, '...']))
      : {}
    const placesPlaceholder = placeNames.length
      ? Object.fromEntries(placeNames.map(n => [n, '...']))
      : {}

    const anthropic = new Anthropic()
    const result = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 700,
      messages: [{
        role:    'user',
        content: `Tu es le gestionnaire de mémoire d'Alinéa. À partir de cet échange, mets à jour les blocs mémoire des entités concernées.

## Extrait de conversation
${excerpt}

## Blocs mémoire actuels
Portrait : ${currentPortrait ?? 'vide'}
${peopleBlock ? `\nPersonnes :\n${peopleBlock}` : ''}
${placesBlock ? `\nLieux :\n${placesBlock}` : ''}

## Consignes
- Portrait (3ème personne, 2–3 phrases) : qui est cette personne, d'où vient-elle, ce qui compte pour elle. Intègre les nouvelles informations sans effacer les anciennes. Retourne null si l'échange n'apporte rien de nouveau.
- Personnes (1–3 phrases) : ce que cette personne représente POUR l'utilisateur — rôle, lien affectif, anecdote significative. Intègre les nuances exprimées. Retourne null si rien de nouveau.
- Lieux (1–2 phrases) : ce que ce lieu évoque, ce qu'il signifie dans la vie de l'utilisateur. Retourne null si rien de nouveau.
- Ne génère une mise à jour QUE si l'échange apporte une information nouvelle ou affine ce qui existe.

Réponds UNIQUEMENT avec ce JSON, sans balise, sans prose :
${JSON.stringify({ portrait: '...ou null', people: peoplePlaceholder, places: placesPlaceholder }, null, 2)}`,
      }],
    })

    const raw = result.content[0]?.type === 'text' ? result.content[0].text.trim() : null
    if (!raw) return NextResponse.json({ ok: true, skipped: true })

    let updates: {
      portrait?: string | null
      people?:   Record<string, string | null>
      places?:   Record<string, string | null>
    }
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      updates = JSON.parse(cleaned)
    } catch {
      console.error('[sync-memory] parse error:', raw)
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Persister les mises à jour en parallèle
    const saves: PromiseLike<unknown>[] = []

    if (updates.portrait) {
      saves.push(
        supabase.from('user_memory')
          .upsert({ user_id: uid, portrait: updates.portrait }, { onConflict: 'user_id' })
          .then(() => {})
      )
    }

    if (updates.people) {
      for (const [name, summary] of Object.entries(updates.people)) {
        if (!summary) continue
        const person = (people ?? []).find(p => p.name.toLowerCase() === name.toLowerCase())
        if (person?.id) {
          saves.push(
            supabase.from('people').update({ ai_summary: summary }).eq('id', person.id).then(() => {})
          )
        }
      }
    }

    if (updates.places) {
      const updatedPlaces = [...keyPlaces]
      for (const [name, notes] of Object.entries(updates.places)) {
        if (!notes) continue
        const idx = updatedPlaces.findIndex(p => p.name.toLowerCase() === name.toLowerCase())
        if (idx >= 0) updatedPlaces[idx] = { ...updatedPlaces[idx], notes }
        else updatedPlaces.push({ name, role: '', notes })
      }
      saves.push(
        supabase.from('user_memory')
          .upsert({ user_id: uid, key_places: updatedPlaces }, { onConflict: 'user_id' })
          .then(() => {})
      )
    }

    await Promise.all(saves)
    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[sync-memory]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

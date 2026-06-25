import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PeopleRelationType } from '@/types/domain'
import { RELATION_TYPE_LABEL } from '@/types/domain'

const anthropic = new Anthropic()

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch person
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (personError || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Fetch relations where this person is A or B
  const [{ data: relationsA }, { data: relationsB }] = await Promise.all([
    supabase
      .from('people_relations')
      .select('*, person_b_id')
      .eq('user_id', user.id)
      .eq('person_a_id', id)
      .eq('confirmed', true),
    supabase
      .from('people_relations')
      .select('*, person_a_id')
      .eq('user_id', user.id)
      .eq('person_b_id', id)
      .eq('confirmed', true),
  ])

  // Collect all related person IDs
  const relatedIds = new Set<string>()
  ;(relationsA ?? []).forEach(r => relatedIds.add(r.person_b_id))
  ;(relationsB ?? []).forEach(r => relatedIds.add(r.person_a_id))

  // Fetch names of related people
  let nameMap: Record<string, string> = {}
  if (relatedIds.size > 0) {
    const { data: relatedPeople } = await supabase
      .from('people')
      .select('id, name')
      .in('id', [...relatedIds])

    if (relatedPeople) {
      nameMap = Object.fromEntries(relatedPeople.map(p => [p.id, p.name]))
    }
  }

  // Build relations description
  const allRelations = [
    ...(relationsA ?? []).map(r => ({
      otherName: nameMap[r.person_b_id] ?? r.person_b_id,
      type: r.relation_type as PeopleRelationType,
      direction: 'a_to_b' as const,
    })),
  ]

  const relationsText = allRelations.length > 0
    ? allRelations
        .map(r => `- ${person.name} est ${RELATION_TYPE_LABEL[r.type] ?? r.type} ${r.otherName}`)
        .join('\n')
    : 'Aucun lien déclaré.'

  // Fetch last 5 alineas where person appears
  const { data: alineaPeople } = await supabase
    .from('alinea_people')
    .select('alinea_id')
    .eq('person_id', id)
    .limit(5)

  const alineaIds = (alineaPeople ?? []).map(ap => ap.alinea_id)
  let extraits = 'Aucun alinéa disponible.'

  if (alineaIds.length > 0) {
    const { data: alineas } = await supabase
      .from('alineas')
      .select('content, title, approximate_date')
      .in('id', alineaIds)
      .order('created_at', { ascending: false })
      .limit(5)

    if (alineas && alineas.length > 0) {
      extraits = alineas
        .map(a => {
          const parts = []
          if (a.title) parts.push(`Titre : ${a.title}`)
          if (a.approximate_date) parts.push(`Date : ${a.approximate_date}`)
          if (a.content) parts.push(a.content.slice(0, 400))
          return parts.join(' — ')
        })
        .join('\n\n')
    }
  }

  const prompt = `Tu construis la synthèse mémorielle d'une personne pour l'outil autobiographique Alinéa.

Voici ce que l'utilisateur a dit sur ${person.name} dans ses alinéas :
${extraits}

Voici les liens déclarés de ${person.name} avec d'autres personnes :
${relationsText}

Rédige en 2 à 4 phrases la synthèse du lien entre l'utilisateur et ${person.name}, en intégrant le contexte familial si pertinent. Ton : intime, observateur, jamais clinique. Écris en français.`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const summary = message.content[0].type === 'text' ? message.content[0].text : ''

  // Update person's ai_summary
  await supabase
    .from('people')
    .update({ ai_summary: summary })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true, summary })
}

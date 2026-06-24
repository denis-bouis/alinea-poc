import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — fusionner deux personnes en une seule
// keepId   : la personne dont on garde le nom et les données
// deleteId : le doublon à supprimer
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { keepId, deleteId } = await req.json() as { keepId: string; deleteId: string }
  const uid = user.id

  if (!keepId || !deleteId || keepId === deleteId) {
    return NextResponse.json({ error: 'Invalid ids' }, { status: 400 })
  }

  try {
    // 1. Récupérer toutes les relations du doublon
    const { data: relationsA } = await supabase.from('people_relations')
      .select('*').eq('user_id', uid).eq('person_a_id', deleteId)
    const { data: relationsB } = await supabase.from('people_relations')
      .select('*').eq('user_id', uid).eq('person_b_id', deleteId)

    // 2. Recréer ces relations avec keepId (ignorance des doublons)
    const toUpsert: Array<{ user_id: string; person_a_id: string; person_b_id: string; relation_label: string | null; confirmed: boolean; declared_in: string }> = []

    for (const r of (relationsA ?? [])) {
      const newA = r.person_a_id === deleteId ? keepId : r.person_a_id
      const newB = r.person_b_id === deleteId ? keepId : r.person_b_id
      if (newA !== newB) { // pas d'auto-relation
        toUpsert.push({ user_id: uid, person_a_id: newA, person_b_id: newB, relation_label: r.relation_label, confirmed: true, declared_in: 'manual' })
      }
    }
    for (const r of (relationsB ?? [])) {
      const newA = r.person_a_id === deleteId ? keepId : r.person_a_id
      const newB = r.person_b_id === deleteId ? keepId : r.person_b_id
      if (newA !== newB) {
        toUpsert.push({ user_id: uid, person_a_id: newA, person_b_id: newB, relation_label: r.relation_label, confirmed: true, declared_in: 'manual' })
      }
    }

    if (toUpsert.length > 0) {
      await supabase.from('people_relations')
        .upsert(toUpsert, { onConflict: 'user_id,person_a_id,person_b_id', ignoreDuplicates: true })
    }

    // 3. Supprimer toutes les relations du doublon
    await supabase.from('people_relations')
      .delete()
      .eq('user_id', uid)
      .or(`person_a_id.eq.${deleteId},person_b_id.eq.${deleteId}`)

    // 4. Supprimer le doublon
    await supabase.from('people').delete().eq('id', deleteId).eq('user_id', uid)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[people/merge]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

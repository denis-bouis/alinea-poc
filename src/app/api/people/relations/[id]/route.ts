import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PeopleRelationType } from '@/types/domain'

const INVERSE_TYPE: Partial<Record<PeopleRelationType, PeopleRelationType>> = {
  parent_of: 'child_of',
  child_of: 'parent_of',
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch the relation to delete first (need person_a_id, person_b_id, relation_type, is_symmetric)
  const { data: relation, error: fetchError } = await supabase
    .from('people_relations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !relation) {
    return NextResponse.json({ error: 'Relation not found' }, { status: 404 })
  }

  // Delete the primary row
  const { error: deleteError } = await supabase
    .from('people_relations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // Delete the mirror row
  const relationType = relation.relation_type as PeopleRelationType
  const mirrorType = relation.is_symmetric ? relationType : INVERSE_TYPE[relationType]

  if (mirrorType) {
    await supabase
      .from('people_relations')
      .delete()
      .eq('user_id', user.id)
      .eq('person_a_id', relation.person_b_id)
      .eq('person_b_id', relation.person_a_id)
      .eq('relation_type', mirrorType)
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PeopleRelationType } from '@/types/domain'
import { deriveRelationPair } from '@/lib/agent/tools'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    person_a_id: string
    person_b_id: string
    relation_type: PeopleRelationType
    qualifier?: string
  }

  const { person_a_id, person_b_id, relation_type, qualifier } = body

  if (!person_a_id || !person_b_id || !relation_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const rows = deriveRelationPair(
    { user_id: user.id, qualifier: qualifier ?? null, family_unit_id: null, confirmed: true, declared_in: 'manual' },
    person_a_id, person_b_id, relation_type,
  )

  const { error } = await supabase.from('people_relations').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

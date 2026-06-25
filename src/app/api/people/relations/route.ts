import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PeopleRelationType } from '@/types/domain'

const SYMMETRIC_TYPES = new Set<PeopleRelationType>([
  'sibling_of',
  'partner_of',
  'friend_of',
  'colleague_of',
])

const INVERSE_TYPE: Partial<Record<PeopleRelationType, PeopleRelationType>> = {
  parent_of: 'child_of',
  child_of: 'parent_of',
}

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

  const isSymmetric = SYMMETRIC_TYPES.has(relation_type)
  const base = {
    user_id: user.id,
    confirmed: true,
    declared_in: 'manual',
    qualifier: qualifier ?? null,
    family_unit_id: null,
  }

  const rows = [
    {
      ...base,
      person_a_id,
      person_b_id,
      relation_type,
      is_symmetric: isSymmetric,
    },
  ]

  if (isSymmetric) {
    rows.push({
      ...base,
      person_a_id: person_b_id,
      person_b_id: person_a_id,
      relation_type,
      is_symmetric: true,
    })
  } else {
    const inverse = INVERSE_TYPE[relation_type]
    if (inverse) {
      rows.push({
        ...base,
        person_a_id: person_b_id,
        person_b_id: person_a_id,
        relation_type: inverse,
        is_symmetric: false,
      })
    }
  }

  const { error } = await supabase.from('people_relations').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

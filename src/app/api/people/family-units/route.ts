import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deriveFamilyUnitRelations } from '@/lib/agent/tools'

type Child = { person_id: string; link_type: string }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    parent_1_id: string | null
    parent_2_id: string | null
    union_type: string
    union_year?: number
    children: Child[]
  }

  const { parent_1_id, parent_2_id, union_type, union_year, children } = body

  // Validation: at least one parent or one child
  const parents = [parent_1_id, parent_2_id].filter(Boolean) as string[]
  if (parents.length === 0 && children.length === 0) {
    return NextResponse.json({ error: 'At least one parent or one child is required' }, { status: 400 })
  }

  // Insert family_unit
  const { data: unit, error: unitError } = await supabase
    .from('family_units')
    .insert({
      user_id: user.id,
      parent_1_id: parent_1_id ?? null,
      parent_2_id: parent_2_id ?? null,
      union_type: union_type as 'married' | 'civil_union' | 'cohabiting' | 'unknown',
      union_year: union_year ?? null,
    })
    .select('id')
    .single()

  if (unitError || !unit) {
    return NextResponse.json({ error: unitError?.message ?? 'Failed to create family unit' }, { status: 500 })
  }

  const unit_id = unit.id

  // Insert family_unit_children
  if (children.length > 0) {
    const { error: childrenError } = await supabase
      .from('family_unit_children')
      .insert(children.map(c => ({
        unit_id,
        child_id: c.person_id,
        link_type: c.link_type as 'biological' | 'adoptive',
      })))

    if (childrenError) {
      return NextResponse.json({ error: childrenError.message }, { status: 500 })
    }
  }

  // Auto-derive people_relations (parent ↔ enfant, fratrie, conjoints)
  const childIds = children.map(c => c.person_id)
  const relationRows = deriveFamilyUnitRelations(
    { user_id: user.id, confirmed: true, declared_in: 'manual' },
    unit_id, parents, childIds,
  )

  if (relationRows.length > 0) {
    const { error: relError } = await supabase
      .from('people_relations')
      .upsert(relationRows, { ignoreDuplicates: true })

    if (relError) {
      return NextResponse.json({ error: relError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, unit_id })
}

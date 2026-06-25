import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RelationType } from '@/types/domain'

// GET — récupérer les données fraîches d'une personne
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH — modifier le nom / la relation
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { name?: string; relation?: string; relationType?: string }

  const { error } = await supabase
    .from('people')
    .update({
      ...(body.name         ? { name:          body.name.trim()              } : {}),
      ...(body.relation     ? { relation:      body.relation.trim()          } : {}),
      ...(body.relationType ? { relation_type: body.relationType as RelationType } : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — supprimer la personne et ses relations
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const uid = user.id

  // Supprimer les relations inter-personnes liées
  await supabase.from('people_relations')
    .delete()
    .eq('user_id', uid)
    .or(`person_a_id.eq.${id},person_b_id.eq.${id}`)

  // Supprimer la personne
  const { error } = await supabase.from('people').delete().eq('id', id).eq('user_id', uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

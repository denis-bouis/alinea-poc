import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH — modifier les faits d'un lieu (édition manuelle depuis DetailPanel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { name?: string; region?: string | null; country?: string | null; aiSummary?: string | null }

  const { error } = await supabase
    .from('places')
    .update({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.region  !== undefined ? { region:  body.region?.trim()  || null } : {}),
      ...(body.country !== undefined ? { country: body.country?.trim() || null } : {}),
      ...(body.aiSummary !== undefined ? { ai_summary: body.aiSummary?.trim() || null } : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

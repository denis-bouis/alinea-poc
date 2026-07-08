import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH — modifier les faits d'un événement de frise (édition manuelle depuis DetailPanel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as {
    title?: string; year?: number | null; month?: number | null; day?: number | null; isPivot?: boolean
    yearEnd?: number | null; monthEnd?: number | null; dayEnd?: number | null
    aiSummary?: string | null
  }

  const { error } = await supabase
    .from('life_events')
    .update({
      ...(body.title ? { title: body.title.trim() } : {}),
      ...(body.year  !== undefined ? { year:  body.year  } : {}),
      ...(body.month !== undefined ? { event_month: body.month } : {}),
      ...(body.day   !== undefined ? { event_day:   body.day   } : {}),
      ...(body.yearEnd  !== undefined ? { year_end:  body.yearEnd  } : {}),
      ...(body.monthEnd !== undefined ? { event_month_end: body.monthEnd } : {}),
      ...(body.dayEnd   !== undefined ? { event_day_end:   body.dayEnd   } : {}),
      ...(body.isPivot !== undefined ? { is_pivot: body.isPivot } : {}),
      ...(body.aiSummary !== undefined ? { ai_summary: body.aiSummary?.trim() || null } : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

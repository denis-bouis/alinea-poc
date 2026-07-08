import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyWrite, sortPendingWrites, type PendingWrite, type PendingWriteResult } from '@/lib/agent/tools'

export type { PendingWrite, PendingWriteResult }

export async function POST(request: NextRequest) {
  const { writes } = await request.json() as { writes: PendingWrite[] }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const results: PendingWriteResult[] = []
  // Applique dans un ordre stable : entités de base d'abord, puis ce qui les
  // référence par nom (relations, cellules familiales, alinéas amorcés) —
  // pour que la résolution par nom trouve les entités créées dans le même lot.
  for (const write of sortPendingWrites(writes ?? [])) {
    results.push(await applyWrite(write, supabase, user.id))
  }

  const failed = results.filter(r => !r.saved)
  // Si au moins une entrée a échoué, on le signale (statut 207) pour ne pas
  // masquer un échec côté client — l'IHM doit pouvoir l'afficher.
  if (failed.length > 0) {
    return NextResponse.json(
      { results, ok: false, error: failed.map(f => `${f.label}: ${f.error ?? 'échec'}`).join(' · ') },
      { status: 207 },
    )
  }
  return NextResponse.json({ results, ok: true })
}

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { AlineaCard } from './AlineaCard'

export default async function TimelinePage() {
  const supabase = await createClient()
  const { data: alineas } = await supabase
    .from('alineas')
    .select('*')
    .order('event_year',  { ascending: false, nullsFirst: true })
    .order('event_month', { ascending: false, nullsFirst: true })
    .order('event_day',   { ascending: false, nullsFirst: true })
    .order('created_at',  { ascending: false })

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold text-ink mb-1">Ma frise</h1>
      <p className="text-muted text-sm mb-8">Tes souvenirs, au fil du temps.</p>

      {!alineas || alineas.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center">
          <p className="font-serif text-xl italic text-ink/70 mb-2">
            Ton histoire commence ici.
          </p>
          <p className="text-muted text-sm">
            Crée ton premier alinéa — un souvenir, une personne, un moment qui compte.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {alineas.map((a) => (
            <AlineaCard key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  )
}

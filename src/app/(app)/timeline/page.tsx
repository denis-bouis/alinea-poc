import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const MONTHS_FR = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.']

function formatEventDate(year: number | null, month: number | null, day: number | null): string | null {
  if (!year) return null
  if (!month) return String(year)
  const m = MONTHS_FR[month - 1]
  if (!day) return `${m} ${year}`
  return `${day} ${m} ${year}`
}

const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joie', pride: 'Fierté', nostalgia: 'Nostalgie',
  sadness: 'Tristesse', gratitude: 'Gratitude',
}

const CATEGORY_LABELS: Record<string, string> = {
  places: 'Lieu', people: 'Personne', moments: 'Moment',
  transitions: 'Transition', objects: 'Objet', values: 'Valeur',
}

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
            <li key={a.id} className="bg-surface border border-border rounded-2xl p-6 hover:border-accent/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {a.title && (
                    <h2 className="font-serif text-lg font-semibold text-ink mb-1.5 leading-snug">
                      {a.title}
                    </h2>
                  )}
                  {a.content && (
                    <p className="text-ink/75 text-sm leading-relaxed line-clamp-3">
                      {a.content}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-muted">
                    {formatEventDate(a.event_year, a.event_month, a.event_day)
                      ?? a.approximate_date
                      ?? new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <Link
                    href={`/alinea/${a.id}/edit`}
                    className="text-xs text-muted hover:text-accent transition-colors"
                  >
                    Modifier
                  </Link>
                </div>
              </div>

              {(a.emotion || a.category) && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  {a.emotion && (
                    <span className="text-xs bg-accent-lt text-accent border border-accent/20 rounded-full px-3 py-1">
                      {EMOTION_LABELS[a.emotion] ?? a.emotion}
                    </span>
                  )}
                  {a.category && (
                    <span className="text-xs bg-surface2 text-muted rounded-full px-3 py-1">
                      {CATEGORY_LABELS[a.category] ?? a.category}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

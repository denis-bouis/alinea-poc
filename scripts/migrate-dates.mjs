import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes. Lance avec : node --env-file=.env.local scripts/migrate-dates.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const MONTHS_FR = {
  janv: 1, janvier: 1,
  févr: 2, fevr: 2, fév: 2, fev: 2, février: 2, fevrier: 2,
  mars: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6,
  juill: 7, juillet: 7,
  août: 8, aout: 8, aoû: 8,
  sept: 9, septembre: 9, sep: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  déc: 12, dec: 12, décembre: 12, decembre: 12,
}

function parseApproximateDate(raw) {
  if (!raw) return { year: null, month: null, day: null }

  const s = raw.trim()

  // Format ISO : YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return {
    year:  parseInt(iso[1]),
    month: parseInt(iso[2]),
    day:   parseInt(iso[3]),
  }

  // Format DD/MM/YYYY ou DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return {
    day:   parseInt(dmy[1]),
    month: parseInt(dmy[2]),
    year:  parseInt(dmy[3]),
  }

  // Année 4 chiffres
  const yearMatch = s.match(/\b(1\d{3}|20\d{2})\b/)
  const year = yearMatch ? parseInt(yearMatch[1]) : null

  // Mois en français
  let month = null
  const lower = s.toLowerCase()
  for (const [key, val] of Object.entries(MONTHS_FR)) {
    if (lower.includes(key)) { month = val; break }
  }

  // Jour : 1-31 en début de chaîne suivi d'un espace + nom de mois
  let day = null
  const dayMatch = s.match(/^(\d{1,2})\s+[a-zA-ZÀ-ÿ]/)
  if (dayMatch) {
    const d = parseInt(dayMatch[1])
    if (d >= 1 && d <= 31) day = d
  }

  return { year, month, day }
}

async function main() {
  // 1. Lire tous les alinéas avec approximate_date non null et event_year null
  const { data: alineas, error } = await supabase
    .from('alineas')
    .select('id, approximate_date, event_year, event_month, event_day')
    .not('approximate_date', 'is', null)
    .is('event_year', null)

  if (error) { console.error('Lecture :', error.message); process.exit(1) }

  console.log(`${alineas.length} alinéa(s) à migrer\n`)

  let updated = 0
  let skipped = 0

  for (const a of alineas) {
    const { year, month, day } = parseApproximateDate(a.approximate_date)

    if (!year && !month && !day) {
      console.log(`  ⚠  [${a.id.slice(0,8)}] "${a.approximate_date}" → rien d'extractible`)
      skipped++
      continue
    }

    const { error: err } = await supabase
      .from('alineas')
      .update({ event_year: year, event_month: month, event_day: day })
      .eq('id', a.id)

    if (err) {
      console.error(`  ✗  [${a.id.slice(0,8)}] "${a.approximate_date}" → erreur : ${err.message}`)
    } else {
      const parts = [day, month, year].filter(Boolean)
      console.log(`  ✓  [${a.id.slice(0,8)}] "${a.approximate_date}" → ${year ?? '—'} / ${month ?? '—'} / ${day ?? '—'}`)
      updated++
    }
  }

  console.log(`\nRésultat : ${updated} migré(s), ${skipped} ignoré(s)`)
}

main()

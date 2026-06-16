const MONTHS_FR: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4,
  mai: 5, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
}

export function parseFrenchDate(text: string | null | undefined): {
  year: number | null
  month: number | null
  day: number | null
} {
  if (!text) return { year: null, month: null, day: null }
  const lower = text.toLowerCase()

  const yearMatch = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)
  const year = yearMatch ? parseInt(yearMatch[1]) : null

  let month: number | null = null
  let matchedMonthName: string | null = null
  for (const [name, num] of Object.entries(MONTHS_FR)) {
    if (lower.includes(name)) {
      month = num
      matchedMonthName = name
      break
    }
  }

  let day: number | null = null
  if (matchedMonthName) {
    const before = lower.substring(0, lower.indexOf(matchedMonthName))
    const dayMatch = before.match(/\b([1-9]|[12]\d|3[01])\s*$/)
    if (dayMatch) day = parseInt(dayMatch[1])
  }

  return { year, month, day }
}

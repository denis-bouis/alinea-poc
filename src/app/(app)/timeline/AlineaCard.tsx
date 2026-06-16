'use client'

import { useState } from 'react'
import Link from 'next/link'

const MONTHS_FR = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.']

export function formatEventDate(year: number | null, month: number | null, day: number | null): string | null {
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

type Alinea = {
  id: string
  title: string | null
  content: string | null
  emotion: string | null
  category: string | null
  approximate_date: string | null
  event_year: number | null
  event_month: number | null
  event_day: number | null
  created_at: string
  ai_memory: string | null
}

export function AlineaCard({ a }: { a: Alinea }) {
  const [preview, setPreview] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)

  const dateLabel = formatEventDate(a.event_year, a.event_month, a.event_day)
    ?? a.approximate_date
    ?? new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <li className="bg-surface border border-border rounded-2xl p-6 hover:border-accent/30 transition-colors">
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

          <div className="flex flex-col items-end gap-3 shrink-0">
            <span className="text-xs text-muted">{dateLabel}</span>
            <div className="flex items-center gap-2">
              {a.ai_memory && (
                <button
                  onClick={() => setMemoryOpen(true)}
                  title="Mémoire IA (debug)"
                  className="p-1.5 rounded-full text-muted hover:text-green hover:bg-green-bg transition-colors"
                >
                  <IconBrain />
                </button>
              )}
              <button
                onClick={() => setPreview(true)}
                title="Lire le récit complet"
                className="p-1.5 rounded-full text-muted hover:text-accent hover:bg-surface2 transition-colors"
              >
                <IconEye />
              </button>
              <Link
                href={`/alinea/${a.id}/edit`}
                title="Modifier"
                className="p-1.5 rounded-full text-muted hover:text-accent hover:bg-surface2 transition-colors"
              >
                <IconPen />
              </Link>
            </div>
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

      {/* Modal preview */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
          onClick={() => setPreview(false)}
        >
          <div
            className="relative bg-cream rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreview(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted hover:text-ink hover:bg-surface transition-colors"
              title="Fermer"
            >
              <IconClose />
            </button>
            {a.title && (
              <h2 className="font-serif text-2xl font-bold text-ink mb-2 leading-snug pr-8">
                {a.title}
              </h2>
            )}
            <p className="text-xs text-muted mb-6">{dateLabel}</p>
            <p className="font-serif text-base text-ink leading-relaxed italic whitespace-pre-wrap">
              {a.content}
            </p>
            {(a.emotion || a.category) && (
              <div className="mt-6 flex gap-2 flex-wrap">
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
          </div>
        </div>
      )}

      {/* Modal mémoire IA (debug) */}
      {memoryOpen && a.ai_memory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
          onClick={() => setMemoryOpen(false)}
        >
          <div
            className="relative bg-cream rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMemoryOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted hover:text-ink hover:bg-surface transition-colors"
              title="Fermer"
            >
              <IconClose />
            </button>
            <p className="text-xs font-semibold text-green uppercase tracking-widest mb-4">Mémoire IA — debug</p>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{a.ai_memory}</p>
          </div>
        </div>
      )}
    </>
  )
}

function IconPen() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function IconBrain() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
      <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
      <path d="M6 18a4 4 0 0 1-1.967-.516"/>
      <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  )
}

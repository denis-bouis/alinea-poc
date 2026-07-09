'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [notAllowed, setNotAllowed] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setNotAllowed(false)
    // Accès bêta limité : shouldCreateUser: false empêche la création d'un
    // compte pour une adresse non invitée — seule la table auth.users
    // (peuplée via Supabase Dashboard > Invite user) fait foi.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/callback`, shouldCreateUser: false },
    })
    if (error) setNotAllowed(true)
    else setSent(true)
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="font-serif text-4xl font-bold text-ink tracking-wide">
            Alin<span className="text-accent">é</span>a
          </h1>
          <p className="mt-2 text-muted text-sm">Tes souvenirs, à ta façon.</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-ink text-sm leading-relaxed">
                Un lien de connexion a été envoyé à{' '}
                <strong className="text-accent">{email}</strong>.
              </p>
              <p className="mt-2 text-muted text-sm">Vérifie ta boîte mail.</p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                  Adresse email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@exemple.fr"
                  className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-ink placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors text-sm"
                />
              </div>
              {notAllowed && (
                <p className="text-sm text-center" style={{ color: '#B0504A' }}>
                  Alinéa n&apos;est pour l&apos;instant accessible que sur invitation.
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent text-cream rounded-full px-4 py-3 text-sm font-semibold hover:bg-accent-dk disabled:opacity-50 transition-colors"
              >
                {loading ? 'Envoi…' : 'Recevoir mon lien de connexion'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

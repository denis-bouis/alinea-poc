export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 z-50 border-b border-border bg-cream/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/tableau" className="font-serif text-2xl font-bold text-ink tracking-wide">
            Alin<span className="text-accent">é</span>a
          </Link>
          <Link
            href="/tableau"
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            ← Retour au tableau
          </Link>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}

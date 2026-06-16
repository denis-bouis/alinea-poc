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
          <Link href="/timeline" className="font-serif text-2xl font-bold text-ink tracking-wide">
            Alin<span className="text-accent">é</span>a
          </Link>
          <Link
            href="/alinea/new"
            className="bg-accent text-cream text-sm font-semibold rounded-full px-5 py-2 hover:bg-accent-dk transition-colors"
          >
            + Nouvel alinéa
          </Link>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}

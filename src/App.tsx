import { isSupabaseConfigured } from './lib/supabaseClient'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface-card)]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              Construtivo Pedal
            </p>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">PDV — em construção</h1>
          </div>
          <StatusBadge configured={isSupabaseConfigured} />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-6 sm:p-10 shadow-sm">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Projeto novo, do zero</h2>
          <p className="mt-3 text-[var(--text-muted)] max-w-2xl leading-relaxed">
            Sistema de ponto de venda offline-first, com layout moderno e preparado para
            sincronização futura com Supabase. Projeto independente, sem vínculo com outros
            produtos da Construtivo.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 text-sm">
            <Feature title="Offline-first" description="Operação local com persistência no dispositivo." />
            <Feature
              title="Supabase (futuro)"
              description="Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local."
            />
            <Feature title="React + Vite" description="Base TypeScript para evolução modular do PDV." />
            <Feature title="Repositório" description="github.com/appconstrutivo/construtivoPedal" />
          </ul>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
        Construtivo Pedal © {new Date().getFullYear()}
      </footer>
    </div>
  )
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        configured
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      Supabase {configured ? 'configurado' : 'pendente'}
    </span>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1 text-[var(--text-muted)]">{description}</p>
    </li>
  )
}

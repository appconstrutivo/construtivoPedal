import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppShell, type NavKey } from './layout/AppShell'
import { DashboardHome } from './pages/DashboardHome'
import { ClientesPage } from './pages/ClientesPage'
import { EstoquePage } from './pages/EstoquePage'
import { AuthPages } from './pages/AuthPages'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'

function hasSessionChanged(previous: Session | null, next: Session | null): boolean {
  if (!previous && !next) return false
  if (!previous || !next) return true

  return previous.user.id !== next.user.id || previous.access_token !== next.access_token
}

function PlaceholderPage({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="cp-page cp-page--dash">
      <header className="cp-dash-head cp-dash-head--simple">
        <h1 className="cp-dash-head__title">{title}</h1>
        <p className="cp-dash-head__tag">{hint}</p>
      </header>
      <div className="cp-panel cp-panel--muted">
        <p className="cp-panel__hint">Módulo em desenvolvimento — em breve integrado ao Supabase.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('inicio')
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [tenantLoading, setTenantLoading] = useState(false)
  const [tenantError, setTenantError] = useState<string | null>(null)
  const [tenant, setTenant] = useState<{
    companyId: string
    companyName: string
    role: string
  } | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCheckingSession(false)
      return
    }

    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession((previous) => (hasSessionChanged(previous, data.session) ? data.session : previous))
          setCheckingSession(false)
        }
      })
      .catch(() => {
        if (mounted) setCheckingSession(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setSession((previous) => (hasSessionChanged(previous, authSession) ? authSession : previous))
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const sessionUserId = session?.user.id ?? null

  useEffect(() => {
    if (!sessionUserId) {
      setTenant(null)
      setTenantError(null)
      return
    }

    let mounted = true
    setTenantLoading(true)
    setTenantError(null)

    async function loadTenant(): Promise<
      { companyId: string; role: string; companyName: string } | null
    > {
      // TODO: substituir por seleção explícita de empresa no onboarding.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('company_memberships')
        .select('company_id, role, companies(name)')
        .eq('user_id', sessionUserId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(error.message ?? 'Erro ao carregar vínculo da empresa.')
      if (data) {
        return {
          companyId: data.company_id,
          role: data.role,
          companyName: data.companies?.name ?? 'Empresa',
        }
      }

      // Fallback para usuários antigos que possuem company_id em user_profiles
      // e ainda não foram migrados para company_memberships.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile, error: profileError } = await (supabase as any)
        .from('user_profiles')
        .select('company_id, role, companies(name)')
        .eq('id', sessionUserId)
        .maybeSingle()

      if (profileError) throw new Error(profileError.message ?? 'Erro ao carregar perfil da empresa.')
      if (profile?.company_id) {
        return {
          companyId: profile.company_id,
          role: profile.role ?? 'owner',
          companyName: profile.companies?.name ?? 'Empresa',
        }
      }

      return null
    }

    loadTenant()
      .then(async (loaded) => {
        if (!mounted) return

        if (loaded) {
          setTenant(loaded)
          return
        }

        // Auto-recuperação de onboarding para usuários sem tenant.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: repairError } = await (supabase as any).rpc('ensure_current_user_tenant')
        if (repairError) {
          throw new Error(
            repairError.message ?? 'Falha ao auto-reparar vínculo da empresa para o usuário.',
          )
        }

        const repaired = await loadTenant()
        if (!mounted) return
        setTenant(repaired)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setTenantError(err instanceof Error ? err.message : 'Erro ao carregar contexto da empresa.')
        setTenant(null)
      })
      .finally(() => {
        if (mounted) setTenantLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [sessionUserId])

  if (checkingSession) {
    return (
      <div className="cp-auth-loading" role="status" aria-live="polite">
        <span className="cp-auth-loading__spinner" aria-hidden />
        <span>Carregando sessão...</span>
      </div>
    )
  }

  if (!session) {
    return <AuthPages supabaseEnabled={isSupabaseConfigured} />
  }

  if (tenantLoading) {
    return (
      <div className="cp-auth-loading" role="status" aria-live="polite">
        <span className="cp-auth-loading__spinner" aria-hidden />
        <span>Carregando contexto da empresa...</span>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="cp-auth-loading cp-auth-loading--blocked" role="status" aria-live="polite">
        <div className="cp-auth-loading__panel">
          <span className="cp-auth-loading__spinner" aria-hidden />
          <span>
            {tenantError
              ? `Falha ao carregar empresa: ${tenantError}`
              : 'Usuário sem empresa vinculada. Rode os scripts 001/002/003/005 no Supabase e tente novamente.'}
          </span>
          <div className="cp-auth-loading__actions">
            <button type="button" className="cp-auth__link" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <button type="button" className="cp-auth__submit" onClick={handleSignOut}>
              Sair e voltar ao login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AppShell
      activeNav={activeNav}
      onNavigate={setActiveNav}
      companyName={tenant.companyName}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
    >
      {activeNav === 'inicio' && <DashboardHome activeNav={activeNav} />}
      {activeNav === 'clientes' && <ClientesPage companyId={tenant.companyId} />}
      {activeNav === 'oficina' && (
        <PlaceholderPage title="Oficina" hint="OS, checklist, fotos e baixa de peças." />
      )}
      {activeNav === 'pdv' && <PlaceholderPage title="PDV" hint="Balcão rápido com vínculo à bike." />}
      {activeNav === 'estoque' && <EstoquePage companyId={tenant.companyId} />}
      {activeNav === 'mais' && (
        <PlaceholderPage title="Mais" hint="Equipe, plano e preferências da empresa." />
      )}
    </AppShell>
  )
}

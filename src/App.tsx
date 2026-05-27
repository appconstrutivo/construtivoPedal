import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppShell, type NavKey } from './layout/AppShell'
import { NovaLojaModal } from './components/NovaLojaModal'
import { criarLoja, listarLojas, type StoreRow } from './services/lojas.service'
import { DashboardHome } from './pages/DashboardHome'
import { ClientesPage } from './pages/ClientesPage'
import { EstoquePage } from './pages/EstoquePage'
import { OficinaPage } from './pages/OficinaPage'
import { PdvPage } from './pages/PdvPage'
import { LancamentosPage } from './pages/LancamentosPage'
import { FinanceiroPage } from './pages/FinanceiroPage'
import { RelatoriosPage } from './pages/RelatoriosPage'
import { OrcamentosPage } from './pages/OrcamentosPage'
import { contarContasPagarVencendoHoje } from './services/financeiro.service'
import { contarOrcamentosAprovacaoNaoVista } from './services/orcamento.service'
import { OrcamentoAprovacaoPage } from './pages/OrcamentoAprovacaoPage'
import { MaisPage } from './pages/MaisPage'
import { AuthPages } from './pages/AuthPages'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'

function hasSessionChanged(previous: Session | null, next: Session | null): boolean {
  if (!previous && !next) return false
  if (!previous || !next) return true

  return previous.user.id !== next.user.id || previous.access_token !== next.access_token
}

const ACTIVE_STORE_STORAGE_KEY = 'cp_pedal_active_store_v1'

function activeStoreStorageKey(companyId: string) {
  return `${ACTIVE_STORE_STORAGE_KEY}:${companyId}`
}

function tokenOrcamentoPublico() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('orcamento')
}

export default function App() {
  const [publicOrcamentoToken] = useState(() => tokenOrcamentoPublico())
  const [activeNav, setActiveNav] = useState<NavKey>('inicio')
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [tenantLoading, setTenantLoading] = useState(false)
  const [tenantError, setTenantError] = useState<string | null>(null)
  const [tenant, setTenant] = useState<{
    companyId: string
    companyName: string
    companyPlan: string
    role: string
  } | null>(null)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [activeStoreId, setActiveStoreId] = useState('')
  const [storesLoading, setStoresLoading] = useState(false)
  const [modalNovaLojaOpen, setModalNovaLojaOpen] = useState(false)
  const [orcAprovacoesPendentes, setOrcAprovacoesPendentes] = useState(0)
  const [contasPagarVencemHoje, setContasPagarVencemHoje] = useState(0)

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
      { companyId: string; role: string; companyName: string; companyPlan: string } | null
    > {
      // TODO: substituir por seleção explícita de empresa no onboarding.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('company_memberships')
        .select('company_id, role, companies(name, plan)')
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
          companyPlan: data.companies?.plan ?? 'starter',
        }
      }

      // Fallback para usuários antigos que possuem company_id em user_profiles
      // e ainda não foram migrados para company_memberships.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile, error: profileError } = await (supabase as any)
        .from('user_profiles')
        .select('company_id, role, companies(name, plan)')
        .eq('id', sessionUserId)
        .maybeSingle()

      if (profileError) throw new Error(profileError.message ?? 'Erro ao carregar perfil da empresa.')
      if (profile?.company_id) {
        return {
          companyId: profile.company_id,
          role: profile.role ?? 'owner',
          companyName: profile.companies?.name ?? 'Empresa',
          companyPlan: profile.companies?.plan ?? 'starter',
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

  const carregarLojas = useCallback(
    async (opts?: { selectStoreId?: string }) => {
      if (!tenant?.companyId) return
      setStoresLoading(true)
      try {
        const list = await listarLojas(tenant.companyId)
        setStores(list)
        const key = activeStoreStorageKey(tenant.companyId)
        let next = ''
        if (opts?.selectStoreId && list.some((s) => s.id === opts.selectStoreId)) {
          next = opts.selectStoreId
        } else if (list.length > 0) {
          const raw = localStorage.getItem(key)
          if (raw && list.some((s) => s.id === raw)) {
            next = raw
          } else {
            const matriz = list.find((s) => s.name.trim().toLowerCase() === 'matriz')
            next = matriz?.id ?? list[0].id
          }
        }
        setActiveStoreId(next)
        if (next) localStorage.setItem(key, next)
      } catch {
        setStores([])
      } finally {
        setStoresLoading(false)
      }
    },
    [tenant?.companyId],
  )

  useEffect(() => {
    if (!tenant?.companyId) {
      setStores([])
      setActiveStoreId('')
      return
    }
    void carregarLojas()
  }, [tenant?.companyId, carregarLojas])

  async function handleCriarLoja(payload: { name: string; address: string }) {
    if (!tenant?.companyId) throw new Error('Empresa não carregada.')
    const row = await criarLoja({
      company_id: tenant.companyId,
      name: payload.name,
      address: payload.address || null,
      active: true,
    })
    await carregarLojas({ selectStoreId: row.id })
  }

  function handleActiveStoreChange(storeId: string) {
    if (!storeId) return
    setActiveStoreId(storeId)
    if (tenant?.companyId) {
      localStorage.setItem(activeStoreStorageKey(tenant.companyId), storeId)
    }
  }

  const recarregarAprovacoesPendentes = useCallback(async () => {
    if (!tenant?.companyId || !activeStoreId) {
      setOrcAprovacoesPendentes(0)
      return
    }
    try {
      const total = await contarOrcamentosAprovacaoNaoVista(tenant.companyId, activeStoreId)
      setOrcAprovacoesPendentes(total)
    } catch {
      /* mantém último valor */
    }
  }, [tenant?.companyId, activeStoreId])

  const recarregarContasPagarVencendoHoje = useCallback(async () => {
    if (!tenant?.companyId || !activeStoreId) {
      setContasPagarVencemHoje(0)
      return
    }
    try {
      const total = await contarContasPagarVencendoHoje(tenant.companyId, activeStoreId)
      setContasPagarVencemHoje(total)
    } catch {
      /* mantém último valor */
    }
  }, [tenant?.companyId, activeStoreId])

  useEffect(() => {
    void recarregarAprovacoesPendentes()
    void recarregarContasPagarVencendoHoje()
  }, [recarregarAprovacoesPendentes, recarregarContasPagarVencendoHoje])

  useEffect(() => {
    const atualizar = () => {
      void recarregarAprovacoesPendentes()
      void recarregarContasPagarVencendoHoje()
    }
    const intervalo = window.setInterval(atualizar, 45_000)
    window.addEventListener('focus', atualizar)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', atualizar)
    }
  }, [recarregarAprovacoesPendentes, recarregarContasPagarVencendoHoje])

  if (publicOrcamentoToken) {
    return <OrcamentoAprovacaoPage token={publicOrcamentoToken} />
  }

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
      navBadges={{
        ...(orcAprovacoesPendentes > 0 ? { orcamentos: orcAprovacoesPendentes } : {}),
        ...(contasPagarVencemHoje > 0 ? { financeiro: contasPagarVencemHoje } : {}),
      }}
      companyName={tenant.companyName}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      activeStoreId={activeStoreId}
      onActiveStoreChange={handleActiveStoreChange}
      storesLoading={storesLoading}
      onNovaLojaClick={() => setModalNovaLojaOpen(true)}
    >
      <NovaLojaModal
        open={modalNovaLojaOpen}
        onClose={() => setModalNovaLojaOpen(false)}
        onSubmit={handleCriarLoja}
      />
      {activeNav === 'inicio' && (
        <DashboardHome
          activeNav={activeNav}
          companyId={tenant.companyId}
          activeStoreId={activeStoreId}
          onNavigate={setActiveNav}
        />
      )}
      {activeNav === 'clientes' && (
        <ClientesPage companyId={tenant.companyId} activeStoreId={activeStoreId} />
      )}
      {activeNav === 'oficina' && (
        <OficinaPage companyId={tenant.companyId} activeStoreId={activeStoreId} />
      )}
      {activeNav === 'pdv' && (
        <PdvPage companyId={tenant.companyId} activeStoreId={activeStoreId} />
      )}
      {activeNav === 'orcamentos' && (
        <OrcamentosPage
          companyId={tenant.companyId}
          activeStoreId={activeStoreId}
          companyName={tenant.companyName}
          onNavigatePdv={() => setActiveNav('pdv')}
          onNavigateOficina={() => setActiveNav('oficina')}
          onAprovacoesPendentesChange={() => void recarregarAprovacoesPendentes()}
        />
      )}
      {activeNav === 'financeiro' && (
        <FinanceiroPage
          companyId={tenant.companyId}
          activeStoreId={activeStoreId}
          storeName={stores.find((s) => s.id === activeStoreId)?.name}
          onContasPagarChange={() => void recarregarContasPagarVencendoHoje()}
        />
      )}
      {activeNav === 'lancamentos' && (
        <LancamentosPage
          companyId={tenant.companyId}
          companyName={tenant.companyName}
          activeStoreId={activeStoreId}
        />
      )}
      {activeNav === 'estoque' && (
        <EstoquePage companyId={tenant.companyId} activeStoreId={activeStoreId} />
      )}
      {activeNav === 'relatorios' && (
        <RelatoriosPage
          companyId={tenant.companyId}
          activeStoreId={activeStoreId}
          storeName={stores.find((s) => s.id === activeStoreId)?.name}
        />
      )}
      {activeNav === 'mais' && (
        <MaisPage
          companyId={tenant.companyId}
          companyName={tenant.companyName}
          plan={tenant.companyPlan}
          role={tenant.role}
          onCompanyUpdated={(name) =>
            setTenant((prev) => (prev ? { ...prev, companyName: name } : prev))
          }
        />
      )}
    </AppShell>
  )
}

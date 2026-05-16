import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

export type NavKey =
  | 'inicio'
  | 'oficina'
  | 'pdv'
  | 'estoque'
  | 'clientes'
  | 'mais'

type NavItem = {
  key: NavKey
  label: string
  icon: ReactNode
}

function IconHome() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconWrench() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="m14.7 6.3 3 3a2 2 0 0 1-2.3 3.2l-.5-.5L10 17.6a2 2 0 1 1-2.8-2.8l5.1-5.1-.5-.5a2 2 0 0 1 3.2-2.3Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCart() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={9} cy={20} r={1.25} fill="currentColor" />
      <circle cx={18} cy={20} r={1.25} fill="currentColor" />
    </svg>
  )
}

function IconPackage() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="m12 21-8-4V7l8-4 8 4v10l-8 4Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="m12 21 8-4M12 21V13M12 13 4 9m8 4 8-4M4 9v8"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <circle cx={9} cy={8} r={3.25} stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M4 19v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <path
        d="M16 11h2a3 3 0 0 1 3 3v2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <circle cx={17} cy={7} r={2.25} stroke="currentColor" strokeWidth={1.75} />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <rect x={4} y={4} width={6} height={6} rx={1.25} stroke="currentColor" strokeWidth={1.75} />
      <rect x={14} y={4} width={6} height={6} rx={1.25} stroke="currentColor" strokeWidth={1.75} />
      <rect x={4} y={14} width={6} height={6} rx={1.25} stroke="currentColor" strokeWidth={1.75} />
      <rect x={14} y={14} width={6} height={6} rx={1.25} stroke="currentColor" strokeWidth={1.75} />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { key: 'inicio', label: 'Início', icon: <IconHome /> },
  { key: 'oficina', label: 'Oficina', icon: <IconWrench /> },
  { key: 'pdv', label: 'PDV', icon: <IconCart /> },
  { key: 'estoque', label: 'Estoque', icon: <IconPackage /> },
  { key: 'clientes', label: 'Clientes', icon: <IconUsers /> },
  { key: 'mais', label: 'Mais', icon: <IconGrid /> },
]

type AppShellProps = {
  children: ReactNode
  activeNav?: NavKey
  onNavigate?: (key: NavKey) => void
  companyName?: string
  userEmail?: string
  onSignOut?: () => Promise<void> | void
}

export function AppShell({
  children,
  activeNav: activeNavControlled,
  onNavigate,
  companyName = 'Sua bicicletaria',
  userEmail,
  onSignOut,
}: AppShellProps) {
  const [activeNavInternal, setActiveNavInternal] = useState<NavKey>('inicio')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const activeNav = activeNavControlled ?? activeNavInternal

  const setNav = useCallback(
    (key: NavKey) => {
      if (!activeNavControlled) setActiveNavInternal(key)
      onNavigate?.(key)
    },
    [activeNavControlled, onNavigate],
  )

  useEffect(() => {
    if (!accountMenuOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (accountMenuRef.current?.contains(target)) return
      setAccountMenuOpen(false)
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [accountMenuOpen])

  async function handleSignOutClick() {
    if (!onSignOut || signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
      setAccountMenuOpen(false)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="cp-shell">
      <a className="cp-skip" href="#cp-main">
        Pular para o conteúdo
      </a>

      <header className="cp-header">
        <div className="cp-header__brand">
          <span className="cp-logo" aria-hidden>
            ◆
          </span>
          <div className="cp-header__titles">
            <span className="cp-header__product">Construtivo Pedal</span>
            <span className="cp-header__company">{companyName}</span>
          </div>
        </div>

        <div className="cp-header__actions">
          <div className="cp-search" role="search">
            <label htmlFor="cp-global-search" className="cp-sr-only">
              Busca global
            </label>
            <input
              id="cp-global-search"
              type="search"
              className="cp-search__input"
              placeholder="Cliente, bike, OS, produto…"
              autoComplete="off"
            />
          </div>
          <button type="button" className="cp-btn cp-btn--ghost cp-header__notify" aria-label="Notificações">
            <span className="cp-header__notify-dot" aria-hidden />
          </button>
          <div className="cp-header__account" ref={accountMenuRef}>
            <button
              type="button"
              className="cp-btn cp-btn--outline cp-header__user"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              Conta
            </button>

            {accountMenuOpen && (
              <div className="cp-account-menu" role="menu" aria-label="Menu da conta">
                <div className="cp-account-menu__meta">
                  <span className="cp-account-menu__label">Sessão ativa</span>
                  <span className="cp-account-menu__email">{userEmail ?? 'Usuário autenticado'}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="cp-account-menu__action"
                  onClick={handleSignOutClick}
                  disabled={!onSignOut || signingOut}
                >
                  {signingOut ? 'Saindo...' : 'Sair'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="cp-body">
        <aside className="cp-sidebar" aria-label="Navegação principal">
          <nav className="cp-sidebar__nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  item.key === activeNav ? 'cp-navlink cp-navlink--active' : 'cp-navlink'
                }
                onClick={() => setNav(item.key)}
                aria-current={item.key === activeNav ? 'page' : undefined}
              >
                <span className="cp-navlink__icon">{item.icon}</span>
                <span className="cp-navlink__label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main id="cp-main" className="cp-main">
          {children}
        </main>
      </div>

      <nav className="cp-bottomnav" aria-label="Navegação rápida">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              item.key === activeNav ? 'cp-bottomnav__btn cp-bottomnav__btn--active' : 'cp-bottomnav__btn'
            }
            onClick={() => setNav(item.key)}
            aria-current={item.key === activeNav ? 'page' : undefined}
          >
            <span className="cp-bottomnav__icon">{item.icon}</span>
            <span className="cp-bottomnav__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

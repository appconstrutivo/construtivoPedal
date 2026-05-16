import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type AuthMode = 'login' | 'signup' | 'recovery'

type AuthPagesProps = {
  supabaseEnabled: boolean
}

type FormState = {
  nome: string
  companyName: string
  email: string
  password: string
}

const INITIAL_STATE: FormState = {
  nome: '',
  companyName: '',
  email: '',
  password: '',
}

export function AuthPages({ supabaseEnabled }: AuthPagesProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const pageTitle = useMemo(() => {
    if (mode === 'signup') return 'Crie sua conta'
    if (mode === 'recovery') return 'Recupere sua senha'
    return 'Acesse sua conta'
  }, [mode])

  const pageHint = useMemo(() => {
    if (mode === 'signup') return 'Comece agora e conecte sua equipe em minutos.'
    if (mode === 'recovery') return 'Enviaremos um link seguro para redefinição.'
    return 'Entre para continuar a operação da sua bicicletaria.'
  }, [mode])

  function resetFeedback() {
    setError(null)
    setSuccess(null)
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    resetFeedback()
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    resetFeedback()
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      })
      if (signInError) throw signInError
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível autenticar.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    resetFeedback()
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            nome: form.nome.trim(),
            full_name: form.nome.trim(),
            company_name: form.companyName.trim(),
          },
        },
      })
      if (signUpError) throw signUpError

      setSuccess('Cadastro realizado. Verifique seu e-mail para confirmar o acesso.')
      setMode('login')
      setForm((prev) => ({ ...prev, password: '' }))
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Não foi possível criar sua conta.'
      const normalized = rawMessage.toLowerCase()
      const message = normalized.includes('database error saving new user')
        ? 'Falha no onboarding do Supabase ao salvar novo usuário. Execute os scripts 001, 002, 003 e 004 no SQL Editor e tente novamente.'
        : normalized.includes('email rate limit exceeded')
          ? 'Limite de envio de e-mail do Supabase atingido para este endereço. Aguarde alguns minutos ou aumente o limite em Authentication > Rate Limits.'
          : rawMessage
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault()
    resetFeedback()
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/`
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
        redirectTo,
      })
      if (recoveryError) throw recoveryError

      setSuccess('Enviamos um link de recuperação para o seu e-mail.')
      setForm((prev) => ({ ...prev, password: '' }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao solicitar recuperação.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cp-auth">
      <aside className="cp-auth__brand">
        <div className="cp-auth__brand-badge">Construtivo Pedal</div>
        <h1 className="cp-auth__brand-title">ERP inteligente para oficina, PDV e relacionamento.</h1>
        <p className="cp-auth__brand-copy">
          Fluxo rápido para balcão e oficina, com visão moderna para equipe, gestão e fidelização.
        </p>
        <ul className="cp-auth__highlights">
          <li>Atendimento mais rápido no dia a dia da loja.</li>
          <li>Cadastro centralizado de cliente e bicicleta.</li>
          <li>Base preparada para autenticação e SaaS multiempresa.</li>
        </ul>
      </aside>

      <main className="cp-auth__card-wrap">
        <section className="cp-auth__card" aria-labelledby="auth-title">
          <header className="cp-auth__header">
            <p className="cp-auth__eyebrow">Acesso seguro</p>
            <h2 id="auth-title" className="cp-auth__title">
              {pageTitle}
            </h2>
            <p className="cp-auth__hint">{pageHint}</p>
          </header>

          {!supabaseEnabled && (
            <p className="cp-auth__alert cp-auth__alert--warning" role="alert">
              Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para habilitar autenticação.
            </p>
          )}
          {error && (
            <p className="cp-auth__alert cp-auth__alert--error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="cp-auth__alert cp-auth__alert--success" role="status">
              {success}
            </p>
          )}

          {mode === 'login' && (
            <form className="cp-auth__form" onSubmit={handleLogin} noValidate>
              <label className="cp-auth__field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="cp-auth__field">
                <span>Senha</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button className="cp-auth__submit" type="submit" disabled={loading || !supabaseEnabled}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <button type="button" className="cp-auth__link" onClick={() => switchMode('recovery')}>
                Esqueci minha senha
              </button>
              <p className="cp-auth__switch">
                Novo por aqui?{' '}
                <button type="button" className="cp-auth__link" onClick={() => switchMode('signup')}>
                  Criar conta
                </button>
              </p>
            </form>
          )}

          {mode === 'signup' && (
            <form className="cp-auth__form" onSubmit={handleSignup} noValidate>
              <label className="cp-auth__field">
                <span>Nome</span>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => updateField('nome', e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                  required
                />
              </label>

              <label className="cp-auth__field">
                <span>Nome da empresa</span>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  placeholder="Ex.: Bike Center Centro"
                  autoComplete="organization"
                  required
                />
              </label>

              <label className="cp-auth__field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="cp-auth__field">
                <span>Senha</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <button className="cp-auth__submit" type="submit" disabled={loading || !supabaseEnabled}>
                {loading ? 'Criando conta...' : 'Criar conta'}
              </button>

              <p className="cp-auth__switch">
                Já possui conta?{' '}
                <button type="button" className="cp-auth__link" onClick={() => switchMode('login')}>
                  Fazer login
                </button>
              </p>
            </form>
          )}

          {mode === 'recovery' && (
            <form className="cp-auth__form" onSubmit={handleRecovery} noValidate>
              <label className="cp-auth__field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  required
                />
              </label>

              <button className="cp-auth__submit" type="submit" disabled={loading || !supabaseEnabled}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

              <p className="cp-auth__switch">
                Lembrou a senha?{' '}
                <button type="button" className="cp-auth__link" onClick={() => switchMode('login')}>
                  Voltar ao login
                </button>
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

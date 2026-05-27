import { useCallback, useEffect, useState } from 'react'
import {
  atualizarEmpresa,
  formatarCnpj,
  obterEmpresa,
  type EmpresaRow,
} from '../services/empresa.service'

type MaisPageProps = {
  companyId: string
  companyName: string
  plan: string
  role: string
  onCompanyUpdated?: (name: string) => void
}

function labelPlano(plan: string) {
  const map: Record<string, string> = {
    starter: 'Starter',
    trial: 'Trial',
    pro: 'Pro',
    enterprise: 'Enterprise',
  }
  return map[plan] ?? plan
}

function labelPapel(role: string) {
  const map: Record<string, string> = {
    owner: 'Proprietário',
    manager: 'Gerente',
    seller: 'Vendedor',
    mechanic: 'Mecânico',
  }
  return map[role] ?? role
}

export function MaisPage({ companyId, companyName, plan, role, onCompanyUpdated }: MaisPageProps) {
  const [empresa, setEmpresa] = useState<EmpresaRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const [nome, setNome] = useState(companyName)
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  const preencherForm = useCallback((row: EmpresaRow) => {
    setNome(row.name)
    setRazaoSocial(row.legal_name ?? '')
    setCnpj(row.cnpj ? formatarCnpj(row.cnpj) : '')
    setEmail(row.email ?? '')
    setTelefone(row.phone ?? '')
    setEndereco(row.address ?? '')
    setLogoUrl(row.logo_url ?? '')
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const row = await obterEmpresa(companyId)
      setEmpresa(row)
      preencherForm(row)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar empresa.')
      setEmpresa(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, preencherForm])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      const atualizada = await atualizarEmpresa(companyId, {
        name: nome,
        legal_name: razaoSocial || null,
        cnpj: cnpj || null,
        email: email || null,
        phone: telefone || null,
        address: endereco || null,
        logo_url: logoUrl || null,
      })
      setEmpresa(atualizada)
      preencherForm(atualizada)
      onCompanyUpdated?.(atualizada.name)
      setSucesso('Dados da empresa salvos.')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cp-page mais-page">
      <header className="cp-dash-head cp-dash-head--simple">
        <h1 className="cp-dash-head__title">Mais</h1>
        <p className="cp-dash-head__tag">Dados da empresa, plano e preferências.</p>
      </header>

      <div className="mais-grid">
        <section className="cp-panel mais-panel" aria-labelledby="mais-empresa-title">
          <h2 id="mais-empresa-title" className="mais-panel__title">
            Dados da empresa
          </h2>
          <p className="cp-panel__hint">
            Usados em orçamentos, comunicações e documentos. O identificador interno (
            <code className="mais-code">{empresa?.slug ?? '…'}</code>) não é alterável.
          </p>

          {loading ? (
            <p className="cp-panel__hint" role="status">
              Carregando…
            </p>
          ) : (
            <form className="st-form mais-form" onSubmit={handleSubmit} noValidate>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Nome fantasia *</span>
                  <input
                    className="st-input"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Bike Center"
                    required
                    autoComplete="organization"
                  />
                </label>
                <label className="st-field">
                  <span>Razão social</span>
                  <input
                    className="st-input"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Razão social no CNPJ"
                  />
                </label>
                <label className="st-field">
                  <span>CNPJ</span>
                  <input
                    className="st-input"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </label>
                <label className="st-field">
                  <span>E-mail comercial</span>
                  <input
                    className="st-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@suaempresa.com.br"
                    autoComplete="email"
                  />
                </label>
                <label className="st-field">
                  <span>Telefone</span>
                  <input
                    className="st-input"
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                  />
                </label>
                <label className="st-field st-field--full">
                  <span>Endereço (sede / matriz)</span>
                  <input
                    className="st-input"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, número, bairro, cidade"
                    autoComplete="street-address"
                  />
                </label>
                <label className="st-field st-field--full">
                  <span>URL do logo</span>
                  <input
                    className="st-input"
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://… (upload em breve)"
                  />
                  <span className="st-field__hint">
                    Link público da imagem. Upload direto no sistema será adicionado depois.
                  </span>
                </label>
              </div>

              {erro && <p className="st-form-error">{erro}</p>}
              {sucesso && <p className="mais-success" role="status">{sucesso}</p>}

              <div className="st-form-actions">
                <button type="button" className="cp-btn cp-btn--ghost" onClick={() => void carregar()} disabled={salvando}>
                  Descartar alterações
                </button>
                <button type="submit" className="cp-btn cp-btn--primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar empresa'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="mais-aside">
          <section className="cp-panel mais-panel" aria-labelledby="mais-conta-title">
            <h2 id="mais-conta-title" className="mais-panel__title">
              Sua conta
            </h2>
            <dl className="mais-meta">
              <div>
                <dt>Plano</dt>
                <dd>
                  <span className="mais-badge">{labelPlano(plan)}</span>
                </dd>
              </div>
              <div>
                <dt>Seu papel</dt>
                <dd>{labelPapel(role)}</dd>
              </div>
            </dl>
          </section>

          <section className="cp-panel cp-panel--muted mais-panel" aria-labelledby="mais-breve-title">
            <h2 id="mais-breve-title" className="mais-panel__title">
              Em breve
            </h2>
            <ul className="mais-list">
              <li>Gestão de equipe e convites</li>
              <li>Upload de logo e cores da marca</li>
              <li>Dados fiscais (NF-e, regime tributário)</li>
              <li>Mensagens automáticas da oficina</li>
            </ul>
            <p className="cp-panel__hint">
              Para cadastrar filiais, use o seletor <strong>Loja</strong> no topo da tela.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

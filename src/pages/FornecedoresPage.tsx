import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  atualizarFornecedor,
  criarFornecedor,
  excluirFornecedor,
  listarFornecedores,
  type FornecedorRow,
} from '../services/estoque.service'

type FornecedoresPageProps = {
  companyId: string
  activeStoreId: string
  storeName?: string
}

function emptyForm() {
  return {
    nome: '',
    contato: '',
    telefone: '',
    email: '',
    prazoMedioDias: '0',
  }
}

export function FornecedoresPage({ companyId, activeStoreId, storeName }: FornecedoresPageProps) {
  const semLoja = !activeStoreId
  const [lista, setLista] = useState<FornecedorRow[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!activeStoreId) {
      setLista([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const rows = await listarFornecedores(companyId, activeStoreId)
      setLista(rows)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar fornecedores.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((f) => {
      const blob = [f.nome, f.contato, f.telefone, f.email].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [lista, busca])

  function abrirNovo() {
    setEditandoId(null)
    setForm(emptyForm())
    setErro(null)
    setModalOpen(true)
  }

  function abrirEditar(fornecedor: FornecedorRow) {
    setEditandoId(fornecedor.id)
    setForm({
      nome: fornecedor.nome,
      contato: fornecedor.contato ?? '',
      telefone: fornecedor.telefone ?? '',
      email: fornecedor.email ?? '',
      prazoMedioDias: String(fornecedor.prazo_medio_dias),
    })
    setErro(null)
    setModalOpen(true)
  }

  function fecharModal() {
    if (salvando) return
    setModalOpen(false)
    setEditandoId(null)
    setForm(emptyForm())
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!activeStoreId) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    const nome = form.nome.trim()
    if (!nome) {
      setErro('Nome do fornecedor é obrigatório.')
      return
    }
    const prazo = Number(form.prazoMedioDias)
    if (!Number.isFinite(prazo) || prazo < 0) {
      setErro('Prazo médio inválido.')
      return
    }

    const payload = {
      nome,
      contato: form.contato.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      prazo_medio_dias: Math.round(prazo),
    }

    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      if (editandoId) {
        await atualizarFornecedor(editandoId, payload)
        setSucesso('Fornecedor atualizado.')
      } else {
        await criarFornecedor({
          company_id: companyId,
          store_id: activeStoreId,
          ...payload,
        })
        setSucesso('Fornecedor cadastrado.')
      }
      fecharModal()
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(fornecedor: FornecedorRow) {
    if (
      !window.confirm(
        `Excluir o fornecedor "${fornecedor.nome}"?\n\nItens de estoque e despesas vinculadas ficarão sem fornecedor.`,
      )
    ) {
      return
    }
    setExcluindoId(fornecedor.id)
    setErro(null)
    setSucesso(null)
    try {
      await excluirFornecedor(fornecedor.id)
      setSucesso('Fornecedor removido.')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir fornecedor.')
    } finally {
      setExcluindoId(null)
    }
  }

  return (
    <div className="cp-page forn-page">
      <header className="cp-dash-head cp-dash-head--simple">
        <div>
          <h1 className="cp-dash-head__title">Fornecedores</h1>
          <p className="cp-dash-head__tag">
            {storeName ? `${storeName} · ` : ''}
            Cadastro único para compras, estoque e contas a pagar.
          </p>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--primary"
          onClick={abrirNovo}
          disabled={semLoja}
          title={semLoja ? 'Selecione uma loja no topo' : undefined}
        >
          Novo fornecedor
        </button>
      </header>

      {semLoja ? (
        <section className="lc-panel">
          <p className="lc-empty">Selecione uma loja no topo da tela para gerenciar fornecedores.</p>
        </section>
      ) : (
        <>
          {erro ? (
            <div className="lc-alert lc-alert--error" role="alert">
              {erro}
            </div>
          ) : null}
          {sucesso ? (
            <div className="lc-alert lc-alert--ok" role="status">
              {sucesso}
            </div>
          ) : null}

          <div className="forn-toolbar">
            <label className="forn-search">
              <span className="cp-sr-only">Buscar fornecedor</span>
              <input
                type="search"
                className="lc-search"
                placeholder="Buscar por nome, contato ou e-mail…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoComplete="off"
              />
            </label>
            <p className="forn-toolbar__meta" aria-live="polite">
              {listaFiltrada.length === 1 ? '1 fornecedor' : `${listaFiltrada.length} fornecedores`}
            </p>
          </div>

          <section className="lc-panel" aria-label="Lista de fornecedores">
            {loading ? (
              <p className="lc-empty">Carregando…</p>
            ) : listaFiltrada.length === 0 ? (
              <p className="lc-empty">
                {busca.trim()
                  ? 'Nenhum fornecedor encontrado para esta busca.'
                  : 'Nenhum fornecedor cadastrado. Use o botão acima para começar.'}
              </p>
            ) : (
              <ul className="lc-list">
                {listaFiltrada.map((f) => {
                  const busy = excluindoId === f.id
                  return (
                    <li key={f.id} className="lc-row forn-row">
                      <div className="lc-row__main forn-row__main">
                        <span className="lc-row__num forn-row__nome">{f.nome}</span>
                        <span className="lc-row__meta">
                          {f.contato?.trim() || 'Sem contato'}
                          {f.telefone ? ` · ${f.telefone}` : ''}
                          {f.email ? ` · ${f.email}` : ''}
                          {' · Prazo '}
                          {f.prazo_medio_dias}d
                        </span>
                      </div>
                      <div className="lc-row__actions">
                        <button
                          type="button"
                          className="lc-btn lc-btn--ghost"
                          disabled={busy}
                          onClick={() => abrirEditar(f)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="lc-btn lc-btn--danger"
                          disabled={busy}
                          onClick={() => void handleExcluir(f)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {modalOpen ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={fecharModal}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="forn-modal-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSalvar(e)}
          >
            <h2 id="forn-modal-title" className="fin-modal__title">
              {editandoId ? 'Editar fornecedor' : 'Novo fornecedor'}
            </h2>
            <p className="fin-modal__hint">
              Usado em contas a pagar, compras de peças e importação de planilha do estoque.
            </p>
            <label className="fin-field">
              <span>Nome *</span>
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                required
                autoFocus
              />
            </label>
            <label className="fin-field">
              <span>Contato</span>
              <input
                value={form.contato}
                onChange={(e) => setForm((p) => ({ ...p, contato: e.target.value }))}
              />
            </label>
            <div className="fin-field-row">
              <label className="fin-field">
                <span>Telefone</span>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                />
              </label>
              <label className="fin-field">
                <span>Prazo médio (dias)</span>
                <input
                  type="number"
                  min={0}
                  value={form.prazoMedioDias}
                  onChange={(e) => setForm((p) => ({ ...p, prazoMedioDias: e.target.value }))}
                />
              </label>
            </div>
            <label className="fin-field">
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={fecharModal}>
                Voltar
              </button>
              <button type="submit" className="cp-btn cp-btn--primary" disabled={salvando}>
                {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

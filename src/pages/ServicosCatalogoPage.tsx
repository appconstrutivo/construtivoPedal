import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  atualizarCatalogoServico,
  criarCatalogoServico,
  excluirCatalogoServico,
  listarCatalogoServicos,
  type CatalogoServicoRow,
} from '../services/catalogo-servicos.service'

type FiltroLista = 'todos' | 'ativos' | 'inativos'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function parseMoneyInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

type ServicosCatalogoPageProps = {
  companyId: string
  activeStoreId: string
  /** Chamado após criar/editar/excluir para atualizar selects na aba de OS. */
  onCatalogChanged?: () => void
}

export function ServicosCatalogoPage({
  companyId,
  activeStoreId,
  onCatalogChanged,
}: ServicosCatalogoPageProps) {
  const [lista, setLista] = useState<CatalogoServicoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroLista>('ativos')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [precoStr, setPrecoStr] = useState('')
  const [ordemStr, setOrdemStr] = useState('0')
  const [ativo, setAtivo] = useState(true)

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setLista([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const rows = await listarCatalogoServicos(companyId, { storeId: activeStoreId })
      setLista(rows)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const filtrada = useMemo(() => {
    let rows = lista
    if (filtro === 'ativos') rows = rows.filter((r) => r.ativo)
    else if (filtro === 'inativos') rows = rows.filter((r) => !r.ativo)

    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        (r.descricao ?? '').toLowerCase().includes(q),
    )
  }, [lista, busca, filtro])

  function abrirNovo() {
    setEditingId(null)
    setNome('')
    setDescricao('')
    setPrecoStr('')
    setOrdemStr('0')
    setAtivo(true)
    setFormErr('')
    setModalOpen(true)
  }

  function abrirEditar(row: CatalogoServicoRow) {
    setEditingId(row.id)
    setNome(row.nome)
    setDescricao(row.descricao ?? '')
    setPrecoStr(String(Number(row.preco_sugerido)))
    setOrdemStr(String(row.ordem))
    setAtivo(row.ativo)
    setFormErr('')
    setModalOpen(true)
  }

  function fecharModal() {
    if (salvando) return
    setModalOpen(false)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!activeStoreId) {
      setFormErr('Selecione uma loja no topo da tela.')
      return
    }
    if (!nome.trim()) {
      setFormErr('Informe o nome do serviço.')
      return
    }
    const preco = parseMoneyInput(precoStr)
    if (preco === null) {
      setFormErr('Preço sugerido inválido.')
      return
    }
    const ordem = Math.max(0, Math.min(32000, Math.round(Number(ordemStr.replace(',', '.')) || 0)))

    setSalvando(true)
    setFormErr('')
    try {
      if (editingId) {
        await atualizarCatalogoServico(editingId, {
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          preco_sugerido: preco,
          ordem,
          ativo,
        })
      } else {
        await criarCatalogoServico({
          company_id: companyId,
          store_id: activeStoreId,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          preco_sugerido: preco,
          ordem,
          ativo,
        })
      }
      setModalOpen(false)
      await carregar()
      onCatalogChanged?.()
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(row: CatalogoServicoRow) {
    setErro(null)
    try {
      await atualizarCatalogoServico(row.id, { ativo: !row.ativo })
      await carregar()
      onCatalogChanged?.()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao atualizar status.')
    }
  }

  async function handleExcluir(row: CatalogoServicoRow) {
    if (
      !window.confirm(
        `Excluir permanentemente "${row.nome}"? Itens já lançados na OS mantêm o texto e o valor; só perdem o vínculo com o catálogo.`,
      )
    ) {
      return
    }
    setErro(null)
    try {
      await excluirCatalogoServico(row.id)
      await carregar()
      onCatalogChanged?.()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao excluir.')
    }
  }

  const FILTROS: { key: FiltroLista; label: string }[] = [
    { key: 'ativos', label: 'Ativos' },
    { key: 'inativos', label: 'Inativos' },
    { key: 'todos', label: 'Todos' },
  ]

  return (
    <article className="svc-cat" aria-labelledby="svc-cat-title">
      <header className="svc-cat__hero">
        <h1 id="svc-cat-title" className="svc-cat__title">
          Catálogo de serviços
        </h1>
        <p className="svc-cat__lead">
          Cadastre serviços e mão de obra com <strong>nome</strong> e <strong>preço sugerido</strong>. Na ordem de
          serviço, eles aparecem em uma lista no mesmo estilo das peças: você escolhe o serviço, pode ajustar preço e
          texto e inclui na OS. Serviços <strong>inativos</strong> não aparecem na lista da OS, mas continuam aqui para
          consulta ou reativação.
        </p>
      </header>

      {erro ? (
        <div className="svc-cat__alert" role="alert">
          {erro}
        </div>
      ) : null}

      <div className="svc-cat__toolbar">
        <label className="svc-cat__search-wrap">
          <span className="svc-cat__search-label">Buscar</span>
          <input
            type="search"
            className="svc-cat__search"
            placeholder="Nome ou descrição do serviço…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="svc-cat__filters" role="group" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filtro === f.key ? 'svc-cat__chip svc-cat__chip--on' : 'svc-cat__chip'}
              aria-pressed={filtro === f.key}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="svc-cat__btn-primary" onClick={abrirNovo}>
          + Novo serviço
        </button>
      </div>

      {loading ? (
        <p className="svc-cat__muted">Carregando catálogo…</p>
      ) : filtrada.length === 0 ? (
        <div className="svc-cat__empty">
          <p className="svc-cat__empty-title">Nenhum serviço neste filtro.</p>
          <p className="svc-cat__empty-hint">
            {filtro === 'ativos' && lista.some((r) => !r.ativo)
              ? 'Há serviços inativos: altere o filtro acima ou reative um item.'
              : 'Cadastre o primeiro serviço com o botão “Novo serviço”.'}
          </p>
        </div>
      ) : (
        <ul className="svc-cat__list">
          {filtrada.map((row) => (
            <li key={row.id} className={`svc-cat__card${row.ativo ? '' : ' svc-cat__card--off'}`}>
              <div className="svc-cat__card-head">
                <h2 className="svc-cat__card-title">{row.nome}</h2>
                <div className="svc-cat__card-meta">
                  <span className="svc-cat__price">{formatBRL(Number(row.preco_sugerido))}</span>
                  <span className={row.ativo ? 'svc-cat__pill svc-cat__pill--on' : 'svc-cat__pill'}>
                    {row.ativo ? 'Ativo na OS' : 'Inativo'}
                  </span>
                </div>
              </div>
              {row.descricao ? <p className="svc-cat__card-desc">{row.descricao}</p> : null}
              <div className="svc-cat__card-actions">
                <button type="button" className="svc-cat__btn-ghost" onClick={() => abrirEditar(row)}>
                  Editar
                </button>
                <button type="button" className="svc-cat__btn-ghost" onClick={() => void alternarAtivo(row)}>
                  {row.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button type="button" className="svc-cat__btn-danger" onClick={() => void handleExcluir(row)}>
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <div className="cl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="svc-modal-title">
          <div className="cl-modal svc-cat-modal">
            <div className="cl-modal__head">
              <h2 id="svc-modal-title" className="cl-modal__title">
                {editingId ? 'Editar serviço' : 'Novo serviço'}
              </h2>
              <button type="button" className="cl-modal__close" onClick={fecharModal} aria-label="Fechar">
                ×
              </button>
            </div>
            <form
              className="cl-form"
              onSubmit={(e) => {
                void handleSalvar(e)
              }}
              noValidate
            >
              <p className="svc-cat-modal__hint">
                O <strong>preço sugerido</strong> preenche a OS automaticamente; na OS ainda dá para mudar o valor
                antes de lançar.
              </p>
              <div className="cl-field">
                <label htmlFor="svc-nome" className="cl-label">
                  Nome do serviço <span className="cl-req">*</span>
                </label>
                <input
                  id="svc-nome"
                  className="cl-input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Troca de câmara, Revisão nível 2"
                  autoComplete="off"
                />
              </div>
              <div className="cl-field">
                <label htmlFor="svc-desc" className="cl-label">
                  Descrição (opcional)
                </label>
                <textarea
                  id="svc-desc"
                  className="cl-input cl-textarea"
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Detalhes para a equipe: o que está incluso, tempo estimado, observações."
                />
              </div>
              <div className="cl-field cl-field--inline-2">
                <div>
                  <label htmlFor="svc-preco" className="cl-label">
                    Preço sugerido (R$) <span className="cl-req">*</span>
                  </label>
                  <input
                    id="svc-preco"
                    className="cl-input"
                    inputMode="decimal"
                    value={precoStr}
                    onChange={(e) => setPrecoStr(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label htmlFor="svc-ordem" className="cl-label">
                    Ordem na lista
                  </label>
                  <input
                    id="svc-ordem"
                    className="cl-input"
                    inputMode="numeric"
                    value={ordemStr}
                    onChange={(e) => setOrdemStr(e.target.value)}
                    placeholder="0 = primeiro"
                  />
                </div>
              </div>
              <label className="svc-cat-modal__check">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                <span>Disponível para seleção na ordem de serviço</span>
              </label>

              {formErr ? (
                <p className="cl-form-error" role="alert">
                  {formErr}
                </p>
              ) : null}

              <div className="cl-modal__foot">
                <button type="button" className="cl-btn cl-btn--ghost" onClick={fecharModal} disabled={salvando}>
                  Cancelar
                </button>
                <button type="submit" className="cl-btn cl-btn--accent" disabled={salvando}>
                  {salvando ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  )
}

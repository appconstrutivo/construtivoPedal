import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  atualizarPosVendaRegra,
  concluirPosVendaLembrete,
  criarPosVendaRegra,
  dispensarPosVendaLembrete,
  excluirPosVendaRegra,
  labelUrgenciaLembrete,
  listarPosVendaLembretesVencidos,
  listarPosVendaRegras,
  type PosVendaLembreteComRelacoes,
  type PosVendaRegraRow,
} from '../services/pos-venda-lembretes.service'

type PosVendaLembretesPageProps = {
  companyId: string
  activeStoreId: string
  onBadgeChange?: () => void
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function IconPlus() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1-2h10l1 2M9 7V5h6v2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PosVendaLembretesPage({
  companyId,
  activeStoreId,
  onBadgeChange,
}: PosVendaLembretesPageProps) {
  const [regras, setRegras] = useState<PosVendaRegraRow[]>([])
  const [lembretes, setLembretes] = useState<PosVendaLembreteComRelacoes[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [msgOk, setMsgOk] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [modalRegra, setModalRegra] = useState(false)
  const [editRegraId, setEditRegraId] = useState<string | null>(null)
  const [diasStr, setDiasStr] = useState('30')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')

  const carregar = useCallback(async () => {
    if (!activeStoreId) {
      setRegras([])
      setLembretes([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const [r, l] = await Promise.all([
        listarPosVendaRegras(companyId, activeStoreId),
        listarPosVendaLembretesVencidos(companyId, activeStoreId),
      ])
      setRegras(r)
      setLembretes(l)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar lembretes.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const regrasAtivas = useMemo(() => regras.filter((r) => r.ativo), [regras])

  function abrirNovaRegra() {
    setEditRegraId(null)
    setDiasStr('30')
    setTitulo('')
    setDescricao('')
    setModalRegra(true)
  }

  function abrirEditarRegra(regra: PosVendaRegraRow) {
    setEditRegraId(regra.id)
    setDiasStr(String(regra.dias_apos_venda))
    setTitulo(regra.titulo)
    setDescricao(regra.descricao ?? '')
    setModalRegra(true)
  }

  async function handleSalvarRegra(e: React.FormEvent) {
    e.preventDefault()
    if (!activeStoreId) return
    const dias = parseInt(diasStr, 10)
    if (!Number.isFinite(dias) || dias <= 0) {
      setErro('Informe quantos dias após a venda (número maior que zero).')
      return
    }
    if (!titulo.trim()) {
      setErro('Informe o título da ação.')
      return
    }
    setBusy('regra')
    setErro(null)
    setMsgOk(null)
    try {
      if (editRegraId) {
        await atualizarPosVendaRegra(editRegraId, {
          dias_apos_venda: dias,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
        })
        setMsgOk('Regra atualizada.')
      } else {
        await criarPosVendaRegra({
          company_id: companyId,
          store_id: activeStoreId,
          dias_apos_venda: dias,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          ordem: regras.length,
        })
        setMsgOk('Regra criada.')
      }
      setModalRegra(false)
      await carregar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar regra.')
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleRegra(regra: PosVendaRegraRow) {
    setBusy(regra.id)
    setErro(null)
    try {
      await atualizarPosVendaRegra(regra.id, { ativo: !regra.ativo })
      await carregar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar regra.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExcluirRegra(regra: PosVendaRegraRow) {
    if (!window.confirm(`Excluir a regra "${regra.titulo}"?\n\nLembretes já gerados não serão removidos.`)) return
    setBusy(regra.id)
    setErro(null)
    try {
      await excluirPosVendaRegra(regra.id)
      setMsgOk('Regra excluída.')
      await carregar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir regra.')
    } finally {
      setBusy(null)
    }
  }

  async function handleConcluir(lembrete: PosVendaLembreteComRelacoes) {
    setBusy(lembrete.id)
    setErro(null)
    try {
      await concluirPosVendaLembrete(lembrete.id)
      await carregar()
      onBadgeChange?.()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao concluir lembrete.')
    } finally {
      setBusy(null)
    }
  }

  async function handleDispensar(lembrete: PosVendaLembreteComRelacoes) {
    if (!window.confirm('Dispensar este lembrete sem registrar contato?')) return
    setBusy(lembrete.id)
    setErro(null)
    try {
      await dispensarPosVendaLembrete(lembrete.id)
      await carregar()
      onBadgeChange?.()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao dispensar lembrete.')
    } finally {
      setBusy(null)
    }
  }

  if (!activeStoreId) {
    return (
      <div className="pvl-empty">
        <p>Selecione uma loja no topo da tela.</p>
      </div>
    )
  }

  return (
    <div className="pvl-page">
      {erro && (
        <p className="st-form-error" role="alert">
          {erro}
        </p>
      )}
      {msgOk && (
        <p className="pvl-success" role="status">
          {msgOk}
        </p>
      )}

      <section className="cp-panel pvl-section" aria-labelledby="pvl-regras-title">
        <div className="pvl-section__head">
          <div>
            <h2 id="pvl-regras-title" className="pvl-section__title">
              Regras pós-venda de bikes
            </h2>
            <p className="cp-panel__hint">
              Ao finalizar uma venda com produto da categoria <strong>bike</strong> e cliente
              vinculado, o sistema agenda lembretes com base nestas regras. Usa o nome do produto
              vendido — não exige cadastro de marca/modelo.
            </p>
          </div>
          <button type="button" className="cl-btn cl-btn--accent" onClick={abrirNovaRegra}>
            <IconPlus />
            Nova regra
          </button>
        </div>

        {loading ? (
          <p className="cp-panel__hint">Carregando…</p>
        ) : regras.length === 0 ? (
          <div className="pvl-empty-inline">
            <p>Nenhuma regra configurada.</p>
            <p className="cp-panel__hint">
              Exemplo: 30 dias — &quot;Ligar para agendar primeira manutenção&quot;
            </p>
          </div>
        ) : (
          <ul className="pvl-regras">
            {regras.map((regra) => (
              <li key={regra.id} className={regra.ativo ? 'pvl-regra' : 'pvl-regra pvl-regra--off'}>
                <div className="pvl-regra__main">
                  <span className="pvl-regra__dias">{regra.dias_apos_venda}d</span>
                  <div>
                    <strong className="pvl-regra__titulo">{regra.titulo}</strong>
                    {regra.descricao && (
                      <p className="pvl-regra__desc">{regra.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="pvl-regra__actions">
                  <label className="pvl-toggle">
                    <input
                      type="checkbox"
                      checked={regra.ativo}
                      disabled={busy === regra.id}
                      onChange={() => void handleToggleRegra(regra)}
                    />
                    <span>{regra.ativo ? 'Ativa' : 'Inativa'}</span>
                  </label>
                  <button
                    type="button"
                    className="cl-btn cl-btn--ghost cl-btn--sm"
                    onClick={() => abrirEditarRegra(regra)}
                    disabled={busy === regra.id}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="cl-btn cl-btn--ghost cl-btn--sm pvl-btn-danger"
                    onClick={() => void handleExcluirRegra(regra)}
                    disabled={busy === regra.id}
                    aria-label="Excluir regra"
                  >
                    <IconTrash />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {regrasAtivas.length > 0 && (
          <p className="cp-panel__hint pvl-hint-footer">
            {regrasAtivas.length} regra(s) ativa(s) — aplicadas automaticamente em novas vendas de
            bike com cliente.
          </p>
        )}
      </section>

      <section className="cp-panel pvl-section" aria-labelledby="pvl-pend-title">
        <div className="pvl-section__head">
          <div>
            <h2 id="pvl-pend-title" className="pvl-section__title">
              Contatos pendentes
            </h2>
            <p className="cp-panel__hint">
              Lembretes vencidos ou para hoje. Cliente + produto vendido.
            </p>
          </div>
          {lembretes.length > 0 && (
            <span className="pvl-badge-count">{lembretes.length}</span>
          )}
        </div>

        {loading ? (
          <p className="cp-panel__hint">Carregando…</p>
        ) : lembretes.length === 0 ? (
          <p className="pvl-empty-inline">Nenhum contato pendente no momento.</p>
        ) : (
          <ul className="pvl-lembretes">
            {lembretes.map((l) => {
              const urgencia = labelUrgenciaLembrete(l.data_prevista)
              const atrasado = l.data_prevista < new Date().toISOString().slice(0, 10)
              return (
                <li key={l.id} className={atrasado ? 'pvl-lembrete pvl-lembrete--late' : 'pvl-lembrete'}>
                  <div className="pvl-lembrete__body">
                    <div className="pvl-lembrete__top">
                      <strong>{l.cliente?.nome ?? 'Cliente'}</strong>
                      <span className={atrasado ? 'pvl-tag pvl-tag--late' : 'pvl-tag'}>{urgencia}</span>
                    </div>
                    <p className="pvl-lembrete__acao">{l.titulo}</p>
                    <p className="pvl-lembrete__meta">
                      {l.produto_descricao}
                      {l.venda?.numero != null && ` · Venda #${l.venda.numero}`}
                      {' · '}
                      Venda em {formatDate(l.data_venda)} · Previsto {formatDate(l.data_prevista)}
                    </p>
                    {l.cliente?.fone && (
                      <a className="pvl-lembrete__fone" href={`tel:${l.cliente.fone}`}>
                        {l.cliente.fone}
                      </a>
                    )}
                  </div>
                  <div className="pvl-lembrete__actions">
                    <button
                      type="button"
                      className="cl-btn cl-btn--accent cl-btn--sm"
                      disabled={busy === l.id}
                      onClick={() => void handleConcluir(l)}
                    >
                      Feito
                    </button>
                    <button
                      type="button"
                      className="cl-btn cl-btn--ghost cl-btn--sm"
                      disabled={busy === l.id}
                      onClick={() => void handleDispensar(l)}
                    >
                      Dispensar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {modalRegra && (
        <div className="cl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pvl-modal-title">
          <div className="cl-modal pvl-modal">
            <div className="cl-modal__head">
              <h3 id="pvl-modal-title">{editRegraId ? 'Editar regra' : 'Nova regra'}</h3>
              <button type="button" className="cl-modal__close" onClick={() => setModalRegra(false)}>
                ×
              </button>
            </div>
            <form className="st-form" onSubmit={handleSalvarRegra}>
              <label className="st-field">
                <span>Dias após a venda *</span>
                <input
                  className="st-input"
                  type="number"
                  min={1}
                  step={1}
                  value={diasStr}
                  onChange={(e) => setDiasStr(e.target.value)}
                  placeholder="Ex.: 30"
                  required
                />
                <span className="st-field__hint">Qualquer valor: 30, 45, 90, 180…</span>
              </label>
              <label className="st-field">
                <span>Ação / título *</span>
                <input
                  className="st-input"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Ligar para agendar revisão"
                  required
                />
              </label>
              <label className="st-field">
                <span>Observação (opcional)</span>
                <textarea
                  className="st-input"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Detalhes para a equipe…"
                />
              </label>
              <div className="st-form-actions">
                <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalRegra(false)}>
                  Cancelar
                </button>
                <button type="submit" className="cp-btn cp-btn--primary" disabled={busy === 'regra'}>
                  {busy === 'regra' ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

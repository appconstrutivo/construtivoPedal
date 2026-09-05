import { useCallback, useEffect, useMemo, useState } from 'react'
import { PagamentoMistoFields, validarPagamentoMisto } from '../PagamentoMistoFields'
import { novaLinhaPagamento, type PagamentoLinha } from '../../lib/pagamento-misto'
import {
  cancelarContaReceber,
  FINANCEIRO_LISTA_PAGE_SIZE,
  garantirContaCaixa,
  isVencida,
  labelFormaRecebimento,
  labelStatusContaReceber,
  listarContasFinanceiras,
  listarContasReceber,
  obterResumoContasReceber,
  registrarRecebimentoConta,
  type ContaReceber,
  type FiltroContaReceber,
  type ResumoContasReceber,
} from '../../services/financeiro.service'

type FinContasReceberTabProps = {
  companyId: string
  storeId: string
}

const FILTROS: { key: FiltroContaReceber; label: string }[] = [
  { key: 'pendentes', label: 'A receber' },
  { key: 'vencidas', label: 'Vencidas' },
  { key: 'recebidas', label: 'Recebidas' },
  { key: 'canceladas', label: 'Canceladas' },
  { key: 'todas', label: 'Todas' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${iso}T12:00:00`),
  )
}

export function FinContasReceberTab({ companyId, storeId }: FinContasReceberTabProps) {
  const [filtro, setFiltro] = useState<FiltroContaReceber>('pendentes')
  const [lista, setLista] = useState<ContaReceber[]>([])
  const [resumo, setResumo] = useState<ResumoContasReceber | null>(null)
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [modalReceber, setModalReceber] = useState<ContaReceber | null>(null)
  const [contaReceberId, setContaReceberId] = useState('')
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>(() => [novaLinhaPagamento('pix')])
  const [dataRecebimento, setDataRecebimento] = useState(() => new Date().toISOString().slice(0, 10))
  const [pagina, setPagina] = useState(1)

  const recarregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      await garantirContaCaixa(companyId, storeId)
      const [items, res, contasFin] = await Promise.all([
        listarContasReceber(companyId, storeId, filtro),
        obterResumoContasReceber(companyId, storeId),
        listarContasFinanceiras(companyId, storeId),
      ])
      setLista(items)
      setResumo(res)
      const caixa = contasFin.find((c) => c.tipo === 'caixa') ?? contasFin[0]
      setContas(contasFin.map((c) => ({ id: c.id, nome: c.nome })))
      if (caixa) setContaReceberId(caixa.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar contas a receber.')
    } finally {
      setLoading(false)
    }
  }, [companyId, storeId, filtro])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    setPagina(1)
  }, [filtro, storeId])

  const totalItens = lista.length
  const totalPaginas = Math.max(1, Math.ceil(totalItens / FINANCEIRO_LISTA_PAGE_SIZE))

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas)
  }, [pagina, totalPaginas])

  const listaPaginada = useMemo(() => {
    const inicio = (pagina - 1) * FINANCEIRO_LISTA_PAGE_SIZE
    return lista.slice(inicio, inicio + FINANCEIRO_LISTA_PAGE_SIZE)
  }, [lista, pagina])

  const intervaloLista = useMemo(() => {
    if (totalItens === 0) return null
    const inicio = (pagina - 1) * FINANCEIRO_LISTA_PAGE_SIZE + 1
    const fim = Math.min(pagina * FINANCEIRO_LISTA_PAGE_SIZE, totalItens)
    return { inicio, fim }
  }, [pagina, totalItens])

  function abrirReceber(cr: ContaReceber) {
    setModalReceber(cr)
    setPagamentos([novaLinhaPagamento('pix')])
    setDataRecebimento(new Date().toISOString().slice(0, 10))
    setSucesso(null)
    setErro(null)
  }

  async function handleReceber(e: React.FormEvent) {
    e.preventDefault()
    if (!modalReceber || !contaReceberId) return
    const { ok, parsed } = validarPagamentoMisto(modalReceber.valor, pagamentos)
    if (!ok) {
      setErro('Confira os valores de cada forma de pagamento.')
      return
    }
    setProcessandoId(modalReceber.id)
    setErro(null)
    try {
      const res = await registrarRecebimentoConta({
        contaReceberId: modalReceber.id,
        contaFinanceiraId: contaReceberId,
        pagamentos: parsed,
        dataRecebimento,
      })
      setModalReceber(null)
      setSucesso(
        res.vendaNumero
          ? `Recebimento registrado. Venda #${res.vendaNumero} gerada no lançamento.`
          : 'Recebimento registrado no caixa.',
      )
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao receber.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function handleCancelar(cr: ContaReceber) {
    if (!window.confirm(`Cancelar o faturamento "${cr.descricao}"?`)) return
    setProcessandoId(cr.id)
    setErro(null)
    try {
      await cancelarContaReceber(cr.id)
      setSucesso('Faturamento cancelado.')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cancelar.')
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <div className="fin-tab">
      {resumo ? (
        <div className="rl-kpi-grid rl-kpi-grid--4 fin-kpi-row">
          <article className="rl-kpi rl-kpi--amber">
            <span className="rl-kpi__label">A receber</span>
            <span className="rl-kpi__value">{formatBRL(resumo.totalPendente)}</span>
            <span className="rl-kpi__hint">{resumo.pendentes} título(s)</span>
          </article>
          <article className="rl-kpi rl-kpi--rose">
            <span className="rl-kpi__label">Vencidas</span>
            <span className="rl-kpi__value">{resumo.vencidas}</span>
          </article>
          <article className="rl-kpi rl-kpi--teal">
            <span className="rl-kpi__label">Recebido no mês (OS)</span>
            <span className="rl-kpi__value">{formatBRL(resumo.recebidoMesOs)}</span>
            <span className="rl-kpi__hint">{resumo.recebidasMes} recebimento(s)</span>
          </article>
        </div>
      ) : null}

      <div className="fin-toolbar">
        <div className="lc-filters" role="tablist" aria-label="Filtrar contas a receber">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`lc-filter${filtro === f.key ? ' lc-filter--on' : ''}`}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

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

      <section className="lc-panel" aria-label="Lista de contas a receber">
        {loading ? (
          <p className="lc-empty">Carregando…</p>
        ) : totalItens === 0 ? (
          <p className="lc-empty">
            {filtro === 'pendentes'
              ? 'Nenhuma conta a receber. Fature uma OS em Pronta ou Entregue na oficina.'
              : 'Nenhum registro neste filtro.'}
          </p>
        ) : (
          <>
            <ul className="lc-list">
              {listaPaginada.map((cr) => {
                const busy = processandoId === cr.id
                const vencida = cr.status === 'pendente' && isVencida(cr.vencimento, 'pendente')
                const statusClass =
                  cr.status === 'recebido'
                    ? 'lc-row__status--ok'
                    : cr.status === 'cancelado'
                      ? 'lc-row__status--cancel'
                      : vencida
                        ? 'fin-cp-status--vencida'
                        : ''
                return (
                  <li
                    key={cr.id}
                    className={`lc-row fin-cp-row${cr.status === 'cancelado' ? ' lc-row--cancel' : ''}${vencida ? ' fin-cp-row--vencida' : ''}`}
                  >
                    <div className="lc-row__main fin-cp-row__main">
                      <span className="lc-row__num fin-cp-row__desc">{cr.descricao}</span>
                      <span className="lc-row__meta">
                        Vence {formatDate(cr.vencimento)}
                        {cr.osNumero ? ` · OS #${cr.osNumero}` : ''}
                        {cr.clienteNome ? ` · ${cr.clienteNome}` : ''}
                        {' · '}
                        {cr.status === 'recebido' && cr.forma_pagamento
                          ? labelFormaRecebimento(cr.forma_pagamento)
                          : '—'}
                        {cr.vendaNumero ? ` · Venda #${cr.vendaNumero}` : ''}
                      </span>
                      <span className={`lc-row__status fin-cp-status ${statusClass}`}>
                        {vencida && cr.status === 'pendente'
                          ? 'Vencida'
                          : labelStatusContaReceber(cr.status)}
                      </span>
                      <span className="lc-row__total">{formatBRL(cr.valor)}</span>
                    </div>
                    <div className="lc-row__actions">
                      {cr.status === 'pendente' ? (
                        <>
                          <button
                            type="button"
                            className="lc-btn lc-btn--primary"
                            disabled={busy}
                            onClick={() => abrirReceber(cr)}
                          >
                            Receber
                          </button>
                          <button
                            type="button"
                            className="lc-btn lc-btn--ghost"
                            disabled={busy}
                            onClick={() => void handleCancelar(cr)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : cr.status === 'recebido' && cr.data_recebimento ? (
                        <span className="fin-cp-pago-em">
                          Recebido em {formatDate(cr.data_recebimento)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>

            {totalPaginas > 1 && intervaloLista ? (
              <footer className="lc-pager" aria-label="Paginação de contas a receber">
                <p className="lc-pager__info">
                  Exibindo {intervaloLista.inicio}–{intervaloLista.fim} de {totalItens} título(s)
                </p>
                <div className="lc-pager__nav">
                  <button
                    type="button"
                    className="lc-btn lc-btn--ghost"
                    disabled={loading || pagina <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="lc-pager__page" aria-live="polite">
                    Página {pagina} de {totalPaginas}
                  </span>
                  <button
                    type="button"
                    className="lc-btn lc-btn--ghost"
                    disabled={loading || pagina >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  >
                    Próxima
                  </button>
                </div>
              </footer>
            ) : null}
            {totalItens > 0 && totalItens <= FINANCEIRO_LISTA_PAGE_SIZE ? (
              <p className="lc-pager__info lc-pager__info--solo">
                {totalItens === 1 ? '1 título' : `${totalItens} títulos`}
              </p>
            ) : null}
          </>
        )}
      </section>

      {modalReceber ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalReceber(null)}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="fin-modal-receber-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleReceber(e)}
          >
            <h2 id="fin-modal-receber-titulo" className="fin-modal__title">
              Registrar recebimento
            </h2>
            <p className="fin-modal__hint">
              {modalReceber.descricao} — <strong>{formatBRL(modalReceber.valor)}</strong>
            </p>
            <p className="fin-modal__hint">
              O valor entra no caixa e, se for OS, gera venda no lançamento (sem nova baixa de estoque).
            </p>
            <label className="fin-field">
              <span>Conta / caixa</span>
              <select
                value={contaReceberId}
                onChange={(e) => setContaReceberId(e.target.value)}
                required
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <PagamentoMistoFields
              total={modalReceber.valor}
              linhas={pagamentos}
              onChange={setPagamentos}
            />
            <label className="fin-field">
              <span>Data do recebimento</span>
              <input
                type="date"
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
                required
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalReceber(null)}>
                Voltar
              </button>
              <button
                type="submit"
                className="cp-btn cp-btn--primary"
                disabled={
                  processandoId === modalReceber.id ||
                  !validarPagamentoMisto(modalReceber.valor, pagamentos).ok
                }
              >
                {processandoId === modalReceber.id ? 'Registrando…' : 'Confirmar recebimento'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

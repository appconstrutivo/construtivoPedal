import { useCallback, useEffect, useState } from 'react'
import { PagamentoMistoFields, validarPagamentoMisto } from '../PagamentoMistoFields'
import { novaLinhaPagamento, type PagamentoLinha } from '../../lib/pagamento-misto'
import {
  cancelarContaReceber,
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
    <div className="fin-pagar">
      {resumo ? (
        <div className="fin-pagar__kpis">
          <article className="fin-pagar-kpi">
            <span className="fin-pagar-kpi__label">A receber</span>
            <strong>{formatBRL(resumo.totalPendente)}</strong>
            <span className="fin-pagar-kpi__hint">{resumo.pendentes} título(s)</span>
          </article>
          <article className="fin-pagar-kpi fin-pagar-kpi--warn">
            <span className="fin-pagar-kpi__label">Vencidas</span>
            <strong>{resumo.vencidas}</strong>
          </article>
          <article className="fin-pagar-kpi fin-pagar-kpi--ok">
            <span className="fin-pagar-kpi__label">Recebido no mês (OS)</span>
            <strong>{formatBRL(resumo.recebidoMesOs)}</strong>
            <span className="fin-pagar-kpi__hint">{resumo.recebidasMes} recebimento(s)</span>
          </article>
        </div>
      ) : null}

      {sucesso ? (
        <p className="fin-alert fin-alert--ok" role="status">
          {sucesso}
        </p>
      ) : null}
      {erro ? (
        <p className="fin-alert fin-alert--err" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="fin-pagar__toolbar">
        <div className="fin-filtros" role="tablist" aria-label="Filtro">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filtro === f.key}
              className={filtro === f.key ? 'fin-filtro fin-filtro--on' : 'fin-filtro'}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="fin-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="fin-muted">
          {filtro === 'pendentes'
            ? 'Nenhuma conta a receber. Fature uma OS em Pronta ou Entregue na oficina.'
            : 'Nenhum registro neste filtro.'}
        </p>
      ) : (
        <ul className="fin-pagar-list">
          {lista.map((cr) => {
            const vencida = cr.status === 'pendente' && isVencida(cr.vencimento, 'pendente')
            return (
              <li key={cr.id} className="fin-pagar-row">
                <div className="fin-pagar-row__main">
                  <div className="fin-pagar-row__top">
                    <strong>{cr.descricao}</strong>
                    <span
                      className={
                        cr.status === 'recebido'
                          ? 'fin-badge fin-badge--ok'
                          : vencida
                            ? 'fin-badge fin-badge--warn'
                            : 'fin-badge'
                      }
                    >
                      {labelStatusContaReceber(cr.status)}
                    </span>
                  </div>
                  <p className="fin-pagar-row__meta">
                    Venc. {formatDate(cr.vencimento)}
                    {cr.osNumero ? ` · OS #${cr.osNumero}` : ''}
                    {cr.clienteNome ? ` · ${cr.clienteNome}` : ''}
                    {cr.status === 'recebido' && cr.forma_pagamento
                      ? ` · ${labelFormaRecebimento(cr.forma_pagamento)}`
                      : ''}
                    {cr.vendaNumero ? ` · Venda #${cr.vendaNumero}` : ''}
                  </p>
                </div>
                <div className="fin-pagar-row__valor">{formatBRL(cr.valor)}</div>
                <div className="fin-pagar-row__actions">
                  {cr.status === 'pendente' ? (
                    <>
                      <button
                        type="button"
                        className="st-primary-btn st-primary-btn--sm"
                        disabled={processandoId === cr.id}
                        onClick={() => abrirReceber(cr)}
                      >
                        Receber
                      </button>
                      <button
                        type="button"
                        className="st-ghost-btn st-ghost-btn--sm"
                        disabled={processandoId === cr.id}
                        onClick={() => void handleCancelar(cr)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

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
              <button type="button" className="st-ghost-btn" onClick={() => setModalReceber(null)}>
                Voltar
              </button>
              <button
                type="submit"
                className="st-primary-btn"
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

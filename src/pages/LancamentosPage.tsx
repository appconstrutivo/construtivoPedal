import { useCallback, useEffect, useMemo, useState } from 'react'
import { imprimirReciboVenda } from '../components/VendaReciboPrint'
import {
  cancelarVenda,
  resumoPagamentosVenda,
  labelStatusVenda,
  listarVendasLancamentos,
  obterVendaDetalhe,
  type VendaLancamentoLista,
  type VendaStatus,
} from '../services/lancamentos.service'

type LancamentosPageProps = {
  companyId: string
  companyName: string
  activeStoreId: string
}

type FiltroStatus = 'todas' | VendaStatus

const FILTROS: { key: FiltroStatus; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'finalizada', label: 'Finalizadas' },
  { key: 'cancelada', label: 'Canceladas' },
]

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function LancamentosPage({ companyId, companyName, activeStoreId }: LancamentosPageProps) {
  const semLoja = !activeStoreId

  const [vendas, setVendas] = useState<VendaLancamentoLista[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroStatus>('todas')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!activeStoreId) {
      setVendas([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const lista = await listarVendasLancamentos(companyId, activeStoreId, {
        limit: 80,
        status: filtro === 'todas' ? 'todas' : filtro,
      })
      setVendas(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar lançamentos.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId, filtro])

  useEffect(() => {
    setSucesso(null)
    void recarregar()
  }, [recarregar])

  const vendasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return vendas
    return vendas.filter((v) => {
      if (String(v.numero).includes(q)) return true
      if (v.clienteNome?.toLowerCase().includes(q)) return true
      return false
    })
  }, [vendas, busca])

  async function handleImprimir(vendaId: string) {
    if (semLoja) return
    setProcessandoId(vendaId)
    setErro(null)
    try {
      const detalhe = await obterVendaDetalhe(companyId, activeStoreId, vendaId)
      imprimirReciboVenda(detalhe, companyName, { segundaVia: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao imprimir recibo.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function handleCancelar(v: VendaLancamentoLista) {
    if (semLoja || v.status !== 'finalizada') return
    const ok = window.confirm(
      `Cancelar a venda #${v.numero} (${formatBRL(Number(v.total))})?\n\nO estoque dos produtos será estornado automaticamente.`,
    )
    if (!ok) return

    setProcessandoId(v.id)
    setErro(null)
    setSucesso(null)
    try {
      await cancelarVenda(companyId, activeStoreId, v.id)
      setSucesso(`Venda #${v.numero} cancelada.`)
      await recarregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao cancelar venda.')
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <div className="cp-page lc-page">
      <header className="lc-head">
        <div>
          <h1 className="lc-head__title">Lançamentos</h1>
          <p className="lc-head__sub">Recibo de venda e cancelamento de vendas do balcão.</p>
        </div>
      </header>

      {semLoja && (
        <div className="lc-alert lc-alert--warn" role="status">
          Selecione uma loja no topo da tela.
        </div>
      )}

      {erro && (
        <div className="lc-alert lc-alert--error" role="alert">
          {erro}
        </div>
      )}

      {sucesso && (
        <div className="lc-alert lc-alert--ok" role="status">
          {sucesso}
        </div>
      )}

      <div className="lc-toolbar">
        <input
          type="search"
          className="lc-search"
          placeholder="Buscar por nº da venda ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          disabled={semLoja}
        />
        <div className="lc-filters" role="tablist" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filtro === f.key}
              className={`lc-filter${filtro === f.key ? ' lc-filter--on' : ''}`}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <section className="lc-panel" aria-label="Vendas registradas">
        {loading ? (
          <p className="lc-empty">Carregando vendas…</p>
        ) : vendasFiltradas.length === 0 ? (
          <p className="lc-empty">
            {semLoja ? 'Nenhuma venda — selecione uma loja.' : 'Nenhuma venda encontrada.'}
          </p>
        ) : (
          <ul className="lc-list">
            {vendasFiltradas.map((v) => {
              const busy = processandoId === v.id
              const finalizada = v.status === 'finalizada'
              return (
                <li key={v.id} className={`lc-row${v.status === 'cancelada' ? ' lc-row--cancel' : ''}`}>
                  <div className="lc-row__main">
                    <span className="lc-row__num">#{v.numero}</span>
                    <span className="lc-row__meta">
                      {formatShortDate(v.created_at)}
                      {v.clienteNome ? ` · ${v.clienteNome}` : ' · Balcão'}
                      {' · '}
                      {resumoPagamentosVenda(v.forma_pagamento, v.pagamentos)}
                      {v.qtdItens > 0 ? ` · ${v.qtdItens} itens` : ''}
                    </span>
                    <span
                      className={`lc-row__status lc-row__status--${v.status === 'cancelada' ? 'cancel' : 'ok'}`}
                    >
                      {labelStatusVenda(v.status)}
                    </span>
                    <span className="lc-row__total">{formatBRL(Number(v.total))}</span>
                  </div>
                  <div className="lc-row__actions">
                    <button
                      type="button"
                      className="lc-btn lc-btn--ghost"
                      disabled={semLoja || busy}
                      onClick={() => void handleImprimir(v.id)}
                    >
                      {busy ? '…' : '2ª via'}
                    </button>
                    <button
                      type="button"
                      className="lc-btn lc-btn--danger"
                      disabled={semLoja || busy || !finalizada}
                      title={finalizada ? 'Cancelar venda e estornar estoque' : 'Venda já cancelada'}
                      onClick={() => void handleCancelar(v)}
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

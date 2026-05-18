import { useCallback, useEffect, useState } from 'react'
import {
  criarContaFinanceira,
  labelTipoConta,
  listarContasFinanceiras,
  listarMovimentacoesConta,
  registrarMovimentacao,
  type ContaFinanceira,
  type MovimentacaoFinanceira,
  type TipoContaFinanceira,
} from '../../services/financeiro.service'

type FinCaixasTabProps = {
  companyId: string
  storeId: string
}

const TIPOS: { key: TipoContaFinanceira; label: string }[] = [
  { key: 'caixa', label: 'Caixa físico' },
  { key: 'banco', label: 'Conta bancária' },
  { key: 'pix', label: 'PIX' },
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

function parseValorInput(raw: string) {
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function FinCaixasTab({ companyId, storeId }: FinCaixasTabProps) {
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [contaAtivaId, setContaAtivaId] = useState<string | null>(null)
  const [movs, setMovs] = useState<MovimentacaoFinanceira[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const [modalConta, setModalConta] = useState(false)
  const [modalMov, setModalMov] = useState(false)

  const [formConta, setFormConta] = useState({
    nome: '',
    tipo: 'caixa' as TipoContaFinanceira,
    saldoInicial: '',
  })
  const [formMov, setFormMov] = useState({
    tipo: 'entrada' as 'entrada' | 'saida',
    valor: '',
    descricao: '',
  })

  const contaAtiva = contas.find((c) => c.id === contaAtivaId) ?? contas[0] ?? null
  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo_atual, 0)

  const recarregarContas = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const lista = await listarContasFinanceiras(companyId, storeId)
      setContas(lista)
      setContaAtivaId((prev) => {
        if (prev && lista.some((c) => c.id === prev)) return prev
        return lista[0]?.id ?? null
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar caixas.')
    } finally {
      setLoading(false)
    }
  }, [companyId, storeId])

  useEffect(() => {
    void recarregarContas()
  }, [recarregarContas])

  useEffect(() => {
    if (!contaAtivaId) {
      setMovs([])
      return
    }
    void listarMovimentacoesConta(companyId, storeId, contaAtivaId)
      .then(setMovs)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar movimentações.'))
  }, [companyId, storeId, contaAtivaId])

  function selecionarConta(id: string) {
    setContaAtivaId(id)
  }

  async function handleCriarConta(e: React.FormEvent) {
    e.preventDefault()
    if (!formConta.nome.trim()) {
      setErro('Informe o nome da conta.')
      return
    }
    const saldo = parseValorInput(formConta.saldoInicial) ?? 0
    setErro(null)
    setSucesso(null)
    try {
      await criarContaFinanceira({
        companyId,
        storeId,
        nome: formConta.nome,
        tipo: formConta.tipo,
        saldoInicial: saldo,
      })
      setModalConta(false)
      setFormConta({ nome: '', tipo: 'caixa', saldoInicial: '' })
      setSucesso('Conta criada.')
      await recarregarContas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar conta.')
    }
  }

  async function handleMovimentacao(e: React.FormEvent) {
    e.preventDefault()
    if (!contaAtiva) return
    const valor = parseValorInput(formMov.valor)
    if (!valor || !formMov.descricao.trim()) {
      setErro('Informe valor e descrição.')
      return
    }
    setErro(null)
    setSucesso(null)
    try {
      await registrarMovimentacao({
        companyId,
        storeId,
        contaId: contaAtiva.id,
        tipo: formMov.tipo,
        valor,
        descricao: formMov.descricao,
      })
      setModalMov(false)
      setFormMov({ tipo: 'entrada', valor: '', descricao: '' })
      setSucesso('Movimentação registrada.')
      await recarregarContas()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar.')
    }
  }

  return (
    <div className="fin-tab">
      <div className="rl-kpi-grid fin-kpi-row">
        <article className="rl-kpi rl-kpi--teal">
          <span className="rl-kpi__label">Saldo total</span>
          <span className="rl-kpi__value">{formatBRL(saldoTotal)}</span>
          <span className="rl-kpi__hint">{contas.length} conta(s) ativa(s)</span>
        </article>
        {contaAtiva ? (
          <article className="rl-kpi rl-kpi--blue">
            <span className="rl-kpi__label">{contaAtiva.nome}</span>
            <span className="rl-kpi__value">{formatBRL(contaAtiva.saldo_atual)}</span>
            <span className="rl-kpi__hint">{labelTipoConta(contaAtiva.tipo)}</span>
          </article>
        ) : null}
      </div>

      <div className="fin-toolbar">
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => setModalConta(true)}>
          Nova conta
        </button>
        <button
          type="button"
          className="cp-btn cp-btn--outline"
          disabled={!contaAtiva}
          onClick={() => setModalMov(true)}
        >
          Entrada / saída
        </button>
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

      <div className="fin-caixas-layout">
        <section className="fin-contas-list" aria-label="Contas da loja">
          <h2 className="rl-sec__title">Contas</h2>
          {loading && contas.length === 0 ? (
            <p className="lc-empty">Carregando…</p>
          ) : contas.length === 0 ? (
            <p className="lc-empty">Nenhuma conta cadastrada.</p>
          ) : (
            <ul className="fin-contas-cards">
              {contas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={
                      c.id === contaAtiva?.id ? 'fin-conta-card fin-conta-card--active' : 'fin-conta-card'
                    }
                    onClick={() => void selecionarConta(c.id)}
                  >
                    <span className="fin-conta-card__nome">{c.nome}</span>
                    <span className="fin-conta-card__tipo">{labelTipoConta(c.tipo)}</span>
                    <span
                      className={
                        c.saldo_atual >= 0 ? 'fin-conta-card__saldo' : 'fin-conta-card__saldo fin-conta-card__saldo--neg'
                      }
                    >
                      {formatBRL(c.saldo_atual)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lc-panel fin-movs-panel" aria-label="Movimentações">
          <h2 className="rl-sec__title">
            Movimentações{contaAtiva ? ` · ${contaAtiva.nome}` : ''}
          </h2>
          {movs.length === 0 ? (
            <p className="lc-empty">Sem movimentações nesta conta.</p>
          ) : (
            <ul className="fin-mov-list">
              {movs.map((m) => (
                <li key={m.id} className={`fin-mov-row fin-mov-row--${m.tipo}`}>
                  <div>
                    <span className="fin-mov-row__desc">{m.descricao}</span>
                    <span className="fin-mov-row__meta">{formatShortDate(m.created_at)}</span>
                  </div>
                  <strong className={m.tipo === 'entrada' ? 'fin-valor--entrada' : 'fin-valor--saida'}>
                    {m.tipo === 'entrada' ? '+' : '−'} {formatBRL(m.valor)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {modalConta ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalConta(false)}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="fin-modal-conta-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleCriarConta(e)}
          >
            <h2 id="fin-modal-conta-titulo" className="fin-modal__title">
              Nova conta
            </h2>
            <label className="fin-field">
              <span>Nome</span>
              <input
                value={formConta.nome}
                onChange={(e) => setFormConta((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Caixa balcão, Nubank…"
                required
                autoFocus
              />
            </label>
            <label className="fin-field">
              <span>Tipo</span>
              <select
                value={formConta.tipo}
                onChange={(e) =>
                  setFormConta((p) => ({ ...p, tipo: e.target.value as TipoContaFinanceira }))
                }
              >
                {TIPOS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fin-field">
              <span>Saldo inicial (opcional)</span>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={formConta.saldoInicial}
                onChange={(e) => setFormConta((p) => ({ ...p, saldoInicial: e.target.value }))}
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalConta(false)}>
                Voltar
              </button>
              <button type="submit" className="cp-btn cp-btn--primary">
                Criar conta
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modalMov && contaAtiva ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalMov(false)}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="fin-modal-mov-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleMovimentacao(e)}
          >
            <h2 id="fin-modal-mov-titulo" className="fin-modal__title">
              Movimentação manual
            </h2>
            <p className="fin-modal__sub">Conta: {contaAtiva.nome}</p>
            <div className="fin-mov-tipo" role="group" aria-label="Tipo">
              <button
                type="button"
                className={formMov.tipo === 'entrada' ? 'fin-mov-tipo__btn fin-mov-tipo__btn--on' : 'fin-mov-tipo__btn'}
                onClick={() => setFormMov((p) => ({ ...p, tipo: 'entrada' }))}
              >
                Entrada
              </button>
              <button
                type="button"
                className={formMov.tipo === 'saida' ? 'fin-mov-tipo__btn fin-mov-tipo__btn--on' : 'fin-mov-tipo__btn'}
                onClick={() => setFormMov((p) => ({ ...p, tipo: 'saida' }))}
              >
                Saída
              </button>
            </div>
            <label className="fin-field">
              <span>Valor (R$)</span>
              <input
                inputMode="decimal"
                value={formMov.valor}
                onChange={(e) => setFormMov((p) => ({ ...p, valor: e.target.value }))}
                required
              />
            </label>
            <label className="fin-field">
              <span>Descrição</span>
              <input
                value={formMov.descricao}
                onChange={(e) => setFormMov((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex.: Sangria, suprimento, retirada…"
                required
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalMov(false)}>
                Voltar
              </button>
              <button type="submit" className="cp-btn cp-btn--primary">
                Registrar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

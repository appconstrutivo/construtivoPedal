import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarFornecedores } from '../../services/estoque.service'
import {
  cancelarContaPagar,
  cancelarParcelasRecorrentesFuturas,
  criarContaPagar,
  gerarVencimentosRecorrentes,
  isVencida,
  labelCategoriaContaPagar,
  labelFrequenciaRecorrencia,
  labelStatusContaPagar,
  nomeCredorContaPagar,
  listarContasFinanceiras,
  listarContasPagar,
  obterResumoContasPagar,
  registrarPagamentoContaPagar,
  type CategoriaContaPagar,
  type ContaPagar,
  type FiltroContaPagar,
  type FrequenciaRecorrencia,
  type ResumoContasPagar,
} from '../../services/financeiro.service'

type FinContasPagarTabProps = {
  companyId: string
  storeId: string
}

const FILTROS: { key: FiltroContaPagar; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'vencidas', label: 'Vencidas' },
  { key: 'pagas', label: 'Pagas' },
  { key: 'canceladas', label: 'Canceladas' },
  { key: 'todas', label: 'Todas' },
]

const CATEGORIAS: { key: CategoriaContaPagar; label: string; hint: string }[] = [
  {
    key: 'fixa',
    label: 'Despesa fixa',
    hint: 'Aluguel, luz, água, internet, condomínio, contabilidade…',
  },
  {
    key: 'fornecedor',
    label: 'Compra de insumos/peças',
    hint: 'Pagamento a fornecedor cadastrado no estoque (opcional).',
  },
  { key: 'imposto', label: 'Imposto', hint: 'DAS, ISS, taxas municipais…' },
  { key: 'folha', label: 'Folha', hint: 'Salários, pró-labore, benefícios…' },
  { key: 'outro', label: 'Outro', hint: 'Demais despesas operacionais.' },
]

const CREDOR_PLACEHOLDER: Partial<Record<CategoriaContaPagar, string>> = {
  fixa: 'Ex.: CEMIG, proprietário, condomínio…',
  imposto: 'Ex.: Receita Federal, Prefeitura…',
  folha: 'Ex.: Funcionário, contador…',
  outro: 'Quem recebe o pagamento',
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${iso}T12:00:00`),
  )
}

function parseValorInput(raw: string) {
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function FinContasPagarTab({ companyId, storeId }: FinContasPagarTabProps) {
  const [filtro, setFiltro] = useState<FiltroContaPagar>('pendentes')
  const [lista, setLista] = useState<ContaPagar[]>([])
  const [resumo, setResumo] = useState<ResumoContasPagar | null>(null)
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)

  const [modalNova, setModalNova] = useState(false)
  const [modalPagar, setModalPagar] = useState<ContaPagar | null>(null)

  const [formNova, setFormNova] = useState({
    descricao: '',
    categoria: 'fixa' as CategoriaContaPagar,
    credorNome: '',
    valor: '',
    vencimento: '',
    fornecedorId: '',
    observacao: '',
    recorrente: false,
    frequencia: 'mensal' as FrequenciaRecorrencia,
    parcelas: '12',
  })

  const categoriaAtual = CATEGORIAS.find((c) => c.key === formNova.categoria)
  const ehCompraInsumos = formNova.categoria === 'fornecedor'
  const [contaPagarId, setContaPagarId] = useState('')
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().slice(0, 10))

  const recarregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const [items, res, contasFin, forns] = await Promise.all([
        listarContasPagar(companyId, storeId, filtro),
        obterResumoContasPagar(companyId, storeId),
        listarContasFinanceiras(companyId, storeId),
        listarFornecedores(companyId, storeId),
      ])
      setLista(items)
      setResumo(res)
      setContas(contasFin.map((c) => ({ id: c.id, nome: c.nome })))
      setFornecedores(forns.map((f) => ({ id: f.id, nome: f.nome })))
      if (!contaPagarId && contasFin[0]) setContaPagarId(contasFin[0].id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar contas a pagar.')
    } finally {
      setLoading(false)
    }
  }, [companyId, storeId, filtro])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const listaFiltrada = useMemo(() => lista, [lista])

  const previewRecorrencia = useMemo(() => {
    if (!formNova.recorrente || !formNova.vencimento) return null
    const qtd = Math.min(36, Math.max(2, parseInt(formNova.parcelas, 10) || 0))
    if (qtd < 2) return null
    const datas = gerarVencimentosRecorrentes(formNova.vencimento, formNova.frequencia, qtd)
    const valor = parseValorInput(formNova.valor)
    return { qtd: datas.length, ultima: datas[datas.length - 1], valor }
  }, [formNova.recorrente, formNova.vencimento, formNova.frequencia, formNova.parcelas, formNova.valor])

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    const valor = parseValorInput(formNova.valor)
    if (!formNova.descricao.trim() || !valor || !formNova.vencimento) {
      setErro('Preencha descrição, valor e vencimento.')
      return
    }
    const parcelasNum = formNova.recorrente
      ? Math.min(36, Math.max(2, parseInt(formNova.parcelas, 10) || 0))
      : 1
    if (formNova.recorrente && parcelasNum < 2) {
      setErro('Informe pelo menos 2 parcelas para despesa recorrente.')
      return
    }

    setErro(null)
    setSucesso(null)
    try {
      await criarContaPagar({
        companyId,
        storeId,
        descricao: formNova.descricao,
        categoria: formNova.categoria,
        valor,
        vencimento: formNova.vencimento,
        credorNome: ehCompraInsumos ? null : formNova.credorNome,
        fornecedorId: ehCompraInsumos ? formNova.fornecedorId || null : null,
        observacao: formNova.observacao,
        recorrencia:
          formNova.recorrente && parcelasNum >= 2
            ? { frequencia: formNova.frequencia, parcelas: parcelasNum }
            : undefined,
      })
      setModalNova(false)
      setFormNova({
        descricao: '',
        categoria: 'fixa',
        credorNome: '',
        valor: '',
        vencimento: '',
        fornecedorId: '',
        observacao: '',
        recorrente: false,
        frequencia: 'mensal',
        parcelas: '12',
      })
      setSucesso(
        parcelasNum > 1
          ? `${parcelasNum} vencimentos criados (${labelFrequenciaRecorrencia(formNova.frequencia).toLowerCase()}).`
          : 'Conta a pagar registrada.',
      )
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar.')
    }
  }

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault()
    if (!modalPagar || !contaPagarId) return
    setProcessandoId(modalPagar.id)
    setErro(null)
    setSucesso(null)
    try {
      await registrarPagamentoContaPagar({
        companyId,
        storeId,
        contaPagarId: modalPagar.id,
        contaFinanceiraId: contaPagarId,
        dataPagamento,
      })
      setModalPagar(null)
      setSucesso(`Pagamento de "${modalPagar.descricao}" registrado.`)
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao pagar.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function handleCancelarFuturas(cp: ContaPagar) {
    if (!cp.grupo_recorrencia_id || !cp.parcela || !cp.parcelas_total) return
    const restantes = cp.parcelas_total - cp.parcela
    if (restantes <= 0) return
    const ok = window.confirm(
      `Cancelar as ${restantes} parcela(s) futuras de "${cp.descricao.replace(/\s*\(\d+\/\d+\)$/, '')}"?\n\nParcelas já pagas não serão alteradas.`,
    )
    if (!ok) return
    setProcessandoId(cp.id)
    setErro(null)
    setSucesso(null)
    try {
      const qtd = await cancelarParcelasRecorrentesFuturas(companyId, storeId, cp.id)
      setSucesso(qtd > 0 ? `${qtd} parcela(s) futura(s) cancelada(s).` : 'Nenhuma parcela futura pendente.')
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cancelar série.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function handleCancelar(cp: ContaPagar) {
    const ok = window.confirm(`Cancelar "${cp.descricao}" (${formatBRL(cp.valor)})?`)
    if (!ok) return
    setProcessandoId(cp.id)
    setErro(null)
    setSucesso(null)
    try {
      await cancelarContaPagar(companyId, storeId, cp.id)
      setSucesso('Conta cancelada.')
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
            <span className="rl-kpi__label">Pendentes</span>
            <span className="rl-kpi__value">{resumo.pendentes}</span>
            <span className="rl-kpi__hint">{formatBRL(resumo.totalPendente)}</span>
          </article>
          <article className="rl-kpi rl-kpi--rose">
            <span className="rl-kpi__label">Vencidas</span>
            <span className="rl-kpi__value">{resumo.vencidas}</span>
          </article>
          <article className="rl-kpi rl-kpi--teal">
            <span className="rl-kpi__label">Pagas no mês</span>
            <span className="rl-kpi__value">{resumo.pagasMes}</span>
          </article>
        </div>
      ) : null}

      <div className="fin-toolbar">
        <div className="lc-filters" role="tablist" aria-label="Filtrar contas">
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
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => setModalNova(true)}>
          Nova despesa
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

      <section className="lc-panel" aria-label="Lista de contas a pagar">
        {loading ? (
          <p className="lc-empty">Carregando…</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="lc-empty">Nenhuma conta neste filtro.</p>
        ) : (
          <ul className="lc-list">
            {listaFiltrada.map((cp) => {
              const busy = processandoId === cp.id
              const vencida = isVencida(cp.vencimento, cp.status)
              return (
                <li
                  key={cp.id}
                  className={`lc-row fin-cp-row${cp.status === 'cancelado' ? ' lc-row--cancel' : ''}${vencida ? ' fin-cp-row--vencida' : ''}`}
                >
                  <div className="lc-row__main fin-cp-row__main">
                    <span className="lc-row__num fin-cp-row__desc">
                      {cp.descricao}
                      {cp.parcelas_total && cp.parcelas_total > 1 && cp.parcela ? (
                        <span className="fin-rec-badge" title="Despesa recorrente">
                          {cp.parcela}/{cp.parcelas_total}
                        </span>
                      ) : null}
                    </span>
                    <span className="lc-row__meta">
                      Vence {formatDate(cp.vencimento)}
                      {nomeCredorContaPagar(cp) ? ` · ${nomeCredorContaPagar(cp)}` : ''}
                      {' · '}
                      {labelCategoriaContaPagar(cp.categoria)}
                    </span>
                    <span
                      className={`lc-row__status fin-cp-status fin-cp-status--${cp.status}${vencida ? ' fin-cp-status--vencida' : ''}`}
                    >
                      {vencida && cp.status === 'pendente' ? 'Vencida' : labelStatusContaPagar(cp.status)}
                    </span>
                    <span className="lc-row__total">{formatBRL(cp.valor)}</span>
                  </div>
                  <div className="lc-row__actions">
                    {cp.status === 'pendente' ? (
                      <>
                        <button
                          type="button"
                          className="lc-btn lc-btn--primary"
                          disabled={busy}
                          onClick={() => {
                            setContaPagarId(contas[0]?.id ?? '')
                            setDataPagamento(new Date().toISOString().slice(0, 10))
                            setModalPagar(cp)
                          }}
                        >
                          Pagar
                        </button>
                        <button
                          type="button"
                          className="lc-btn lc-btn--ghost"
                          disabled={busy}
                          onClick={() => void handleCancelar(cp)}
                        >
                          Cancelar
                        </button>
                        {cp.grupo_recorrencia_id &&
                        cp.parcela &&
                        cp.parcelas_total &&
                        cp.parcela < cp.parcelas_total ? (
                          <button
                            type="button"
                            className="lc-btn lc-btn--ghost fin-btn-futuras"
                            disabled={busy}
                            title="Cancela só as parcelas que ainda não venceram nesta série"
                            onClick={() => void handleCancelarFuturas(cp)}
                          >
                            Cancelar futuras
                          </button>
                        ) : null}
                      </>
                    ) : cp.status === 'pago' && cp.data_pagamento ? (
                      <span className="fin-cp-pago-em">Pago em {formatDate(cp.data_pagamento)}</span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {modalNova ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalNova(false)}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="fin-modal-nova-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleCriar(e)}
          >
            <h2 id="fin-modal-nova-titulo" className="fin-modal__title">
              Nova despesa
            </h2>
            <p className="fin-modal__hint">
              <strong>Categoria</strong> = tipo da despesa. <strong>Credor</strong> = quem recebe (luz,
              aluguel…). Só use fornecedor do estoque para compra de peças/insumos.
            </p>
            <label className="fin-field">
              <span>Categoria</span>
              <select
                value={formNova.categoria}
                onChange={(e) => {
                  const cat = e.target.value as CategoriaContaPagar
                  setFormNova((p) => ({
                    ...p,
                    categoria: cat,
                    fornecedorId: cat === 'fornecedor' ? p.fornecedorId : '',
                    credorNome: cat === 'fornecedor' ? '' : p.credorNome,
                  }))
                }}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {categoriaAtual ? <span className="fin-field__hint">{categoriaAtual.hint}</span> : null}
            </label>
            <label className="fin-field">
              <span>Descrição</span>
              <input
                value={formNova.descricao}
                onChange={(e) => setFormNova((p) => ({ ...p, descricao: e.target.value }))}
                placeholder={
                  ehCompraInsumos ? 'Ex.: Fatura peças março' : 'Ex.: Conta de luz — março/2026'
                }
                required
                autoFocus
              />
            </label>
            {ehCompraInsumos ? (
              fornecedores.length > 0 ? (
                <label className="fin-field">
                  <span>Fornecedor do estoque (opcional)</span>
                  <select
                    value={formNova.fornecedorId}
                    onChange={(e) => setFormNova((p) => ({ ...p, fornecedorId: e.target.value }))}
                  >
                    <option value="">— Não vincular —</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                  <span className="fin-field__hint">
                    Cadastro em Estoque → Fornecedores (somente quem vende peças/insumos).
                  </span>
                </label>
              ) : (
                <p className="fin-field__hint fin-field__hint--block">
                  Sem fornecedores no estoque. Cadastre em Estoque se quiser vincular a compra de peças.
                </p>
              )
            ) : (
              <label className="fin-field">
                <span>Credor</span>
                <input
                  value={formNova.credorNome}
                  onChange={(e) => setFormNova((p) => ({ ...p, credorNome: e.target.value }))}
                  placeholder={CREDOR_PLACEHOLDER[formNova.categoria] ?? 'Quem recebe o pagamento'}
                />
                <span className="fin-field__hint">
                  Não precisa cadastrar no estoque. Ex.: concessionária, proprietário, contador.
                </span>
              </label>
            )}
            <div className="fin-field-row">
              <label className="fin-field">
                <span>Valor (R$)</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={formNova.valor}
                  onChange={(e) => setFormNova((p) => ({ ...p, valor: e.target.value }))}
                  required
                />
              </label>
              <label className="fin-field">
                <span>Vencimento</span>
                <input
                  type="date"
                  value={formNova.vencimento}
                  onChange={(e) => setFormNova((p) => ({ ...p, vencimento: e.target.value }))}
                  required
                />
              </label>
            </div>

            <div className="fin-rec-block">
              <label className="fin-rec-toggle">
                <input
                  type="checkbox"
                  checked={formNova.recorrente}
                  onChange={(e) => setFormNova((p) => ({ ...p, recorrente: e.target.checked }))}
                />
                <span>Despesa recorrente (vários vencimentos)</span>
              </label>
              {formNova.recorrente ? (
                <div className="fin-rec-fields">
                  <label className="fin-field">
                    <span>Repetir</span>
                    <select
                      value={formNova.frequencia}
                      onChange={(e) =>
                        setFormNova((p) => ({
                          ...p,
                          frequencia: e.target.value as FrequenciaRecorrencia,
                        }))
                      }
                    >
                      <option value="mensal">Mensal</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="anual">Anual</option>
                    </select>
                  </label>
                  <label className="fin-field">
                    <span>Quantidade de parcelas</span>
                    <input
                      type="number"
                      min={2}
                      max={36}
                      value={formNova.parcelas}
                      onChange={(e) => setFormNova((p) => ({ ...p, parcelas: e.target.value }))}
                    />
                    <span className="fin-field__hint">
                      Primeiro vencimento = campo acima. Serão criadas contas separadas (ex.: aluguel
                      12 meses).
                    </span>
                  </label>
                  {previewRecorrencia ? (
                    <p className="fin-rec-preview" role="status">
                      Serão criadas <strong>{previewRecorrencia.qtd}</strong> contas de{' '}
                      {previewRecorrencia.valor ? formatBRL(previewRecorrencia.valor) : '…'} cada, até{' '}
                      <strong>{formatDate(previewRecorrencia.ultima)}</strong>.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <label className="fin-field">
              <span>Observação</span>
              <input
                value={formNova.observacao}
                onChange={(e) => setFormNova((p) => ({ ...p, observacao: e.target.value }))}
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalNova(false)}>
                Voltar
              </button>
              <button type="submit" className="cp-btn cp-btn--primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modalPagar ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalPagar(null)}>
          <form
            className="fin-modal"
            role="dialog"
            aria-labelledby="fin-modal-pagar-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handlePagar(e)}
          >
            <h2 id="fin-modal-pagar-titulo" className="fin-modal__title">
              Registrar pagamento
            </h2>
            <p className="fin-modal__sub">
              {modalPagar.descricao} · <strong>{formatBRL(modalPagar.valor)}</strong>
            </p>
            <label className="fin-field">
              <span>Pagar com</span>
              <select value={contaPagarId} onChange={(e) => setContaPagarId(e.target.value)} required>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="fin-field">
              <span>Data do pagamento</span>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                required
              />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setModalPagar(null)}>
                Voltar
              </button>
              <button type="submit" className="cp-btn cp-btn--primary" disabled={!!processandoId}>
                {processandoId ? 'Registrando…' : 'Confirmar pagamento'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

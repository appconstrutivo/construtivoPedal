import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ClientePicker } from '../components/ClientePicker'
import { EstoqueItemPicker } from '../components/EstoqueItemPicker'
import { PagamentoMistoFields, validarPagamentoMisto } from '../components/PagamentoMistoFields'
import { novaLinhaPagamento, type PagamentoLinha } from '../lib/pagamento-misto'
import {
  MSG_QUANTIDADE_INTEIRA,
  filtrarInputQuantidadeInteira,
  parseQuantidadeInteira,
} from '../lib/quantidade'
import { listarClientes, type ClienteComRelacoes } from '../services/clientes.service'
import { listarItensEstoque, type EstoqueItemComLocal } from '../services/estoque.service'
import {
  adicionarChecklistItem,
  adicionarOsItem,
  atualizarChecklistItem,
  atualizarOrdemServico,
  baixarPecaNaOs,
  carregarOrdemDetalhe,
  criarOrdemServico,
  excluirAnexoOs,
  excluirChecklistItem,
  excluirOrdemServico,
  excluirOsItem,
  listarOrdensServico,
  OS_CLIENTE_BALCAO,
  STATUS_OS_ABERTAS,
  type OrdemServicoDetalhe,
  type OrdemServicoLista,
  type OsItemRow,
  type StatusOrdemServico,
  uploadAnexoOs,
} from '../services/oficina.service'
import { listarCatalogoServicos, type CatalogoServicoRow } from '../services/catalogo-servicos.service'
import {
  cancelarContaReceber,
  faturarOs,
  garantirContaCaixa,
  labelFormaRecebimento,
  labelStatusContaReceber,
  listarContasFinanceiras,
  obterContaReceberPorOs,
  registrarRecebimentoConta,
  type ContaReceber,
} from '../services/financeiro.service'
import { ServicosCatalogoPage } from './ServicosCatalogoPage'

type FiltroLista = 'todas' | 'abertas' | 'encerradas'
type AbaOficina = 'ordens' | 'catalogo'

const STATUS_OPTIONS: { value: StatusOrdemServico; label: string }[] = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_aprovacao', label: 'Aguardando cliente' },
  { value: 'pronta', label: 'Pronta' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelada', label: 'Cancelada' },
]

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}

function statusChipClass(s: string) {
  if (s === 'aberta') return 'os-chip os-chip--open'
  if (s === 'em_andamento') return 'os-chip os-chip--progress'
  if (s === 'aguardando_aprovacao') return 'os-chip os-chip--wait'
  if (s === 'pronta') return 'os-chip os-chip--ready'
  if (s === 'entregue') return 'os-chip os-chip--done'
  if (s === 'cancelada') return 'os-chip os-chip--cancel'
  return 'os-chip'
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/** Campo monetário: vazio = usar padrão (ex.: custo médio da peça). */
function parseMoneyInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

type OficinaPageProps = {
  companyId: string
  activeStoreId: string
}

export function OficinaPage({ companyId, activeStoreId }: OficinaPageProps) {
  const [abaOficina, setAbaOficina] = useState<AbaOficina>('ordens')
  const [lista, setLista] = useState<OrdemServicoLista[]>([])
  const [filtro, setFiltro] = useState<FiltroLista>('abertas')
  const [busca, setBusca] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<OrdemServicoDetalhe | null>(null)
  const [loadingLista, setLoadingLista] = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [clientes, setClientes] = useState<ClienteComRelacoes[]>([])
  const [itensEstoque, setItensEstoque] = useState<EstoqueItemComLocal[]>([])
  const [catalogoServicos, setCatalogoServicos] = useState<CatalogoServicoRow[]>([])

  const [modalNovaOpen, setModalNovaOpen] = useState(false)
  const [novaOsSalvando, setNovaOsSalvando] = useState(false)
  const [novaOs, setNovaOs] = useState({
    clienteId: '',
    bicicletaId: '',
    problema: '',
  })

  const [formDetalhe, setFormDetalhe] = useState({
    status: 'aberta' as StatusOrdemServico,
    problema: '',
    diagnostico: '',
    observacoes: '',
  })
  const [salvandoCabecalho, setSalvandoCabecalho] = useState(false)
  const [excluindoOs, setExcluindoOs] = useState(false)

  const [checkNovoRotulo, setCheckNovoRotulo] = useState('')
  const [pecaForm, setPecaForm] = useState({ itemId: '', qtd: '1', descricao: '', preco: '' })
  const [servicoForm, setServicoForm] = useState({
    catalogoId: '',
    desc: '',
    qtd: '1',
    preco: '0',
  })
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [contaReceberOs, setContaReceberOs] = useState<ContaReceber | null>(null)
  const [busyFinanceiro, setBusyFinanceiro] = useState(false)
  const [modalFaturar, setModalFaturar] = useState(false)
  const [modalReceberOs, setModalReceberOs] = useState(false)
  const [faturarVencimento, setFaturarVencimento] = useState(() => new Date().toISOString().slice(0, 10))
  const [receberContaId, setReceberContaId] = useState('')
  const [pagamentosReceber, setPagamentosReceber] = useState<PagamentoLinha[]>(() => [novaLinhaPagamento('pix')])
  const [receberData, setReceberData] = useState(() => new Date().toISOString().slice(0, 10))
  const [faturarEReceber, setFaturarEReceber] = useState(false)
  const [contasFinOpts, setContasFinOpts] = useState<{ id: string; nome: string }[]>([])

  const carregarLista = useCallback(async (opts?: { silencioso?: boolean }) => {
    if (!opts?.silencioso) {
      setLoadingLista(true)
      setErro(null)
    }
    try {
      const rows = await listarOrdensServico(companyId, activeStoreId)
      setLista(rows)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar OS.')
    } finally {
      if (!opts?.silencioso) setLoadingLista(false)
    }
  }, [companyId, activeStoreId])

  const carregarContexto = useCallback(async () => {
    try {
      const [c, it, svc] = await Promise.all([
        activeStoreId ? listarClientes(companyId, activeStoreId) : Promise.resolve([]),
        listarItensEstoque(companyId, activeStoreId),
        activeStoreId
          ? listarCatalogoServicos(companyId, { somenteAtivos: false, storeId: activeStoreId })
          : Promise.resolve([]),
      ])
      setClientes(c)
      setItensEstoque(it.filter((i) => i.categoria === 'peca' || i.categoria === 'acessorio' || i.categoria === 'componente'))
      setCatalogoServicos(svc)
    } catch {
      /* lista principal já exibe erro */
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    void carregarLista()
    void carregarContexto()
  }, [carregarLista, carregarContexto])

  const carregarFaturamentoOs = useCallback(
    async (osId: string) => {
      try {
        const cr = await obterContaReceberPorOs(companyId, osId)
        setContaReceberOs(cr)
      } catch {
        setContaReceberOs(null)
      }
    },
    [companyId],
  )

  const recarregarDetalhe = useCallback(
    async (osId: string, opts?: { silencioso?: boolean }) => {
      if (!opts?.silencioso) {
        setLoadingDetalhe(true)
        setErro(null)
      }
      try {
        const d = await carregarOrdemDetalhe(companyId, osId)
        setDetalhe(d)
        if (d) {
          setFormDetalhe({
            status: d.status as StatusOrdemServico,
            problema: d.problema_relatado ?? '',
            diagnostico: d.diagnostico ?? '',
            observacoes: d.observacoes_internas ?? '',
          })
          void carregarFaturamentoOs(d.id)
        } else {
          setContaReceberOs(null)
        }
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar detalhe.')
      } finally {
        if (!opts?.silencioso) setLoadingDetalhe(false)
      }
    },
    [companyId, carregarFaturamentoOs],
  )

  useEffect(() => {
    if (!selectedId) {
      setDetalhe(null)
      setContaReceberOs(null)
      return
    }
    void recarregarDetalhe(selectedId)
  }, [selectedId, recarregarDetalhe])

  const listaFiltrada = useMemo(() => {
    let rows = lista
    if (filtro === 'abertas') {
      rows = rows.filter((r) => STATUS_OS_ABERTAS.includes(r.status as StatusOrdemServico))
    } else if (filtro === 'encerradas') {
      rows = rows.filter((r) => r.status === 'entregue' || r.status === 'cancelada')
    }
    const q = busca.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      if (r.clienteNome.toLowerCase().includes(q)) return true
      if (!r.cliente_id && OS_CLIENTE_BALCAO.toLowerCase().includes(q)) return true
      if (String(r.numero).includes(q)) return true
      if (r.bikeLabel && r.bikeLabel.toLowerCase().includes(q)) return true
      return false
    })
  }, [lista, filtro, busca])

  const servicosAtivosParaOs = useMemo(
    () => catalogoServicos.filter((s) => s.ativo),
    [catalogoServicos],
  )

  const totalOsValor = useMemo(() => {
    if (!detalhe?.itens.length) return 0
    return detalhe.itens.reduce(
      (acc, it) => acc + Number(it.preco_unitario) * Number(it.quantidade),
      0,
    )
  }, [detalhe?.itens])

  const podeFaturarOs =
    !!detalhe &&
    (detalhe.status === 'pronta' || detalhe.status === 'entregue') &&
    totalOsValor > 0 &&
    !contaReceberOs

  useEffect(() => {
    if (listaFiltrada.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !listaFiltrada.some((r) => r.id === selectedId)) {
      setSelectedId(listaFiltrada[0].id)
    }
  }, [listaFiltrada, selectedId])

  async function handleSalvarCabecalho() {
    if (!detalhe) return
    setSalvandoCabecalho(true)
    setErro(null)
    try {
      await atualizarOrdemServico(detalhe.id, {
        status: formDetalhe.status,
        store_id: activeStoreId,
        problema_relatado: formDetalhe.problema,
        diagnostico: formDetalhe.diagnostico || null,
        observacoes_internas: formDetalhe.observacoes || null,
        closed_at:
          formDetalhe.status === 'entregue' || formDetalhe.status === 'cancelada'
            ? detalhe.closed_at ?? new Date().toISOString()
            : null,
      })
      if (formDetalhe.status === 'cancelada' && contaReceberOs?.status === 'pendente') {
        await cancelarContaReceber(contaReceberOs.id)
      }
      await carregarLista({ silencioso: true })
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvandoCabecalho(false)
    }
  }

  async function abrirModalReceberOs() {
    if (!detalhe || !contaReceberOs || contaReceberOs.status !== 'pendente') return
    setErro(null)
    try {
      await garantirContaCaixa(companyId, activeStoreId)
      const contas = await listarContasFinanceiras(companyId, activeStoreId)
      setContasFinOpts(contas.map((c) => ({ id: c.id, nome: c.nome })))
      const caixa = contas.find((c) => c.tipo === 'caixa') ?? contas[0]
      if (caixa) setReceberContaId(caixa.id)
      setPagamentosReceber([novaLinhaPagamento('pix')])
      setReceberData(new Date().toISOString().slice(0, 10))
      setModalReceberOs(true)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao preparar recebimento.')
    }
  }

  async function handleConfirmarFaturar(e: React.FormEvent) {
    e.preventDefault()
    if (!detalhe || !activeStoreId) return
    setBusyFinanceiro(true)
    setErro(null)
    try {
      const crId = await faturarOs(detalhe.id, faturarVencimento)
      if (faturarEReceber) {
        const { ok, parsed } = validarPagamentoMisto(totalOsValor, pagamentosReceber)
        if (!ok) throw new Error('Confira os valores de cada forma de pagamento.')
        await garantirContaCaixa(companyId, activeStoreId)
        const contas = await listarContasFinanceiras(companyId, activeStoreId)
        const caixaId =
          receberContaId || contas.find((c) => c.tipo === 'caixa')?.id || contas[0]?.id
        if (!caixaId) throw new Error('Cadastre uma conta de caixa no Financeiro.')
        if (!receberContaId) setReceberContaId(caixaId)
        await registrarRecebimentoConta({
          contaReceberId: crId,
          contaFinanceiraId: caixaId,
          pagamentos: parsed,
          dataRecebimento: receberData,
        })
      }
      setModalFaturar(false)
      setFaturarEReceber(false)
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao faturar OS.')
    } finally {
      setBusyFinanceiro(false)
    }
  }

  async function handleConfirmarReceberOs(e: React.FormEvent) {
    e.preventDefault()
    if (!detalhe || !contaReceberOs || !receberContaId) return
    const { ok, parsed } = validarPagamentoMisto(contaReceberOs.valor, pagamentosReceber)
    if (!ok) {
      setErro('Confira os valores de cada forma de pagamento.')
      return
    }
    setBusyFinanceiro(true)
    setErro(null)
    try {
      const res = await registrarRecebimentoConta({
        contaReceberId: contaReceberOs.id,
        contaFinanceiraId: receberContaId,
        pagamentos: parsed,
        dataRecebimento: receberData,
      })
      setModalReceberOs(false)
      if (res.vendaNumero) {
        setErro(null)
      }
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar recebimento.')
    } finally {
      setBusyFinanceiro(false)
    }
  }

  async function handleExcluirOs() {
    if (!detalhe) return
    const ok = window.confirm(
      `Excluir a OS #${detalhe.numero} (${detalhe.clienteNome})?\n\nEsta ação não pode ser desfeita. Checklist, itens e fotos serão removidos.`,
    )
    if (!ok) return
    setExcluindoOs(true)
    setErro(null)
    try {
      await excluirOrdemServico(companyId, detalhe.id)
      setDetalhe(null)
      setSelectedId(null)
      await carregarLista()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao excluir OS.')
    } finally {
      setExcluindoOs(false)
    }
  }

  async function handleNovaOs() {
    setNovaOsSalvando(true)
    setErro(null)
    try {
      const row = await criarOrdemServico({
        company_id: companyId,
        cliente_id: novaOs.clienteId.trim() || null,
        bicicleta_id: novaOs.bicicletaId || null,
        store_id: activeStoreId,
        problema_relatado: novaOs.problema.trim() || '—',
        status: 'aberta',
      })
      setModalNovaOpen(false)
      setNovaOs({ clienteId: '', bicicletaId: '', problema: '' })
      await carregarLista()
      setSelectedId(row.id)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar OS.')
    } finally {
      setNovaOsSalvando(false)
    }
  }

  const bikesDoCliente = useMemo(() => {
    const c = clientes.find((x) => x.id === novaOs.clienteId)
    return c?.bicicletas ?? []
  }, [clientes, novaOs.clienteId])

  async function addChecklist() {
    if (!detalhe || !checkNovoRotulo.trim()) return
    setErro(null)
    try {
      const ordem = detalhe.checklist.length
      await adicionarChecklistItem({
        company_id: companyId,
        os_id: detalhe.id,
        rotulo: checkNovoRotulo.trim(),
        ordem,
      })
      setCheckNovoRotulo('')
      await recarregarDetalhe(detalhe.id, { silencioso: true })
      await carregarLista({ silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao adicionar checklist.')
    }
  }

  async function toggleCheck(i: { id: string; concluido: boolean }) {
    if (!detalhe) return
    setErro(null)
    try {
      await atualizarChecklistItem(i.id, { concluido: !i.concluido })
      await recarregarDetalhe(detalhe.id, { silencioso: true })
      await carregarLista({ silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao atualizar checklist.')
    }
  }

  async function removerCheck(id: string) {
    if (!detalhe) return
    try {
      await excluirChecklistItem(id)
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao remover.')
    }
  }

  function precoVendaPeca(item: EstoqueItemComLocal) {
    return Number(item.preco_varejo) || Number(item.custo_medio) || 0
  }

  function selecionarPecaEstoque(id: string) {
    const it = id ? itensEstoque.find((x) => x.id === id) : undefined
    setPecaForm((f) => ({
      ...f,
      itemId: id,
      descricao: it?.nome ?? '',
      preco: it ? String(precoVendaPeca(it)) : '',
    }))
  }

  async function addPeca() {
    if (!detalhe || !pecaForm.itemId) return
    const item = itensEstoque.find((x) => x.id === pecaForm.itemId)
    const q = parseQuantidadeInteira(pecaForm.qtd)
    if (!(q > 0)) {
      setErro(MSG_QUANTIDADE_INTEIRA)
      return
    }
    setErro(null)
    const precoExplicito = parseMoneyInput(pecaForm.preco)
    const precoUnit =
      precoExplicito !== null
        ? precoExplicito
        : item
          ? precoVendaPeca(item)
          : 0
    try {
      await adicionarOsItem({
        company_id: companyId,
        os_id: detalhe.id,
        tipo: 'peca',
        estoque_item_id: pecaForm.itemId,
        descricao: (pecaForm.descricao.trim() || item?.nome || 'Peça').slice(0, 500),
        quantidade: q,
        preco_unitario: precoUnit,
      })
      setPecaForm({ itemId: '', qtd: '1', descricao: '', preco: '' })
      await recarregarDetalhe(detalhe.id, { silencioso: true })
      await carregarLista({ silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao adicionar peça.')
    }
  }

  async function addServico() {
    if (!detalhe) return
    const q = parseQuantidadeInteira(servicoForm.qtd)
    const p = parseMoneyInput(servicoForm.preco) ?? 0
    if (!(q > 0)) {
      setErro(MSG_QUANTIDADE_INTEIRA)
      return
    }
    const cat = servicoForm.catalogoId
      ? catalogoServicos.find((s) => s.id === servicoForm.catalogoId)
      : undefined
    const nomeLinha = (servicoForm.desc.trim() || cat?.nome || '').trim()
    if (!nomeLinha) {
      setErro('Escolha um serviço no catálogo ou digite a descrição do serviço.')
      return
    }
    setErro(null)
    try {
      await adicionarOsItem({
        company_id: companyId,
        os_id: detalhe.id,
        tipo: 'servico',
        estoque_item_id: null,
        servico_catalogo_id: cat?.id ?? null,
        descricao: nomeLinha.slice(0, 500),
        quantidade: q,
        preco_unitario: p,
      })
      setServicoForm({ catalogoId: '', desc: '', qtd: '1', preco: '0' })
      await recarregarDetalhe(detalhe.id, { silencioso: true })
      await carregarLista({ silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao adicionar serviço.')
    }
  }

  async function baixarItem(row: OsItemRow) {
    if (!detalhe) return
    setBusyItemId(row.id)
    setErro(null)
    try {
      await baixarPecaNaOs(row.id)
      await recarregarDetalhe(detalhe.id, { silencioso: true })
      await carregarLista({ silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro na baixa de estoque.')
    } finally {
      setBusyItemId(null)
    }
  }

  async function removerItem(row: OsItemRow) {
    if (!detalhe) return
    try {
      await excluirOsItem(row)
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao remover item.')
    }
  }

  async function onUploadFoto(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file || !detalhe) return
    setErro(null)
    try {
      await uploadAnexoOs(companyId, detalhe.id, file)
      ev.target.value = ''
      await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro no upload.')
    }
  }

  async function removerFoto(anexo: OrdemServicoDetalhe['anexos'][0]) {
    try {
      await excluirAnexoOs(anexo)
      if (detalhe) await recarregarDetalhe(detalhe.id, { silencioso: true })
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao remover foto.')
    }
  }

  return (
    <div className="cp-page cp-page--dash cp-page--oficina">
      <header className="oficina-topbar">
        <div className="oficina-segmented" role="tablist" aria-label="Seções da oficina">
          <button
            type="button"
            role="tab"
            aria-selected={abaOficina === 'ordens'}
            className={
              abaOficina === 'ordens'
                ? 'oficina-segmented__btn oficina-segmented__btn--on'
                : 'oficina-segmented__btn'
            }
            onClick={() => setAbaOficina('ordens')}
          >
            Ordens de serviço
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={abaOficina === 'catalogo'}
            className={
              abaOficina === 'catalogo'
                ? 'oficina-segmented__btn oficina-segmented__btn--on'
                : 'oficina-segmented__btn'
            }
            onClick={() => setAbaOficina('catalogo')}
          >
            Catálogo de serviços
          </button>
        </div>
        {abaOficina === 'ordens' ? (
          <button
            type="button"
            className="st-primary-btn oficina-topbar__cta"
            onClick={() => {
              setErro(null)
              setModalNovaOpen(true)
            }}
          >
            Nova OS
          </button>
        ) : null}
      </header>

      {abaOficina === 'catalogo' ? (
        <ServicosCatalogoPage
          companyId={companyId}
          activeStoreId={activeStoreId}
          onCatalogChanged={() => void carregarContexto()}
        />
      ) : (
        <>
          {erro ? (
            <div className="st-form-error" role="alert" style={{ marginBottom: '0.75rem' }}>
              {erro}
            </div>
          ) : null}

          <div className="os-layout">
        <aside className="os-aside">
          <div className="os-aside__toolbar">
            <input
              type="search"
              className="os-search"
              placeholder="Buscar por cliente, nº ou bike…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="os-filter-row">
              {(
                [
                  ['abertas', 'Abertas'],
                  ['todas', 'Todas'],
                  ['encerradas', 'Encerradas'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filtro === key ? 'os-filter os-filter--on' : 'os-filter'}
                  onClick={() => setFiltro(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="os-list" role="list">
            {loadingLista ? (
              <p className="os-muted">Carregando…</p>
            ) : listaFiltrada.length === 0 ? (
              <p className="os-muted">Nenhuma OS neste filtro.</p>
            ) : (
              listaFiltrada.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  className={selectedId === r.id ? 'os-list-item os-list-item--active' : 'os-list-item'}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="os-list-item__top">
                    <span className="os-list-item__num">#{r.numero}</span>
                    <span className={statusChipClass(r.status)}>{statusLabel(r.status)}</span>
                  </div>
                  <div className="os-list-item__name">{r.clienteNome}</div>
                  {r.bikeLabel ? <div className="os-list-item__sub">{r.bikeLabel}</div> : null}
                  <div className="os-list-item__meta">{formatShortDate(r.updated_at)}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="os-detail">
          {loadingDetalhe ? (
            <p className="os-muted">Carregando OS…</p>
          ) : !detalhe ? (
            <div className="cp-panel cp-panel--muted">
              <p className="cp-panel__hint">Selecione uma ordem de serviço ou abra uma nova.</p>
            </div>
          ) : (
            <>
              <div className="os-detail__head">
                <div>
                  <h2 className="os-detail__title">
                    OS #{detalhe.numero}{' '}
                    <span className="os-detail__client">— {detalhe.clienteNome}</span>
                  </h2>
                  {detalhe.bikeLabel ? (
                    <p className="os-detail__bike">{detalhe.bikeLabel}</p>
                  ) : (
                    <p className="os-detail__bike os-detail__bike--muted">Sem bicicleta vinculada</p>
                  )}
                </div>
                <button
                  type="button"
                  className="os-danger-btn"
                  disabled={excluindoOs || salvandoCabecalho}
                  onClick={() => void handleExcluirOs()}
                >
                  {excluindoOs ? 'Excluindo…' : 'Excluir OS'}
                </button>
              </div>

              <div className="os-detail__grid">
                <div className="os-card">
                  <h3 className="os-card__title">Situação</h3>
                  <label className="os-field">
                    <span>Status</span>
                    <select
                      className="os-input"
                      value={formDetalhe.status}
                      disabled={detalhe.status === 'cancelada'}
                      onChange={(e) =>
                        setFormDetalhe((f) => ({ ...f, status: e.target.value as StatusOrdemServico }))
                      }
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="os-field">
                    <span>Problema relatado</span>
                    <textarea
                      className="os-input os-input--area"
                      rows={3}
                      value={formDetalhe.problema}
                      onChange={(e) => setFormDetalhe((f) => ({ ...f, problema: e.target.value }))}
                    />
                  </label>
                  <label className="os-field">
                    <span>Diagnóstico</span>
                    <textarea
                      className="os-input os-input--area"
                      rows={3}
                      value={formDetalhe.diagnostico}
                      onChange={(e) => setFormDetalhe((f) => ({ ...f, diagnostico: e.target.value }))}
                    />
                  </label>
                  <label className="os-field">
                    <span>Obs. internas</span>
                    <textarea
                      className="os-input os-input--area"
                      rows={2}
                      value={formDetalhe.observacoes}
                      onChange={(e) => setFormDetalhe((f) => ({ ...f, observacoes: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    className="st-primary-btn"
                    disabled={salvandoCabecalho}
                    onClick={() => void handleSalvarCabecalho()}
                  >
                    {salvandoCabecalho ? 'Salvando…' : 'Salvar dados da OS'}
                  </button>
                </div>

                <div className="os-card">
                  <h3 className="os-card__title">Checklist</h3>
                  <ul className="os-checklist">
                    {detalhe.checklist.map((i) => (
                      <li key={i.id} className="os-checklist__row">
                        <label className="os-check-label">
                          <input type="checkbox" checked={i.concluido} onChange={() => void toggleCheck(i)} />
                          <span>{i.rotulo}</span>
                        </label>
                        <button
                          type="button"
                          className="os-icon-btn"
                          aria-label="Remover item"
                          onClick={() => void removerCheck(i.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="os-inline-add">
                    <input
                      className="os-input"
                      placeholder="Novo item (ex.: testar freios)"
                      value={checkNovoRotulo}
                      onChange={(e) => setCheckNovoRotulo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addChecklist()
                      }}
                    />
                    <button type="button" className="st-ghost-btn" onClick={() => void addChecklist()}>
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="os-card os-card--wide">
                  <h3 className="os-card__title">Peças e serviços</h3>
                  <div className="os-split-2">
                    <div>
                      <p className="os-mini-title">Peça (estoque)</p>
                      <EstoqueItemPicker
                        itens={itensEstoque}
                        value={pecaForm.itemId}
                        onChange={selecionarPecaEstoque}
                      />
                      <label className="os-field">
                        <span>Quantidade</span>
                        <input
                          className="os-input"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={pecaForm.qtd}
                          onChange={(e) =>
                            setPecaForm((f) => ({
                              ...f,
                              qtd: filtrarInputQuantidadeInteira(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="os-field">
                        <span>Preço unitário na OS (R$)</span>
                        <input
                          className="os-input"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={pecaForm.preco}
                          onChange={(e) => setPecaForm((f) => ({ ...f, preco: e.target.value }))}
                        />
                      </label>
                      <label className="os-field">
                        <span>Descrição na linha (opcional)</span>
                        <input
                          className="os-input"
                          placeholder={pecaForm.itemId ? 'Sobrescreve o nome exibido' : 'Selecione uma peça'}
                          value={pecaForm.descricao}
                          onChange={(e) => setPecaForm((f) => ({ ...f, descricao: e.target.value }))}
                        />
                      </label>
                      <button type="button" className="st-ghost-btn" onClick={() => void addPeca()}>
                        Incluir peça
                      </button>
                    </div>
                    <div>
                      <p className="os-mini-title">Serviço / mão de obra</p>
                      <label className="os-field">
                        <span>Serviço do catálogo</span>
                        <select
                          className="os-input"
                          value={servicoForm.catalogoId}
                          onChange={(e) => {
                            const id = e.target.value
                            if (!id) {
                              setServicoForm({ catalogoId: '', desc: '', qtd: '1', preco: '0' })
                              return
                            }
                            const svc = servicosAtivosParaOs.find((s) => s.id === id)
                            setServicoForm({
                              catalogoId: id,
                              desc: svc?.nome ?? '',
                              qtd: '1',
                              preco: svc != null ? String(Number(svc.preco_sugerido)) : '0',
                            })
                          }}
                        >
                          <option value="">
                            {servicosAtivosParaOs.length === 0
                              ? '— Sem serviços ativos: use avulso ou cadastre na aba Catálogo —'
                              : '— Serviço avulso (descrição livre abaixo) —'}
                          </option>
                          {servicosAtivosParaOs.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome} — {formatBRL(Number(s.preco_sugerido))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="os-field">
                        <span>Descrição na linha da OS</span>
                        <input
                          className="os-input"
                          placeholder="Preenchida pelo catálogo ou digite à mão (serviço avulso)"
                          value={servicoForm.desc}
                          onChange={(e) => setServicoForm((f) => ({ ...f, desc: e.target.value }))}
                        />
                      </label>
                      <label className="os-field">
                        <span>Quantidade</span>
                        <input
                          className="os-input"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={servicoForm.qtd}
                          onChange={(e) =>
                            setServicoForm((f) => ({
                              ...f,
                              qtd: filtrarInputQuantidadeInteira(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="os-field">
                        <span>Preço unitário na OS (R$)</span>
                        <input
                          className="os-input"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={servicoForm.preco}
                          onChange={(e) => setServicoForm((f) => ({ ...f, preco: e.target.value }))}
                        />
                      </label>
                      <button type="button" className="st-ghost-btn" onClick={() => void addServico()}>
                        Incluir serviço
                      </button>
                    </div>
                  </div>

                  <table className="os-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th title="Quantidade × preço unitário">Total (R$)</th>
                        <th>Estoque</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.itens.map((it) => (
                        <tr key={it.id}>
                          <td>{it.tipo === 'peca' ? 'Peça' : 'Serviço'}</td>
                          <td>
                            <span className="os-table__desc">{it.descricao}</span>
                            {it.tipo === 'servico' ? (
                              <span className="os-table__src">
                                {it.servico_catalogo_id ? 'Origem: catálogo da oficina' : 'Origem: serviço avulso'}
                              </span>
                            ) : null}
                          </td>
                          <td>{it.quantidade}</td>
                          <td>{formatBRL(Number(it.preco_unitario) * Number(it.quantidade))}</td>
                          <td>
                            {it.tipo === 'peca' && it.estoque_item_id
                              ? it.movimentacao_id
                                ? 'Baixado'
                                : 'Pendente'
                              : '—'}
                          </td>
                          <td className="os-table__actions">
                            {it.tipo === 'peca' && it.estoque_item_id && !it.movimentacao_id ? (
                              <button
                                type="button"
                                className="st-primary-btn st-primary-btn--sm"
                                disabled={
                                  busyItemId === it.id || detalhe.status === 'cancelada'
                                }
                                onClick={() => void baixarItem(it)}
                              >
                                {busyItemId === it.id ? '…' : 'Baixar'}
                              </button>
                            ) : null}
                            {!it.movimentacao_id ? (
                              <button type="button" className="os-icon-btn" onClick={() => void removerItem(it)}>
                                Remover
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {detalhe.itens.length > 0 ? (
                      <tfoot>
                        <tr className="os-table__total-row">
                          <td colSpan={3} className="os-table__total-label">
                            Total da OS
                          </td>
                          <td className="os-table__total-value">{formatBRL(totalOsValor)}</td>
                          <td colSpan={2} className="os-table__total-pad" />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <div className="os-card os-card--wide os-finance">
                  <h3 className="os-card__title">Faturamento</h3>
                  <p className="os-hint">
                    Gera conta a receber no Financeiro. Ao receber, o valor entra no caixa e aparece em
                    Lançamentos (venda vinculada à OS).
                  </p>
                  {contaReceberOs ? (
                    <div className="os-finance__status">
                      <span
                        className={
                          contaReceberOs.status === 'recebido'
                            ? 'os-chip os-chip--done'
                            : 'os-chip os-chip--wait'
                        }
                      >
                        {labelStatusContaReceber(contaReceberOs.status)}
                      </span>
                      <strong>{formatBRL(contaReceberOs.valor)}</strong>
                      {contaReceberOs.status === 'pendente' ? (
                        <span className="os-finance__meta">
                          Vencimento {formatShortDate(contaReceberOs.vencimento)}
                        </span>
                      ) : null}
                      {contaReceberOs.status === 'recebido' ? (
                        <span className="os-finance__meta">
                          {labelFormaRecebimento(contaReceberOs.forma_pagamento)}
                          {contaReceberOs.vendaNumero ? ` · Venda #${contaReceberOs.vendaNumero}` : ''}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="os-muted">OS ainda não faturada.</p>
                  )}
                  <div className="os-finance__actions">
                    {podeFaturarOs ? (
                      <button
                        type="button"
                        className="st-primary-btn"
                        onClick={() => {
                          setFaturarVencimento(new Date().toISOString().slice(0, 10))
                          setFaturarEReceber(false)
                          setPagamentosReceber([novaLinhaPagamento('pix')])
                          setModalFaturar(true)
                        }}
                      >
                        Faturar OS
                      </button>
                    ) : null}
                    {contaReceberOs?.status === 'pendente' ? (
                      <button
                        type="button"
                        className="st-primary-btn"
                        onClick={() => void abrirModalReceberOs()}
                      >
                        Registrar recebimento
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="os-card os-card--wide">
                  <h3 className="os-card__title">Fotos</h3>
                  <p className="os-hint">Imagens ficam no Storage privado (`os-fotos`), isoladas por empresa.</p>
                  <label className="os-file">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={detalhe.status === 'cancelada'}
                      onChange={(e) => void onUploadFoto(e)}
                    />
                    <span>Anexar imagem</span>
                  </label>
                  <div className="os-gallery">
                    {detalhe.anexos.map((a) => (
                      <figure key={a.id} className="os-thumb">
                        {a.urlAssinada ? (
                          <img src={a.urlAssinada} alt={a.nome_arquivo} />
                        ) : (
                          <div className="os-thumb__ph">{a.nome_arquivo}</div>
                        )}
                        <figcaption>{a.nome_arquivo}</figcaption>
                        <button
                          type="button"
                          className="os-thumb__rm"
                          onClick={() => void removerFoto(a)}
                        >
                          Excluir
                        </button>
                      </figure>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
      )}

      {modalFaturar && detalhe ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalFaturar(false)}>
          <form
            className="fin-modal"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleConfirmarFaturar(e)}
          >
            <h2 className="fin-modal__title">Faturar OS #{detalhe.numero}</h2>
            <p className="fin-modal__hint">Total: {formatBRL(totalOsValor)}</p>
            <label className="fin-field">
              <span>Vencimento</span>
              <input type="date" value={faturarVencimento} onChange={(e) => setFaturarVencimento(e.target.value)} required />
            </label>
            <label className="fin-rec-toggle">
              <input type="checkbox" checked={faturarEReceber} onChange={(e) => setFaturarEReceber(e.target.checked)} />
              <span>Receber agora (à vista)</span>
            </label>
            {faturarEReceber ? (
              <>
                <PagamentoMistoFields
                  total={totalOsValor}
                  linhas={pagamentosReceber}
                  onChange={setPagamentosReceber}
                />
                <label className="fin-field">
                  <span>Data do recebimento</span>
                  <input type="date" value={receberData} onChange={(e) => setReceberData(e.target.value)} required />
                </label>
              </>
            ) : null}
            <div className="fin-modal__actions">
              <button type="button" className="st-ghost-btn" onClick={() => setModalFaturar(false)}>Cancelar</button>
              <button
                type="submit"
                className="st-primary-btn"
                disabled={
                  busyFinanceiro ||
                  (faturarEReceber && !validarPagamentoMisto(totalOsValor, pagamentosReceber).ok)
                }
              >
                {busyFinanceiro ? '…' : faturarEReceber ? 'Faturar e receber' : 'Faturar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modalReceberOs && contaReceberOs ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={() => setModalReceberOs(false)}>
          <form className="fin-modal" role="dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void handleConfirmarReceberOs(e)}>
            <h2 className="fin-modal__title">Receber {formatBRL(contaReceberOs.valor)}</h2>
            <label className="fin-field">
              <span>Conta / caixa</span>
              <select value={receberContaId} onChange={(e) => setReceberContaId(e.target.value)} required>
                {contasFinOpts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <PagamentoMistoFields
              total={contaReceberOs.valor}
              linhas={pagamentosReceber}
              onChange={setPagamentosReceber}
            />
            <label className="fin-field">
              <span>Data do recebimento</span>
              <input type="date" value={receberData} onChange={(e) => setReceberData(e.target.value)} required />
            </label>
            <div className="fin-modal__actions">
              <button type="button" className="st-ghost-btn" onClick={() => setModalReceberOs(false)}>Voltar</button>
              <button
                type="submit"
                className="st-primary-btn"
                disabled={busyFinanceiro || !validarPagamentoMisto(contaReceberOs.valor, pagamentosReceber).ok}
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modalNovaOpen ? (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="os-nova-title">
          <div className="st-modal st-modal--lg">
            <div className="st-modal__head">
              <h2 id="os-nova-title" className="st-modal__title">
                Nova ordem de serviço
              </h2>
              <button type="button" className="st-modal__close" onClick={() => setModalNovaOpen(false)}>
                ×
              </button>
            </div>
            <div className="st-form">
              <label className="os-field">
                <span>Cliente</span>
                <ClientePicker
                  clientes={clientes}
                  value={novaOs.clienteId}
                  balcaoLabel={OS_CLIENTE_BALCAO}
                  inputClassName="os-input"
                  onChange={(clienteId) =>
                    setNovaOs((s) => ({ ...s, clienteId, bicicletaId: '' }))
                  }
                />
                <span className="st-field__hint">
                  Deixe em balcão para serviço rápido — sem cadastro de cliente nem bicicleta.
                </span>
              </label>
              <label className="os-field">
                <span>Bicicleta (opcional)</span>
                <select
                  className="os-input"
                  value={novaOs.bicicletaId}
                  onChange={(e) => setNovaOs((s) => ({ ...s, bicicletaId: e.target.value }))}
                  disabled={!novaOs.clienteId}
                >
                  <option value="">
                    {novaOs.clienteId ? '—' : 'Disponível após vincular cliente'}
                  </option>
                  {bikesDoCliente.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.marca} {b.modelo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="os-field">
                <span>Problema relatado</span>
                <textarea
                  className="os-input os-input--area"
                  rows={4}
                  value={novaOs.problema}
                  onChange={(e) => setNovaOs((s) => ({ ...s, problema: e.target.value }))}
                />
              </label>
              <div className="st-form-actions">
                <button type="button" className="st-ghost-btn" onClick={() => setModalNovaOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="st-primary-btn"
                  disabled={novaOsSalvando}
                  onClick={() => void handleNovaOs()}
                >
                  {novaOsSalvando ? 'Abrindo…' : 'Abrir OS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

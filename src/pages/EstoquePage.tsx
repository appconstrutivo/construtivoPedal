import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { calcularCustoComposicaoKit, calcularCustoLinhasKitForm } from '../lib/kit-custo'
import {
  mensagemFaltaEstoqueMontagemKit,
  verificarEstoqueMontagemKit,
} from '../lib/kit-montagem'
import {
  atualizarFornecedor,
  atualizarItemEstoque,
  criarFornecedor,
  criarItemEstoque,
  excluirFornecedor,
  atualizarKitComComponentes,
  criarKitComComponentes,
  criarMovimentacaoEstoque,
  excluirItemEstoque,
  obterUrlImagemItem,
  reservarProximoSkuEstoque,
  reservarProximoSkuKit,
  listarFornecedores,
  listarItensEstoque,
  listarKits,
  listarMovimentacoesHoje,
  desmontarKit,
  montarKit,
  sincronizarCustoItemResultanteKit,
  type EstoqueItemComLocal,
  type KitComComponentes,
  type EstoqueMovimentacaoComItem,
  type FornecedorRow,
} from '../services/estoque.service'
import { EstoqueImportModal } from '../components/EstoqueImportModal'
import { EstoqueItemPicker } from '../components/EstoqueItemPicker'
import {
  MSG_QUANTIDADE_INTEIRA,
  filtrarInputQuantidadeInteira,
  formatQuantidadeInteira,
  parseQuantidadeInteira,
} from '../lib/quantidade'

type CategoriaEstoque = 'peca' | 'bike' | 'acessorio'
type StatusEstoque = 'critico' | 'reposicao' | 'saudavel'
type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'

type KitComponenteLinha = {
  id: string
  itemId: string
  quantidade: string
}

function novoIdLinhaKit() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `kit-linha-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function novoComponenteKitLinha(): KitComponenteLinha {
  return { id: novoIdLinhaKit(), itemId: '', quantidade: '1' }
}

/** Mantém itens preenchidos e sempre uma linha vazia no final para novo componente. */
function kitComponentesComLinhaNova(linhas: KitComponenteLinha[]): KitComponenteLinha[] {
  const preenchidas: KitComponenteLinha[] = []
  let linhaVazia: KitComponenteLinha | null = null

  for (const linha of linhas) {
    if (linha.itemId.trim()) {
      preenchidas.push(linha)
    } else {
      linhaVazia = linha
    }
  }

  return [...preenchidas, linhaVazia ?? novoComponenteKitLinha()]
}

function emptyKitForm() {
  return {
    sku: '',
    nome: '',
    itemResultanteId: '',
    componentes: kitComponentesComLinhaNova([]),
  }
}

const CATEGORIAS: { key: CategoriaEstoque | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'peca', label: 'Peças' },
  { key: 'bike', label: 'Bikes' },
  { key: 'acessorio', label: 'Acessórios' },
]

const STATUS_FILTERS: { key: StatusEstoque | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'critico', label: 'Crítico' },
  { key: 'reposicao', label: 'Reposição' },
  { key: 'saudavel', label: 'Saudável' },
]

function formatBRL(v: number) {
  const n = Number.isFinite(v) ? v : 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function parseDecimalInput(s: string): number {
  const n = Number(String(s).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

function markupPctFromCostAndPrice(custo: number, preco: number): string {
  if (!(custo > 0) || !Number.isFinite(preco)) return ''
  return String(roundMoney(((preco / custo - 1) * 100)))
}

function priceFromCostAndMarkup(custo: number, markupPct: number): string {
  return String(roundMoney(custo * (1 + markupPct / 100)))
}

function toCategoriaEstoque(categoria: string): CategoriaEstoque {
  if (categoria === 'bike') return 'bike'
  if (categoria === 'acessorio' || categoria === 'componente') return 'acessorio'
  return 'peca'
}

function IconPencil() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="m14.7 6.3 3 3a2 2 0 0 1-2.3 3.2l-.5-.5L10 17.6a2 2 0 1 1-2.8-2.8l5.1-5.1-.5-.5a2 2 0 0 1 3.2-2.3Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconDesmontar() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v6M8 7h8M6 13h12M8 17h8M10 21h4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m4 13 4 4M20 13l-4 4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconX() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none">
      <rect
        x={9}
        y={9}
        width={11}
        height={11}
        rx={1.5}
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  )
}

function emptyFornecedorForm() {
  return {
    nome: '',
    contato: '',
    telefone: '',
    email: '',
    prazoMedioDias: '0',
  }
}

type ModalItemAba = 'dados' | 'detalhes'

function emptyItemForm() {
  return {
    sku: '',
    skuFornecedor: '',
    nome: '',
    imagemLink: '',
    descricao: '',
    categoria: 'peca' as CategoriaEstoque,
    unidade: 'un',
    fornecedorId: '',
    quantidadeInicial: '0',
    estoqueMinimo: '0',
    custoMedio: '0',
    precoVarejo: '0',
    precoAtacado: '0',
    markupVarejo: '',
    markupAtacado: '',
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function imagemLinkFromItem(imagemUrl: string | null | undefined): string {
  if (!imagemUrl?.trim()) return ''
  return /^https?:\/\//i.test(imagemUrl.trim()) ? imagemUrl.trim() : ''
}

function toTipoMovimentacao(tipo: string): TipoMovimentacao {
  if (tipo === 'entrada') return 'entrada'
  if (tipo === 'saida') return 'saida'
  return 'ajuste'
}

function statusItem(item: EstoqueItemComLocal): StatusEstoque {
  if (item.saldo_atual <= item.estoque_minimo * 0.5) return 'critico'
  if (item.saldo_atual <= item.estoque_minimo) return 'reposicao'
  return 'saudavel'
}

function statusLabel(status: StatusEstoque): string {
  if (status === 'critico') return 'Crítico'
  if (status === 'reposicao') return 'Reposição'
  return 'Saudável'
}

function horaMovimentacao(createdAt: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt))
}

type EstoquePageProps = {
  companyId: string
  /** Loja ativa (header); string vazia = sem loja. */
  activeStoreId: string
}

export function EstoquePage({ companyId, activeStoreId }: EstoquePageProps) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaEstoque | 'todos'>('todos')
  const [status, setStatus] = useState<StatusEstoque | 'todos'>('todos')
  const [itens, setItens] = useState<EstoqueItemComLocal[]>([])
  const [movimentacoes, setMovimentacoes] = useState<EstoqueMovimentacaoComItem[]>([])
  const [kits, setKits] = useState<KitComComponentes[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalFornecedorOpen, setModalFornecedorOpen] = useState(false)
  const [fornecedorEditandoId, setFornecedorEditandoId] = useState<string | null>(null)
  const [excluindoFornecedorId, setExcluindoFornecedorId] = useState<string | null>(null)
  const [modalItemOpen, setModalItemOpen] = useState(false)
  const [modalMovOpen, setModalMovOpen] = useState(false)
  const [modalKitOpen, setModalKitOpen] = useState(false)
  const [kitEditandoId, setKitEditandoId] = useState<string | null>(null)
  /** Nome do kit usado como base ao duplicar receita (somente exibição no modal). */
  const [kitReceitaOrigemNome, setKitReceitaOrigemNome] = useState<string | null>(null)
  const [kitsComposicaoAberta, setKitsComposicaoAberta] = useState<Record<string, boolean>>({})
  const [modalMontagemOpen, setModalMontagemOpen] = useState(false)
  const [modalDesmontagemOpen, setModalDesmontagemOpen] = useState(false)
  const [modalImportOpen, setModalImportOpen] = useState(false)
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)
  const [salvandoItem, setSalvandoItem] = useState(false)
  const [salvandoMov, setSalvandoMov] = useState(false)
  const [salvandoKit, setSalvandoKit] = useState(false)
  const [salvandoMontagem, setSalvandoMontagem] = useState(false)
  const [salvandoDesmontagem, setSalvandoDesmontagem] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fornecedorForm, setFornecedorForm] = useState(emptyFornecedorForm)
  const [itemEditandoId, setItemEditandoId] = useState<string | null>(null)
  /** Preserva store_id original ao editar (não vem mais do modal). */
  const [itemEditandoStoreId, setItemEditandoStoreId] = useState<string | null>(null)
  const [modalItemAba, setModalItemAba] = useState<ModalItemAba>('dados')
  const [itemSelecionadoId, setItemSelecionadoId] = useState<string | null>(null)
  const [itemPreviewUrl, setItemPreviewUrl] = useState<string | null>(null)
  const [itemPreviewLoading, setItemPreviewLoading] = useState(false)
  const [excluindoItem, setExcluindoItem] = useState(false)
  const [itemForm, setItemForm] = useState(() => emptyItemForm())
  const [itemSkuLoading, setItemSkuLoading] = useState(false)
  const [kitSkuLoading, setKitSkuLoading] = useState(false)
  const [movForm, setMovForm] = useState({
    itemId: '',
    tipo: 'saida' as TipoMovimentacao,
    quantidade: '1',
    origem: '',
    observacao: '',
  })
  const [kitForm, setKitForm] = useState(emptyKitForm)
  const [montagemForm, setMontagemForm] = useState({
    kitId: '',
    quantidade: '1',
    origem: '',
  })
  const [desmontagemForm, setDesmontagemForm] = useState({
    kitId: '',
    quantidade: '1',
    origem: '',
  })

  const carregarDados = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const [itensData, movimentacoesData, fornecedoresData, kitsData] = await Promise.all([
        listarItensEstoque(companyId, activeStoreId),
        listarMovimentacoesHoje(companyId, activeStoreId),
        listarFornecedores(companyId, activeStoreId),
        listarKits(companyId, activeStoreId),
      ])
      setItens(itensData)
      setMovimentacoes(movimentacoesData)
      setFornecedores(fornecedoresData)
      setKits(kitsData)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar estoque.')
      setItens([])
      setMovimentacoes([])
      setFornecedores([])
      setKits([])
    } finally {
      setLoading(false)
    }
  }, [companyId, activeStoreId])

  useEffect(() => {
    void carregarDados()
  }, [carregarDados])

  useEffect(() => {
    setItemSelecionadoId(null)
  }, [activeStoreId])

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return itens.filter((item) => {
      const categoriaItem = toCategoriaEstoque(item.categoria)
      if (categoria !== 'todos' && categoriaItem !== categoria) return false

      const itemStatus = statusItem(item)
      if (status !== 'todos' && itemStatus !== status) return false

      if (!termo) return true
      return (
        item.nome.toLowerCase().includes(termo) ||
        item.sku.toLowerCase().includes(termo) ||
        item.storeName.toLowerCase().includes(termo)
      )
    })
  }, [busca, categoria, status, itens])

  function abrirMovimentacao(tipo: TipoMovimentacao, itemId?: string) {
    setFormError(null)
    setMovForm({
      itemId: itemId ?? itens[0]?.id ?? '',
      tipo,
      quantidade: '1',
      origem: '',
      observacao: '',
    })
    setModalMovOpen(true)
  }

  function abrirNovoFornecedor() {
    setFormError(null)
    setFornecedorEditandoId(null)
    setFornecedorForm(emptyFornecedorForm())
    setModalFornecedorOpen(true)
  }

  function abrirEditarFornecedor(fornecedor: FornecedorRow) {
    setFormError(null)
    setFornecedorEditandoId(fornecedor.id)
    setFornecedorForm({
      nome: fornecedor.nome,
      contato: fornecedor.contato ?? '',
      telefone: fornecedor.telefone ?? '',
      email: fornecedor.email ?? '',
      prazoMedioDias: String(fornecedor.prazo_medio_dias),
    })
    setModalFornecedorOpen(true)
  }

  function fecharModalFornecedor() {
    if (salvandoFornecedor) return
    setModalFornecedorOpen(false)
    setFornecedorEditandoId(null)
    setFornecedorForm(emptyFornecedorForm())
    setFormError(null)
  }

  async function handleExcluirFornecedor(fornecedor: FornecedorRow) {
    if (
      !window.confirm(
        `Excluir o fornecedor "${fornecedor.nome}"?\n\nItens vinculados ficarão sem fornecedor.`,
      )
    ) {
      return
    }
    setExcluindoFornecedorId(fornecedor.id)
    setFormError(null)
    try {
      await excluirFornecedor(fornecedor.id)
      await carregarDados()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao excluir fornecedor.')
    } finally {
      setExcluindoFornecedorId(null)
    }
  }

  async function handleSalvarFornecedor(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!activeStoreId) {
      setFormError('Selecione uma loja no topo da tela.')
      return
    }
    const nome = fornecedorForm.nome.trim()
    if (!nome) {
      setFormError('Nome do fornecedor é obrigatório.')
      return
    }

    const prazo = Number(fornecedorForm.prazoMedioDias)
    if (!Number.isFinite(prazo) || prazo < 0) {
      setFormError('Prazo médio inválido.')
      return
    }

    const payload = {
      nome,
      contato: fornecedorForm.contato.trim() || null,
      telefone: fornecedorForm.telefone.trim() || null,
      email: fornecedorForm.email.trim() || null,
      prazo_medio_dias: Math.round(prazo),
    }

    setSalvandoFornecedor(true)
    try {
      if (fornecedorEditandoId) {
        await atualizarFornecedor(fornecedorEditandoId, payload)
      } else {
        await criarFornecedor({
          company_id: companyId,
          store_id: activeStoreId,
          ...payload,
        })
      }
      await carregarDados()
      fecharModalFornecedor()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
    } finally {
      setSalvandoFornecedor(false)
    }
  }

  const reservarSkuParaFormulario = useCallback(async () => {
    setItemSkuLoading(true)
    try {
      const sku = await reservarProximoSkuEstoque(companyId, activeStoreId || null)
      setFormError(null)
      setItemForm((prev) => ({ ...prev, sku }))
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao gerar SKU.')
    } finally {
      setItemSkuLoading(false)
    }
  }, [companyId, activeStoreId])

  const reservarSkuKitParaFormulario = useCallback(async () => {
    setKitSkuLoading(true)
    try {
      const sku = await reservarProximoSkuKit(companyId)
      setFormError(null)
      setKitForm((prev) => ({ ...prev, sku }))
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao gerar SKU do kit.')
    } finally {
      setKitSkuLoading(false)
    }
  }, [companyId])

  const modalNovoItemAbertoRef = useRef(false)
  const modalKitAbertoRef = useRef(false)

  const itemSelecionado = useMemo(
    () => (itemSelecionadoId ? itens.find((i) => i.id === itemSelecionadoId) ?? null : null),
    [itens, itemSelecionadoId],
  )

  const itensParaComponenteKit = useMemo(
    () => itens.filter((i) => i.id !== kitForm.itemResultanteId),
    [itens, kitForm.itemResultanteId],
  )

  const kitMontagemSelecionado = useMemo(
    () => kits.find((k) => k.id === montagemForm.kitId) ?? null,
    [kits, montagemForm.kitId],
  )

  const kitDesmontagemSelecionado = useMemo(
    () => kits.find((k) => k.id === desmontagemForm.kitId) ?? null,
    [kits, desmontagemForm.kitId],
  )

  const qtdMontagemNum = useMemo(() => {
    const n = parseQuantidadeInteira(montagemForm.quantidade)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [montagemForm.quantidade])

  const faltasEstoqueMontagem = useMemo(() => {
    if (!kitMontagemSelecionado || qtdMontagemNum <= 0) return []
    return verificarEstoqueMontagemKit(
      kitMontagemSelecionado.componentes.map((c) => ({
        componenteItemId: c.componenteItemId,
        componenteNome: c.componenteNome,
        quantidade: c.quantidade,
      })),
      qtdMontagemNum,
      itens.map((i) => ({ id: i.id, nome: i.nome, saldo_atual: i.saldo_atual })),
    )
  }, [kitMontagemSelecionado, qtdMontagemNum, itens])

  const saldoComponenteMontagemPorId = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of itens) {
      map.set(item.id, Math.trunc(Number(item.saldo_atual) || 0))
    }
    return map
  }, [itens])

  const qtdDesmontagemNum = useMemo(() => {
    const n = parseQuantidadeInteira(desmontagemForm.quantidade)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [desmontagemForm.quantidade])

  const saldoItemResultanteDesmontagem = useMemo(() => {
    const kit = kitDesmontagemSelecionado
    if (!kit?.item_resultante_id) return null
    const item = itens.find((i) => i.id === kit.item_resultante_id)
    return item?.saldo_atual ?? null
  }, [itens, kitDesmontagemSelecionado])

  const custoPorItemResultanteId = useMemo(() => {
    const map = new Map<string, number>()
    for (const kit of kits) {
      if (!kit.item_resultante_id) continue
      map.set(
        kit.item_resultante_id,
        calcularCustoComposicaoKit(
          kit.componentes.map((c) => ({
            componenteItemId: c.componenteItemId,
            quantidade: c.quantidade,
          })),
          itens,
        ),
      )
    }
    return map
  }, [kits, itens])

  const custoKitForm = useMemo(
    () => calcularCustoLinhasKitForm(kitForm.componentes, itens),
    [kitForm.componentes, itens],
  )

  const kitDoItemEmEdicao = useMemo(
    () =>
      itemEditandoId
        ? (kits.find((k) => k.item_resultante_id === itemEditandoId) ?? null)
        : null,
    [kits, itemEditandoId],
  )

  const custoItemKitEmEdicao = useMemo(() => {
    if (!kitDoItemEmEdicao) return null
    return calcularCustoComposicaoKit(
      kitDoItemEmEdicao.componentes.map((c) => ({
        componenteItemId: c.componenteItemId,
        quantidade: c.quantidade,
      })),
      itens,
    )
  }, [kitDoItemEmEdicao, itens])

  const custoExibicaoItem = useCallback(
    (item: EstoqueItemComLocal) =>
      custoPorItemResultanteId.get(item.id) ?? Number(item.custo_medio) ?? 0,
    [custoPorItemResultanteId],
  )

  const resumo = useMemo(() => {
    const totalSkus = itens.length
    const criticos = itens.filter((item) => statusItem(item) === 'critico').length
    const reposicao = itens.filter((item) => statusItem(item) === 'reposicao').length
    const valorEstoque = itens.reduce((acc, item) => {
      const custo = custoPorItemResultanteId.get(item.id) ?? Number(item.custo_medio) ?? 0
      return acc + custo * Number(item.saldo_atual)
    }, 0)
    return { totalSkus, criticos, reposicao, valorEstoque }
  }, [itens, custoPorItemResultanteId])

  function alternarComposicaoKitPainel(kitId: string) {
    setKitsComposicaoAberta((prev) => ({ ...prev, [kitId]: !prev[kitId] }))
  }

  const itemFormImagemPreview = useMemo(() => {
    const link = itemForm.imagemLink.trim()
    return link && isHttpUrl(link) ? link : null
  }, [itemForm.imagemLink])

  useEffect(() => {
    if (!itemSelecionado?.imagem_url) {
      setItemPreviewUrl(null)
      setItemPreviewLoading(false)
      return
    }
    let cancel = false
    setItemPreviewLoading(true)
    void obterUrlImagemItem(itemSelecionado.imagem_url)
      .then((url) => {
        if (!cancel) setItemPreviewUrl(url)
      })
      .finally(() => {
        if (!cancel) setItemPreviewLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [itemSelecionado?.id, itemSelecionado?.imagem_url])

  useEffect(() => {
    const eraNovoAberto = modalNovoItemAbertoRef.current
    modalNovoItemAbertoRef.current = Boolean(modalItemOpen && !itemEditandoId)
    if (!modalItemOpen || itemEditandoId) return
    if (!eraNovoAberto) return
    void reservarSkuParaFormulario()
  }, [activeStoreId, modalItemOpen, itemEditandoId, reservarSkuParaFormulario])

  useEffect(() => {
    const eraKitAberto = modalKitAbertoRef.current
    modalKitAbertoRef.current = modalKitOpen
    if (!modalKitOpen) return
    if (!eraKitAberto) return
    if (kitEditandoId) return
    void reservarSkuKitParaFormulario()
  }, [modalKitOpen, kitEditandoId, reservarSkuKitParaFormulario])

  function abrirNovoItem() {
    setFormError(null)
    setItemEditandoId(null)
    setItemEditandoStoreId(null)
    setModalItemAba('dados')
    setItemForm(emptyItemForm())
    setModalItemOpen(true)
    void reservarSkuParaFormulario()
  }

  function abrirEditarItem(item: EstoqueItemComLocal) {
    setFormError(null)
    setItemSkuLoading(false)
    setItemEditandoId(item.id)
    setItemEditandoStoreId(item.store_id)
    setModalItemAba('dados')
    const kitItem = kits.find((k) => k.item_resultante_id === item.id)
    const custo = kitItem
      ? calcularCustoComposicaoKit(
          kitItem.componentes.map((c) => ({
            componenteItemId: c.componenteItemId,
            quantidade: c.quantidade,
          })),
          itens,
        )
      : item.custo_medio
    const pv = item.preco_varejo ?? 0
    const pa = item.preco_atacado ?? 0
    setItemForm({
      sku: item.sku,
      skuFornecedor: item.sku_fornecedor?.trim() ?? '',
      nome: item.nome,
      imagemLink: imagemLinkFromItem(item.imagem_url),
      descricao: item.descricao?.trim() ?? '',
      categoria: toCategoriaEstoque(item.categoria),
      unidade: item.unidade,
      fornecedorId: item.fornecedor_id ?? '',
      quantidadeInicial: String(item.saldo_atual),
      estoqueMinimo: String(item.estoque_minimo),
      custoMedio: String(custo),
      precoVarejo: String(item.preco_varejo ?? 0),
      precoAtacado: String(item.preco_atacado ?? 0),
      markupVarejo: markupPctFromCostAndPrice(custo, pv),
      markupAtacado: markupPctFromCostAndPrice(custo, pa),
    })
    setModalItemOpen(true)
  }

  function fecharModalItem() {
    setModalItemOpen(false)
    setItemEditandoId(null)
    setItemEditandoStoreId(null)
    setModalItemAba('dados')
    setFormError(null)
    setItemSkuLoading(false)
  }

  function selecionarItem(item: EstoqueItemComLocal) {
    setItemSelecionadoId((prev) => (prev === item.id ? null : item.id))
  }

  async function handleExcluirItem(item: EstoqueItemComLocal) {
    const ok = window.confirm(
      `Excluir "${item.nome}" do estoque?\n\nO item será desativado e não aparecerá mais nas listagens.`,
    )
    if (!ok) return
    setExcluindoItem(true)
    setErro(null)
    try {
      await excluirItemEstoque(item.id)
      if (itemSelecionadoId === item.id) setItemSelecionadoId(null)
      await carregarDados()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir item.')
    } finally {
      setExcluindoItem(false)
    }
  }

  async function handleSalvarItem(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const sku = itemForm.sku.trim()
    const nome = itemForm.nome.trim()
    const quantidadeInicial = parseQuantidadeInteira(itemForm.quantidadeInicial)
    const estoqueMinimo = parseQuantidadeInteira(itemForm.estoqueMinimo)
    const custoMedio = kitDoItemEmEdicao
      ? calcularCustoComposicaoKit(
          kitDoItemEmEdicao.componentes.map((c) => ({
            componenteItemId: c.componenteItemId,
            quantidade: c.quantidade,
          })),
          itens,
        )
      : Number(itemForm.custoMedio)
    const precoVarejo = Number(itemForm.precoVarejo)
    const precoAtacado = Number(itemForm.precoAtacado)

    const imagemLink = itemForm.imagemLink.trim()
    const descricao = itemForm.descricao.trim()
    const skuFornecedor = itemForm.skuFornecedor.trim() || null
    let imagemUrl: string | null = imagemLink || null
    if (itemEditandoId && !imagemLink) {
      const emEdicao = itens.find((i) => i.id === itemEditandoId)
      const refLegada = emEdicao?.imagem_url?.trim()
      if (refLegada && !/^https?:\/\//i.test(refLegada)) {
        imagemUrl = refLegada
      }
    }

    if (!nome) {
      setFormError('Nome do item é obrigatório.')
      return
    }
    if (imagemLink && !isHttpUrl(imagemLink)) {
      setFormError('Informe um link válido para a foto (http ou https).')
      setModalItemAba('detalhes')
      return
    }
    if (!itemEditandoId && !sku) {
      setFormError('Aguarde a geração do SKU (verifique a conexão e o script SQL no Supabase).')
      return
    }
    if ([custoMedio, precoVarejo, precoAtacado].some((v) => !Number.isFinite(v) || v < 0)) {
      setFormError('Custo e preços devem ser números válidos e não negativos.')
      return
    }
    if (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) {
      setFormError(MSG_QUANTIDADE_INTEIRA)
      return
    }
    if (
      itemEditandoId === null &&
      (!Number.isFinite(quantidadeInicial) || quantidadeInicial < 0)
    ) {
      setFormError(MSG_QUANTIDADE_INTEIRA)
      return
    }

    setSalvandoItem(true)
    try {
      if (itemEditandoId) {
        await atualizarItemEstoque(itemEditandoId, {
          nome,
          categoria: itemForm.categoria,
          unidade: itemForm.unidade.trim() || 'un',
          store_id: itemEditandoStoreId,
          fornecedor_id: itemForm.fornecedorId || null,
          sku_fornecedor: skuFornecedor,
          estoque_minimo: estoqueMinimo,
          custo_medio: custoMedio,
          preco_varejo: precoVarejo,
          preco_atacado: precoAtacado,
          imagem_url: imagemUrl,
          descricao: descricao || null,
        })
      } else {
        await criarItemEstoque({
          company_id: companyId,
          sku,
          sku_fornecedor: skuFornecedor,
          nome,
          categoria: itemForm.categoria,
          unidade: itemForm.unidade.trim() || 'un',
          store_id: activeStoreId,
          fornecedor_id: itemForm.fornecedorId || null,
          saldo_atual: quantidadeInicial,
          estoque_minimo: estoqueMinimo,
          custo_medio: custoMedio,
          preco_varejo: precoVarejo,
          preco_atacado: precoAtacado,
          imagem_url: imagemUrl,
          descricao: descricao || null,
        })
      }

      await carregarDados()
      fecharModalItem()
      setItemForm(emptyItemForm())
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar item.')
    } finally {
      setSalvandoItem(false)
    }
  }

  async function handleSalvarMovimentacao(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!movForm.itemId) {
      setFormError('Selecione um item para movimentar.')
      return
    }

    const permitirNegativo = movForm.tipo === 'ajuste'
    const quantidade = parseQuantidadeInteira(movForm.quantidade, { permitirNegativo })
    if (!Number.isFinite(quantidade)) {
      setFormError(MSG_QUANTIDADE_INTEIRA)
      return
    }
    if (movForm.tipo === 'ajuste' && quantidade === 0) {
      setFormError('Ajuste não pode ser zero.')
      return
    }
    if ((movForm.tipo === 'entrada' || movForm.tipo === 'saida') && quantidade <= 0) {
      setFormError('Entrada/saída exigem quantidade inteira maior que zero.')
      return
    }

    setSalvandoMov(true)
    try {
      await criarMovimentacaoEstoque({
        company_id: companyId,
        item_id: movForm.itemId,
        tipo: movForm.tipo,
        quantidade,
        origem: movForm.origem.trim() || null,
        observacao: movForm.observacao.trim() || null,
      })
      await carregarDados()
      setModalMovOpen(false)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar movimentação.')
    } finally {
      setSalvandoMov(false)
    }
  }

  function abrirCadastroKit() {
    setFormError(null)
    setKitEditandoId(null)
    setKitReceitaOrigemNome(null)
    setKitForm(emptyKitForm())
    setModalKitOpen(true)
    void reservarSkuKitParaFormulario()
  }

  function abrirDuplicarKit(kit: KitComComponentes) {
    setFormError(null)
    setKitEditandoId(null)
    setKitReceitaOrigemNome(kit.nome)
    setKitSkuLoading(false)
    setKitForm({
      sku: '',
      nome: `${kit.nome} (cópia)`,
      itemResultanteId: '',
      componentes: kitComponentesComLinhaNova(
        kit.componentes.map((c) => ({
          id: novoIdLinhaKit(),
          itemId: c.componenteItemId,
          quantidade: formatQuantidadeInteira(c.quantidade),
        })),
      ),
    })
    setModalKitOpen(true)
    void reservarSkuKitParaFormulario()
  }

  function abrirEditarKit(kit: KitComComponentes) {
    setFormError(null)
    setKitEditandoId(kit.id)
    setKitReceitaOrigemNome(null)
    setKitSkuLoading(false)
    setKitForm({
      sku: kit.sku,
      nome: kit.nome,
      itemResultanteId: kit.item_resultante_id ?? '',
      componentes: kitComponentesComLinhaNova(
        kit.componentes.map((c) => ({
          id: novoIdLinhaKit(),
          itemId: c.componenteItemId,
          quantidade: formatQuantidadeInteira(c.quantidade),
        })),
      ),
    })
    setModalKitOpen(true)
  }

  function fecharModalKit() {
    if (salvandoKit) return
    setModalKitOpen(false)
    setKitEditandoId(null)
    setKitReceitaOrigemNome(null)
    setKitForm(emptyKitForm())
    setFormError(null)
  }

  function adicionarLinhaComponenteKit() {
    setKitForm((prev) => {
      const normalizado = kitComponentesComLinhaNova(prev.componentes)
      const preenchidas = normalizado.filter((c) => c.itemId.trim())
      const linhaVazia = normalizado.find((c) => !c.itemId.trim())!
      return {
        ...prev,
        componentes: [...preenchidas, novoComponenteKitLinha(), linhaVazia],
      }
    })
  }

  function removerLinhaComponenteKit(linhaId: string) {
    setKitForm((prev) => {
      const idx = prev.componentes.findIndex((c) => c.id === linhaId)
      if (idx < 0) return prev
      const alvo = prev.componentes[idx]
      const ehLinhaNovaFinal = idx === prev.componentes.length - 1 && !alvo.itemId.trim()
      if (ehLinhaNovaFinal) return prev
      return {
        ...prev,
        componentes: kitComponentesComLinhaNova(prev.componentes.filter((c) => c.id !== linhaId)),
      }
    })
  }

  function atualizarLinhaComponenteKit(
    linhaId: string,
    patch: Partial<Pick<KitComponenteLinha, 'itemId' | 'quantidade'>>,
  ) {
    setKitForm((prev) => ({
      ...prev,
      componentes: kitComponentesComLinhaNova(
        prev.componentes.map((c) => (c.id === linhaId ? { ...c, ...patch } : c)),
      ),
    }))
  }

  function definirItemResultanteKit(itemResultanteId: string) {
    setKitForm((prev) => ({
      ...prev,
      itemResultanteId,
      componentes: kitComponentesComLinhaNova(
        prev.componentes.map((c) =>
          c.itemId === itemResultanteId ? { ...c, itemId: '' } : c,
        ),
      ),
    }))
  }

  function abrirMontagemKit() {
    setFormError(null)
    setMontagemForm({
      kitId: kits[0]?.id ?? '',
      quantidade: '1',
      origem: '',
    })
    setModalMontagemOpen(true)
  }

  function abrirDesmontagemKit(kitIdPreselect?: string) {
    setFormError(null)
    setDesmontagemForm({
      kitId: kitIdPreselect ?? kits[0]?.id ?? '',
      quantidade: '1',
      origem: '',
    })
    setModalDesmontagemOpen(true)
  }

  async function handleSalvarKit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const sku = kitForm.sku.trim()
    const nome = kitForm.nome.trim()
    const itemResultanteId = kitForm.itemResultanteId

    if (!sku || !nome || !itemResultanteId) {
      setFormError('Aguarde o SKU do kit ou preencha nome e item resultante.')
      return
    }

    const linhasPreenchidas = kitForm.componentes.filter((c) => c.itemId.trim())
    if (linhasPreenchidas.length === 0) {
      setFormError('Adicione ao menos um componente à lista do kit.')
      return
    }

    const idsUsados = new Set<string>()
    const componentes: Array<{ componenteItemId: string; quantidade: number }> = []

    for (const linha of linhasPreenchidas) {
      if (linha.itemId === itemResultanteId) {
        setFormError('O item resultante não pode aparecer também como componente.')
        return
      }
      if (idsUsados.has(linha.itemId)) {
        setFormError('Não repita o mesmo componente na lista. Ajuste a quantidade na linha existente.')
        return
      }
      const quantidade = parseQuantidadeInteira(linha.quantidade)
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        setFormError(MSG_QUANTIDADE_INTEIRA)
        return
      }
      idsUsados.add(linha.itemId)
      componentes.push({ componenteItemId: linha.itemId, quantidade })
    }

    setSalvandoKit(true)
    try {
      if (kitEditandoId) {
        await atualizarKitComComponentes({
          companyId,
          kitId: kitEditandoId,
          nome,
          itemResultanteId,
          componentes,
        })
      } else {
        await criarKitComComponentes({
          companyId,
          sku,
          nome,
          itemResultanteId,
          componentes,
        })
      }
      await sincronizarCustoItemResultanteKit({
        itemResultanteId,
        componentes,
        itens,
      })
      await carregarDados()
      fecharModalKit()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar kit.')
    } finally {
      setSalvandoKit(false)
    }
  }

  async function handleMontarKit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!montagemForm.kitId) {
      setFormError('Selecione um kit para montar.')
      return
    }

    const quantidade = parseQuantidadeInteira(montagemForm.quantidade)
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setFormError(MSG_QUANTIDADE_INTEIRA)
      return
    }

    const faltas = kitMontagemSelecionado
      ? verificarEstoqueMontagemKit(
          kitMontagemSelecionado.componentes.map((c) => ({
            componenteItemId: c.componenteItemId,
            componenteNome: c.componenteNome,
            quantidade: c.quantidade,
          })),
          quantidade,
          itens.map((i) => ({ id: i.id, nome: i.nome, saldo_atual: i.saldo_atual })),
        )
      : []

    if (faltas.length > 0) {
      setFormError(mensagemFaltaEstoqueMontagemKit(faltas))
      return
    }

    setSalvandoMontagem(true)
    try {
      await montarKit({
        companyId,
        kitId: montagemForm.kitId,
        quantidade,
        origem: montagemForm.origem.trim() || undefined,
      })
      await carregarDados()
      setModalMontagemOpen(false)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao montar kit.')
    } finally {
      setSalvandoMontagem(false)
    }
  }

  async function handleDesmontarKit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!desmontagemForm.kitId) {
      setFormError('Selecione um kit para desmontar.')
      return
    }

    const quantidade = parseQuantidadeInteira(desmontagemForm.quantidade)
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setFormError(MSG_QUANTIDADE_INTEIRA)
      return
    }

    const saldo = saldoItemResultanteDesmontagem
    if (saldo !== null && quantidade > saldo) {
      setFormError(
        `Saldo insuficiente do item montado. Disponível: ${formatQuantidadeInteira(saldo)} unidade(s).`,
      )
      return
    }

    const kit = kitDesmontagemSelecionado
    if (
      !window.confirm(
        `Desmontar ${formatQuantidadeInteira(quantidade)} unidade(s) do kit "${kit?.nome ?? ''}"?\n\nO item montado será baixado do estoque e os componentes voltarão automaticamente.`,
      )
    ) {
      return
    }

    setSalvandoDesmontagem(true)
    try {
      await desmontarKit({
        companyId,
        kitId: desmontagemForm.kitId,
        quantidade,
        origem: desmontagemForm.origem.trim() || undefined,
      })
      await carregarDados()
      setModalDesmontagemOpen(false)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao desmontar kit.')
    } finally {
      setSalvandoDesmontagem(false)
    }
  }

  return (
    <div className="st-page">
      <section className="st-kpi-grid" aria-label="Resumo do estoque">
        <article className="st-kpi st-kpi--teal">
          <span className="st-kpi__label">SKUs ativos</span>
          <strong className="st-kpi__value">{resumo.totalSkus}</strong>
        </article>
        <article className="st-kpi st-kpi--rose">
          <span className="st-kpi__label">Estoque crítico</span>
          <strong className="st-kpi__value">{resumo.criticos}</strong>
        </article>
        <article className="st-kpi st-kpi--amber">
          <span className="st-kpi__label">Em reposição</span>
          <strong className="st-kpi__value">{resumo.reposicao}</strong>
        </article>
        <article className="st-kpi st-kpi--blue">
          <span className="st-kpi__label">Valor em estoque (custo)</span>
          <strong className="st-kpi__value st-kpi__value--currency">{formatBRL(resumo.valorEstoque)}</strong>
        </article>
      </section>

      <div className="st-layout">
        <section className="st-main" aria-label="Itens de estoque">
          <div className="st-toolbar">
            <div className="st-toolbar__actions">
              <button type="button" className="st-primary-btn" onClick={abrirNovoItem}>
                Novo item
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={() => setModalImportOpen(true)}
                disabled={!activeStoreId}
                title={!activeStoreId ? 'Selecione uma loja no topo' : undefined}
              >
                Importar planilha
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={() => abrirMovimentacao('saida')}
                disabled={itens.length === 0}
              >
                Movimentar
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={() => { setFormError(null); setModalFornecedorOpen(true) }}
              >
                Fornecedor
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={abrirCadastroKit}
                disabled={itens.length < 2}
                title={itens.length < 2 ? 'Cadastre ao menos dois itens no estoque' : undefined}
              >
                Novo kit
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={abrirMontagemKit}
                disabled={kits.length === 0}
              >
                Montar kit
              </button>
              <button
                type="button"
                className="st-primary-btn st-primary-btn--soft"
                onClick={() => abrirDesmontagemKit()}
                disabled={kits.length === 0}
              >
                Desmontar kit
              </button>
            </div>

            <label className="st-search-wrap" htmlFor="st-busca">
              <span className="cp-sr-only">Buscar item de estoque</span>
              <input
                id="st-busca"
                className="st-search"
                type="search"
                placeholder="Buscar por item, SKU ou loja..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="st-chips" role="group" aria-label="Filtrar por categoria">
              {CATEGORIAS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={categoria === item.key ? 'st-chip st-chip--on' : 'st-chip'}
                  onClick={() => setCategoria(item.key)}
                  aria-pressed={categoria === item.key}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="st-chips" role="group" aria-label="Filtrar por status">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={status === item.key ? 'st-chip st-chip--on' : 'st-chip'}
                  onClick={() => setStatus(item.key)}
                  aria-pressed={status === item.key}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="st-list-wrap">
            {loading ? (
              <div className="st-empty">
                <p className="st-empty__title">Carregando estoque...</p>
                <p className="st-empty__hint">Buscando dados da sua empresa no Supabase.</p>
              </div>
            ) : erro ? (
              <div className="st-empty st-empty--error" role="alert">
                <p className="st-empty__title">Falha ao carregar estoque</p>
                <p className="st-empty__hint">{erro}</p>
                <button type="button" className="st-retry-btn" onClick={() => void carregarDados()}>
                  Tentar novamente
                </button>
              </div>
            ) : itensFiltrados.length === 0 ? (
              <div className="st-empty">
                <p className="st-empty__title">Nenhum item encontrado</p>
                <p className="st-empty__hint">Ajuste os filtros ou revise o termo da busca.</p>
              </div>
            ) : (
              <ul className="st-list">
                {itensFiltrados.map((item) => {
                  const st = statusItem(item)
                  return (
                    <li
                      key={item.id}
                      className={
                        itemSelecionadoId === item.id ? 'st-row st-row--selected' : 'st-row'
                      }
                      onClick={() => selecionarItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selecionarItem(item)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={itemSelecionadoId === item.id}
                    >
                      <div className="st-row__main">
                        <div className="st-row__identity">
                          <strong className="st-row__name">{item.nome}</strong>
                          <span className="st-row__sku">{item.sku}</span>
                        </div>
                        {item.fornecedorNome && (
                          <div className="st-row__meta">
                            <span>{item.fornecedorNome}</span>
                          </div>
                        )}
                      </div>

                      <div className="st-row__stock">
                        <span className="st-row__stock-value">{formatQuantidadeInteira(item.saldo_atual)}</span>
                        <span className="st-row__stock-label">mín. {formatQuantidadeInteira(item.estoque_minimo)}</span>
                      </div>

                      <div className="st-row__status">
                        <span className={`st-badge st-badge--${st}`}>{statusLabel(st)}</span>
                        <div className="st-row__prices">
                          <span className="st-row__price-item">
                            <span className="st-row__price-label">Custo</span>
                            <span className="st-row__price-value">{formatBRL(custoExibicaoItem(item))}</span>
                          </span>
                          <span className="st-row__price-item">
                            <span className="st-row__price-label">Var.</span>
                            <span className="st-row__price-value">{formatBRL(item.preco_varejo)}</span>
                          </span>
                        </div>
                      </div>

                      <div className="st-row__actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="st-row__action st-row__action--icon"
                          aria-label={`Editar ${item.nome}`}
                          onClick={() => abrirEditarItem(item)}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="st-row__action st-row__action--icon st-row__action--danger"
                          aria-label={`Excluir ${item.nome}`}
                          onClick={() => void handleExcluirItem(item)}
                          disabled={excluindoItem}
                        >
                          <IconX />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="st-side" aria-label="Contexto operacional do estoque">
          <div className="st-side__upper">
            {itemSelecionado ? (
              <article className="st-item-detail" aria-label={`Detalhes de ${itemSelecionado.nome}`}>
                <button
                  type="button"
                  className="st-item-detail__close"
                  onClick={() => setItemSelecionadoId(null)}
                  aria-label="Fechar detalhe do item"
                >
                  ×
                </button>
                <div className="st-item-detail__media">
                  {itemPreviewLoading ? (
                    <span className="st-item-detail__placeholder">Carregando foto…</span>
                  ) : itemPreviewUrl ? (
                    <img
                      src={itemPreviewUrl}
                      alt={itemSelecionado.nome}
                      className="st-item-detail__img"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="st-item-detail__placeholder" aria-hidden>
                      {itemSelecionado.nome.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="st-item-detail__body">
                  <h3 className="st-item-detail__name">{itemSelecionado.nome}</h3>
                  <p className="st-item-detail__sku">{itemSelecionado.sku}</p>
                  {itemSelecionado.descricao?.trim() && (
                    <p className="st-item-detail__desc">{itemSelecionado.descricao.trim()}</p>
                  )}
                  <dl className="st-item-detail__facts">
                    <div>
                      <dt>Saldo</dt>
                      <dd>{formatQuantidadeInteira(itemSelecionado.saldo_atual)}</dd>
                    </div>
                    <div>
                      <dt>Custo</dt>
                      <dd>{formatBRL(custoExibicaoItem(itemSelecionado))}</dd>
                    </div>
                    <div>
                      <dt>Varejo</dt>
                      <dd>{formatBRL(itemSelecionado.preco_varejo)}</dd>
                    </div>
                    <div>
                      <dt>SKU fornecedor</dt>
                      <dd>{itemSelecionado.sku_fornecedor?.trim() || '—'}</dd>
                    </div>
                  </dl>
                  <div className="st-item-detail__actions">
                    <button
                      type="button"
                      className="st-row__action st-row__action--icon"
                      aria-label={`Editar ${itemSelecionado.nome}`}
                      onClick={() => abrirEditarItem(itemSelecionado)}
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      className="st-row__action st-row__action--icon st-row__action--danger"
                      aria-label={`Excluir ${itemSelecionado.nome}`}
                      onClick={() => void handleExcluirItem(itemSelecionado)}
                      disabled={excluindoItem}
                    >
                      <IconX />
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <>
            <section className="st-panel">
              <h2 className="st-panel__title">Movimentações de hoje</h2>
            {loading ? (
              <p className="st-panel__hint">Carregando movimentações...</p>
            ) : movimentacoes.length === 0 ? (
              <p className="st-panel__hint">Sem movimentações hoje.</p>
            ) : (
              <ul className="st-mov-list">
                {movimentacoes.map((mov) => {
                  const tipo = toTipoMovimentacao(mov.tipo)
                  return (
                    <li key={mov.id} className="st-mov">
                      <div className="st-mov__head">
                        <span className={`st-mov__type st-mov__type--${tipo}`}>{tipo}</span>
                        <span className="st-mov__time">{horaMovimentacao(mov.created_at)}</span>
                      </div>
                      <strong className="st-mov__item">{mov.itemNome}</strong>
                      <span className="st-mov__meta">
                        {mov.quantidade > 0 ? '+' : ''}
                        {formatQuantidadeInteira(mov.quantidade)} un
                        {mov.origem ? ` · ${mov.origem}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="st-panel">
            <h2 className="st-panel__title">Ações sugeridas</h2>
            <ul className="st-tips">
              <li>Programar compra de correntes 11v para cobertura de 15 dias.</li>
              <li>Sincronizar baixa de cassete com OS para evitar ruptura na oficina.</li>
              <li>Criar alerta por loja quando saldo ficar abaixo de 50% do mínimo.</li>
            </ul>
          </section>
              </>
            )}
          </div>

          <section className="st-panel">
            <div className="st-panel__head">
              <h2 className="st-panel__title">Fornecedores</h2>
              <button
                type="button"
                className="st-link-btn"
                onClick={abrirNovoFornecedor}
                disabled={!activeStoreId}
                title={!activeStoreId ? 'Selecione uma loja no topo' : undefined}
              >
                Novo
              </button>
            </div>
            {!activeStoreId ? (
              <p className="st-panel__hint">Selecione uma loja no topo da tela.</p>
            ) : fornecedores.length === 0 ? (
              <p className="st-panel__hint">Nenhum fornecedor cadastrado.</p>
            ) : (
              <ul className="st-sup-list">
                {fornecedores.slice(0, 6).map((fornecedor) => (
                  <li key={fornecedor.id} className="st-sup-item">
                    <div className="st-sup-item__body">
                      <strong>{fornecedor.nome}</strong>
                      <span>
                        {fornecedor.contato ?? 'Sem contato'} · prazo {fornecedor.prazo_medio_dias}d
                      </span>
                    </div>
                    <div className="st-sup-item__actions">
                      <button
                        type="button"
                        className="st-row__action st-row__action--icon"
                        aria-label={`Editar ${fornecedor.nome}`}
                        onClick={() => abrirEditarFornecedor(fornecedor)}
                        disabled={excluindoFornecedorId === fornecedor.id}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="st-row__action st-row__action--icon st-row__action--danger"
                        aria-label={`Excluir ${fornecedor.nome}`}
                        onClick={() => void handleExcluirFornecedor(fornecedor)}
                        disabled={excluindoFornecedorId === fornecedor.id}
                      >
                        <IconX />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="st-panel st-panel--kits">
            <div className="st-panel__head">
              <h2 className="st-panel__title">Kits montáveis</h2>
              <button
                type="button"
                className="st-link-btn"
                onClick={abrirCadastroKit}
                disabled={itens.length < 2}
              >
                Novo
              </button>
            </div>
            {kits.length === 0 ? (
              <p className="st-panel__hint">Nenhum kit cadastrado.</p>
            ) : (
              <ul className="st-sup-list st-sup-list--kits">
                {kits.map((kit) => {
                  const custoKit = calcularCustoComposicaoKit(
                    kit.componentes.map((c) => ({
                      componenteItemId: c.componenteItemId,
                      quantidade: c.quantidade,
                    })),
                    itens,
                  )
                  const composicaoAberta = Boolean(kitsComposicaoAberta[kit.id])
                  const previewLimite = 3
                  const componentesVisiveis = composicaoAberta
                    ? kit.componentes
                    : kit.componentes.slice(0, previewLimite)
                  const temMaisComponentes = kit.componentes.length > previewLimite

                  return (
                    <li key={kit.id} className="st-sup-item st-sup-item--kit">
                      <div className="st-sup-item__body">
                        <strong>{kit.nome}</strong>
                        <span className="st-sup-item__meta">{kit.sku}</span>
                        <span className="st-kit-painel__resumo">
                          {kit.componentes.length} componente{kit.componentes.length === 1 ? '' : 's'} ·{' '}
                          {kit.itemResultanteNome ?? 'item resultante'}
                        </span>
                        <span className="st-kit-painel__custo">
                          Custo (1 un.): <strong>{formatBRL(custoKit)}</strong>
                        </span>
                        {kit.componentes.length > 0 && (
                          <>
                            <ul
                              className={`st-kit-comp-preview${composicaoAberta ? ' is-aberta' : ''}`}
                            >
                              {componentesVisiveis.map((c) => (
                                <li key={c.id}>
                                  {formatQuantidadeInteira(c.quantidade)}× {c.componenteNome}
                                </li>
                              ))}
                            </ul>
                            {temMaisComponentes && (
                              <button
                                type="button"
                                className="st-link-btn st-kit-painel__toggle"
                                onClick={() => alternarComposicaoKitPainel(kit.id)}
                              >
                                {composicaoAberta
                                  ? 'Ocultar composição'
                                  : `Ver todos (${kit.componentes.length})`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="st-sup-item__actions">
                        <button
                          type="button"
                          className="st-row__action st-row__action--icon"
                          aria-label={`Duplicar receita do kit ${kit.nome}`}
                          title="Criar novo kit a partir desta receita"
                          onClick={() => abrirDuplicarKit(kit)}
                        >
                          <IconCopy />
                        </button>
                        <button
                          type="button"
                          className="st-row__action st-row__action--icon"
                          aria-label={`Editar composição do kit ${kit.nome}`}
                          onClick={() => abrirEditarKit(kit)}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="st-row__action st-row__action--icon"
                          aria-label={`Desmontar kit ${kit.nome}`}
                          onClick={() => abrirDesmontagemKit(kit.id)}
                          title="Desmontar e devolver componentes ao estoque"
                        >
                          <IconDesmontar />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {modalFornecedorOpen && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="st-fornecedor-title">
          <div className="st-modal">
            <div className="st-modal__head">
              <h2 id="st-fornecedor-title" className="st-modal__title">
                {fornecedorEditandoId ? 'Editar fornecedor' : 'Novo fornecedor'}
              </h2>
              <button type="button" className="st-modal__close" onClick={fecharModalFornecedor} aria-label="Fechar">
                ×
              </button>
            </div>
            <form className="st-form" onSubmit={handleSalvarFornecedor}>
              <label className="st-field">
                <span>Nome *</span>
                <input
                  className="st-input"
                  value={fornecedorForm.nome}
                  onChange={(e) => setFornecedorForm((prev) => ({ ...prev, nome: e.target.value }))}
                  required
                />
              </label>
              <label className="st-field">
                <span>Contato</span>
                <input
                  className="st-input"
                  value={fornecedorForm.contato}
                  onChange={(e) => setFornecedorForm((prev) => ({ ...prev, contato: e.target.value }))}
                />
              </label>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Telefone</span>
                  <input
                    className="st-input"
                    value={fornecedorForm.telefone}
                    onChange={(e) => setFornecedorForm((prev) => ({ ...prev, telefone: e.target.value }))}
                  />
                </label>
                <label className="st-field">
                  <span>Prazo (dias)</span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    value={fornecedorForm.prazoMedioDias}
                    onChange={(e) => setFornecedorForm((prev) => ({ ...prev, prazoMedioDias: e.target.value }))}
                  />
                </label>
              </div>
              <label className="st-field">
                <span>E-mail</span>
                <input
                  className="st-input"
                  type="email"
                  value={fornecedorForm.email}
                  onChange={(e) => setFornecedorForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              {formError && <p className="st-form-error">{formError}</p>}
              <div className="st-form-actions">
                <button type="button" className="st-ghost-btn" onClick={fecharModalFornecedor}>
                  Cancelar
                </button>
                <button type="submit" className="st-primary-btn" disabled={salvandoFornecedor}>
                  {salvandoFornecedor
                    ? 'Salvando...'
                    : fornecedorEditandoId
                      ? 'Salvar alterações'
                      : 'Salvar fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalItemOpen && (
        <div
          className="st-modal-overlay st-modal-overlay--scroll"
          role="dialog"
          aria-modal="true"
          aria-labelledby="st-item-title"
        >
          <div className="st-modal st-modal--lg st-modal--scroll">
            <div className="st-modal__head">
              <h2 id="st-item-title" className="st-modal__title">
                {itemEditandoId ? 'Editar item de estoque' : 'Novo item de estoque'}
              </h2>
              <button type="button" className="st-modal__close" onClick={fecharModalItem} aria-label="Fechar">
                ×
              </button>
            </div>
            <form className="st-form st-form--modal-scroll" onSubmit={handleSalvarItem}>
              <div className="st-modal-tabs" role="tablist" aria-label="Seções do cadastro">
                <button
                  type="button"
                  role="tab"
                  id="st-item-tab-dados"
                  aria-selected={modalItemAba === 'dados'}
                  aria-controls="st-item-panel-dados"
                  className={`st-modal-tabs__btn${modalItemAba === 'dados' ? ' is-active' : ''}`}
                  onClick={() => setModalItemAba('dados')}
                >
                  Dados do item
                </button>
                <button
                  type="button"
                  role="tab"
                  id="st-item-tab-detalhes"
                  aria-selected={modalItemAba === 'detalhes'}
                  aria-controls="st-item-panel-detalhes"
                  className={`st-modal-tabs__btn${modalItemAba === 'detalhes' ? ' is-active' : ''}`}
                  onClick={() => setModalItemAba('detalhes')}
                >
                  Foto e descrição
                </button>
              </div>

              <div className="st-modal__body">
              <div
                id="st-item-panel-dados"
                role="tabpanel"
                aria-labelledby="st-item-tab-dados"
                hidden={modalItemAba !== 'dados'}
                className="st-modal-tabpanel"
              >
              <div className="st-form-grid">
                <label className="st-field">
                  <span>SKU</span>
                  <input
                    className="st-input"
                    value={itemSkuLoading && !itemEditandoId ? '' : itemForm.sku}
                    placeholder={itemSkuLoading && !itemEditandoId ? 'Gerando…' : undefined}
                    readOnly
                    aria-readonly="true"
                    aria-busy={itemSkuLoading && !itemEditandoId}
                  />
                </label>
                <label className="st-field">
                  <span>Nome *</span>
                  <input
                    className="st-input"
                    value={itemForm.nome}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, nome: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Categoria</span>
                  <select
                    className="st-input"
                    value={itemForm.categoria}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, categoria: e.target.value as CategoriaEstoque }))
                    }
                  >
                    <option value="peca">Peça</option>
                    <option value="bike">Bike</option>
                    <option value="acessorio">Acessórios</option>
                  </select>
                </label>
                <label className="st-field">
                  <span>Unidade</span>
                  <input
                    className="st-input"
                    value={itemForm.unidade}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, unidade: e.target.value }))}
                  />
                </label>
              </div>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Fornecedor</span>
                  <select
                    className="st-input"
                    value={itemForm.fornecedorId}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, fornecedorId: e.target.value }))}
                  >
                    <option value="">Sem fornecedor</option>
                    {fornecedores.map((fornecedor) => (
                      <option key={fornecedor.id} value={fornecedor.id}>
                        {fornecedor.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="st-field">
                  <span title="Código do produto no catálogo ou planilha do fornecedor (diferente do SKU interno da loja)">
                    SKU do fornecedor
                  </span>
                  <input
                    className="st-input"
                    value={itemForm.skuFornecedor}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, skuFornecedor: e.target.value }))
                    }
                    placeholder="Ex.: código na tabela do fornecedor"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="st-form-grid">
                <label className="st-field">
                  <span title="Custo pago ao fornecedor">Custo (R$)</span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={
                      custoItemKitEmEdicao !== null
                        ? String(custoItemKitEmEdicao)
                        : itemForm.custoMedio
                    }
                    readOnly={custoItemKitEmEdicao !== null}
                    aria-readonly={custoItemKitEmEdicao !== null}
                    onChange={(e) => {
                      if (custoItemKitEmEdicao !== null) return
                      const raw = e.target.value
                      setItemForm((prev) => {
                        const custo = parseDecimalInput(raw)
                        const next = { ...prev, custoMedio: raw }
                        if (!(custo > 0)) {
                          return next
                        }
                        let nv = next
                        const mv = parseDecimalInput(prev.markupVarejo)
                        if (prev.markupVarejo.trim() !== '' && Number.isFinite(mv)) {
                          nv = { ...nv, precoVarejo: priceFromCostAndMarkup(custo, mv) }
                        } else {
                          const pv = parseDecimalInput(prev.precoVarejo)
                          if (Number.isFinite(pv)) {
                            nv = { ...nv, markupVarejo: markupPctFromCostAndPrice(custo, pv) }
                          }
                        }
                        const ma = parseDecimalInput(prev.markupAtacado)
                        if (prev.markupAtacado.trim() !== '' && Number.isFinite(ma)) {
                          nv = { ...nv, precoAtacado: priceFromCostAndMarkup(custo, ma) }
                        } else {
                          const pa = parseDecimalInput(prev.precoAtacado)
                          if (Number.isFinite(pa)) {
                            nv = { ...nv, markupAtacado: markupPctFromCostAndPrice(custo, pa) }
                          }
                        }
                        return nv
                      })
                    }}
                  />
                  {custoItemKitEmEdicao !== null && (
                    <span className="st-field__hint">
                      Calculado pela composição do kit. Para alterar, edite os componentes em Kits
                      montáveis.
                    </span>
                  )}
                </label>
              </div>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>
                    Quantidade {itemEditandoId ? 'em estoque' : 'inicial'}
                    {itemEditandoId && (
                      <span className="st-field__hint"> — ajuste fino pela movimentação</span>
                    )}
                  </span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={itemForm.quantidadeInicial}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        quantidadeInicial: filtrarInputQuantidadeInteira(e.target.value),
                      }))
                    }
                    readOnly={!!itemEditandoId}
                    aria-readonly={itemEditandoId ? true : undefined}
                  />
                </label>
                <label className="st-field">
                  <span>Estoque mínimo</span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={itemForm.estoqueMinimo}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        estoqueMinimo: filtrarInputQuantidadeInteira(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <p className="st-pricing-hint">
                Preços de venda: informe o valor em reais ou o markup (%) sobre o custo — um atualiza o
                outro automaticamente.
              </p>
              <div className="st-form-grid st-form-grid--precos">
                <label className="st-field">
                  <span>Preço varejo (R$)</span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemForm.precoVarejo}
                    onChange={(e) => {
                      const val = e.target.value
                      setItemForm((prev) => {
                        const custo = parseDecimalInput(prev.custoMedio)
                        const preco = parseDecimalInput(val)
                        const markup =
                          custo > 0 && Number.isFinite(preco)
                            ? markupPctFromCostAndPrice(custo, preco)
                            : ''
                        return { ...prev, precoVarejo: val, markupVarejo: markup }
                      })
                    }}
                  />
                </label>
                <label className="st-field">
                  <span>Markup varejo (%)</span>
                  <input
                    className="st-input"
                    type="number"
                    step="0.01"
                    value={itemForm.markupVarejo}
                    onChange={(e) => {
                      const val = e.target.value
                      setItemForm((prev) => {
                        const custo = parseDecimalInput(prev.custoMedio)
                        const m = parseDecimalInput(val)
                        const preco =
                          custo >= 0 && Number.isFinite(m)
                            ? priceFromCostAndMarkup(custo, m)
                            : prev.precoVarejo
                        return { ...prev, markupVarejo: val, precoVarejo: preco }
                      })
                    }}
                  />
                </label>
              </div>
              <div className="st-form-grid st-form-grid--precos">
                <label className="st-field">
                  <span>Preço atacado (R$)</span>
                  <input
                    className="st-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemForm.precoAtacado}
                    onChange={(e) => {
                      const val = e.target.value
                      setItemForm((prev) => {
                        const custo = parseDecimalInput(prev.custoMedio)
                        const preco = parseDecimalInput(val)
                        const markup =
                          custo > 0 && Number.isFinite(preco)
                            ? markupPctFromCostAndPrice(custo, preco)
                            : ''
                        return { ...prev, precoAtacado: val, markupAtacado: markup }
                      })
                    }}
                  />
                </label>
                <label className="st-field">
                  <span>Markup atacado (%)</span>
                  <input
                    className="st-input"
                    type="number"
                    step="0.01"
                    value={itemForm.markupAtacado}
                    onChange={(e) => {
                      const val = e.target.value
                      setItemForm((prev) => {
                        const custo = parseDecimalInput(prev.custoMedio)
                        const m = parseDecimalInput(val)
                        const preco =
                          custo >= 0 && Number.isFinite(m)
                            ? priceFromCostAndMarkup(custo, m)
                            : prev.precoAtacado
                        return { ...prev, markupAtacado: val, precoAtacado: preco }
                      })
                    }}
                  />
                </label>
              </div>
              </div>

              <div
                id="st-item-panel-detalhes"
                role="tabpanel"
                aria-labelledby="st-item-tab-detalhes"
                hidden={modalItemAba !== 'detalhes'}
                className="st-modal-tabpanel"
              >
                <label className="st-field">
                  <span>Link da foto (opcional)</span>
                  <input
                    className="st-input"
                    type="url"
                    inputMode="url"
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={itemForm.imagemLink}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, imagemLink: e.target.value }))
                    }
                  />
                  <p className="st-field__hint">
                    Cole a URL pública da imagem (http ou https). Deixe em branco para remover a foto.
                  </p>
                </label>
                {itemFormImagemPreview ? (
                  <div className="st-item-form-preview">
                    <img
                      src={itemFormImagemPreview}
                      alt="Prévia da foto"
                      className="st-item-form-preview__img"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="st-item-form-preview st-item-form-preview--empty" aria-hidden>
                    <span>Prévia da foto</span>
                  </div>
                )}
                {itemEditandoId &&
                  (() => {
                    const emEdicao = itens.find((i) => i.id === itemEditandoId)
                    const ref = emEdicao?.imagem_url?.trim()
                    if (ref && !/^https?:\/\//i.test(ref) && !itemForm.imagemLink.trim()) {
                      return (
                        <p className="st-field__hint">
                          Este item possui foto armazenada no sistema legado. Informe um link para
                          substituir ou salve em branco para manter o arquivo atual.
                        </p>
                      )
                    }
                    return null
                  })()}
                <label className="st-field">
                  <span>Descrição do produto (opcional)</span>
                  <textarea
                    className="st-input st-textarea"
                    rows={5}
                    placeholder="Detalhes técnicos, composição, observações para venda⬦"
                    value={itemForm.descricao}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, descricao: e.target.value }))
                    }
                  />
                </label>
              </div>
              </div>

              {formError && <p className="st-form-error st-form-error--modal-foot">{formError}</p>}
              <div className="st-form-actions st-form-actions--modal-foot">
                <button type="button" className="st-ghost-btn" onClick={fecharModalItem}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="st-primary-btn"
                  disabled={
                    salvandoItem || (!itemEditandoId && (itemSkuLoading || !itemForm.sku.trim()))
                  }
                >
                  {salvandoItem ? 'Salvando...' : itemEditandoId ? 'Salvar alterações' : 'Salvar item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalMovOpen && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="st-mov-title">
          <div className="st-modal st-modal--lg">
            <div className="st-modal__head">
              <h2 id="st-mov-title" className="st-modal__title">Nova movimentação</h2>
              <button type="button" className="st-modal__close" onClick={() => setModalMovOpen(false)}>
                ×
              </button>
            </div>
            <form className="st-form" onSubmit={handleSalvarMovimentacao}>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Item *</span>
                  <EstoqueItemPicker
                    itens={itens}
                    value={movForm.itemId}
                    onChange={(itemId) => setMovForm((prev) => ({ ...prev, itemId }))}
                    placeholder="Buscar por nome ou SKU…"
                    required
                  />
                </label>
                <label className="st-field">
                  <span>Tipo *</span>
                  <select
                    className="st-input"
                    value={movForm.tipo}
                    onChange={(e) => setMovForm((prev) => ({ ...prev, tipo: e.target.value as TipoMovimentacao }))}
                  >
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                    <option value="ajuste">Ajuste</option>
                  </select>
                </label>
                <label className="st-field">
                  <span>Quantidade *</span>
                  <input
                    className="st-input"
                    type="number"
                    step={1}
                    inputMode="numeric"
                    value={movForm.quantidade}
                    onChange={(e) =>
                      setMovForm((prev) => ({
                        ...prev,
                        quantidade: filtrarInputQuantidadeInteira(
                          e.target.value,
                          prev.tipo === 'ajuste',
                        ),
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Origem</span>
                  <input
                    className="st-input"
                    value={movForm.origem}
                    onChange={(e) => setMovForm((prev) => ({ ...prev, origem: e.target.value }))}
                    placeholder="NF, OS, ajuste manual..."
                  />
                </label>
                <label className="st-field">
                  <span>Observação</span>
                  <input
                    className="st-input"
                    value={movForm.observacao}
                    onChange={(e) => setMovForm((prev) => ({ ...prev, observacao: e.target.value }))}
                  />
                </label>
              </div>
              {formError && <p className="st-form-error">{formError}</p>}
              <div className="st-form-actions">
                <button type="button" className="st-ghost-btn" onClick={() => setModalMovOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="st-primary-btn" disabled={salvandoMov}>
                  {salvandoMov ? 'Salvando...' : 'Salvar movimentação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalKitOpen && (
        <div
          className="st-modal-overlay st-modal-overlay--scroll"
          role="dialog"
          aria-modal="true"
          aria-labelledby="st-kit-title"
        >
          <div className="st-modal st-modal--lg st-modal--scroll">
            <div className="st-modal__head">
              <h2 id="st-kit-title" className="st-modal__title">
                {kitEditandoId
                  ? 'Editar composição do kit'
                  : kitReceitaOrigemNome
                    ? 'Novo kit a partir de receita'
                    : 'Novo kit composto'}
              </h2>
              <button type="button" className="st-modal__close" onClick={fecharModalKit}>
                ×
              </button>
            </div>
            <form className="st-form st-form--modal-scroll" onSubmit={handleSalvarKit}>
              <div className="st-modal__body">
              {kitReceitaOrigemNome ? (
                <p className="st-field__hint st-kit-receita-origem">
                  Receita base: <strong>{kitReceitaOrigemNome}</strong>. Os componentes foram copiados —
                  ajuste o nome, escolha o <strong>item resultante</strong> e salve como um kit novo.
                </p>
              ) : null}
              <div className="st-form-grid">
                <label className="st-field">
                  <span>SKU do kit</span>
                  <input
                    className="st-input"
                    value={kitSkuLoading ? '' : kitForm.sku}
                    placeholder={kitSkuLoading ? 'Gerando…' : undefined}
                    readOnly
                    aria-readonly="true"
                    aria-busy={kitSkuLoading}
                  />
                </label>
                <label className="st-field">
                  <span>Nome do kit *</span>
                  <input
                    className="st-input"
                    value={kitForm.nome}
                    onChange={(e) => setKitForm((prev) => ({ ...prev, nome: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <label className="st-field">
                <span>Item resultante (entrada) *</span>
                <EstoqueItemPicker
                  itens={itens}
                  value={kitForm.itemResultanteId}
                  onChange={definirItemResultanteKit}
                  placeholder="Buscar produto montado (nome ou SKU)…"
                  required
                />
              </label>
              <div className="st-kit-comp">
                <div className="st-kit-comp__head">
                  <span className="st-kit-comp__title">Componentes (saída no estoque) *</span>
                  <button
                    type="button"
                    className="st-link-btn"
                    onClick={adicionarLinhaComponenteKit}
                  >
                    + Adicionar item
                  </button>
                </div>
                <p className="st-field__hint">
                  Liste todas as peças consumidas na montagem. Linhas em branco são ignoradas ao salvar.
                  {kitEditandoId && (
                    <>
                      {' '}
                      Alterações valem para novas montagens; movimentações já registradas não são alteradas.
                    </>
                  )}
                </p>
                <ul className="st-kit-comp__list" aria-label="Lista de componentes do kit">
                  {kitForm.componentes.map((linha, index) => {
                    const ehLinhaNova = !linha.itemId.trim()
                    const ehUltimaLinha = index === kitForm.componentes.length - 1
                    const bloquearRemoverLinhaNova = ehLinhaNova && ehUltimaLinha

                    return (
                    <li
                      key={linha.id}
                      className={`st-kit-comp__row${ehLinhaNova && ehUltimaLinha ? ' is-nova-linha' : ''}`}
                    >
                      <label className="st-field st-kit-comp__item">
                        <span>
                          {ehLinhaNova && ehUltimaLinha
                            ? 'Novo componente'
                            : `Item ${index + 1}`}
                        </span>
                        <EstoqueItemPicker
                          itens={itensParaComponenteKit}
                          value={linha.itemId}
                          onChange={(itemId) =>
                            atualizarLinhaComponenteKit(linha.id, { itemId })
                          }
                          placeholder="Buscar peça (nome ou SKU)…"
                        />
                      </label>
                      <label className="st-field st-kit-comp__qtd">
                        <span>Qtd.</span>
                        <input
                          className="st-input"
                          type="number"
                          step={1}
                          min={1}
                          inputMode="numeric"
                          value={linha.quantidade}
                          onChange={(e) =>
                            atualizarLinhaComponenteKit(linha.id, {
                              quantidade: filtrarInputQuantidadeInteira(e.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="st-kit-comp__remove"
                        aria-label={`Remover componente ${index + 1}`}
                        onClick={() => removerLinhaComponenteKit(linha.id)}
                        disabled={bloquearRemoverLinhaNova}
                      >
                        ×
                      </button>
                    </li>
                    )
                  })}
                </ul>
              </div>
              <div className="st-kit-custo-total" aria-live="polite">
                <span className="st-kit-custo-total__label">Custo total do kit (1 un.)</span>
                <strong className="st-kit-custo-total__valor">{formatBRL(custoKitForm)}</strong>
                <span className="st-kit-custo-total__hint">
                  Soma do custo médio de cada componente × quantidade na receita.
                </span>
              </div>
              </div>
              {formError && <p className="st-form-error st-form-error--modal-foot">{formError}</p>}
              <div className="st-form-actions st-form-actions--modal-foot">
                <button type="button" className="st-ghost-btn" onClick={fecharModalKit}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="st-primary-btn"
                  disabled={salvandoKit || kitSkuLoading || (!kitEditandoId && !kitForm.sku.trim())}
                >
                  {salvandoKit
                    ? 'Salvando...'
                    : kitEditandoId
                      ? 'Salvar alterações'
                      : kitReceitaOrigemNome
                        ? 'Criar kit'
                        : 'Salvar kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalDesmontagemOpen && (
        <div
          className="st-modal-overlay st-modal-overlay--scroll"
          role="dialog"
          aria-modal="true"
          aria-labelledby="st-desmontagem-title"
        >
          <div className="st-modal st-modal--lg st-modal--scroll">
            <div className="st-modal__head">
              <h2 id="st-desmontagem-title" className="st-modal__title">Desmontar kit</h2>
              <button
                type="button"
                className="st-modal__close"
                onClick={() => setModalDesmontagemOpen(false)}
              >
                ×
              </button>
            </div>
            <form className="st-form st-form--modal-scroll" onSubmit={handleDesmontarKit}>
              <div className="st-modal__body">
              <label className="st-field">
                <span>Kit *</span>
                <select
                  className="st-input"
                  value={desmontagemForm.kitId}
                  onChange={(e) =>
                    setDesmontagemForm((prev) => ({ ...prev, kitId: e.target.value }))
                  }
                  required
                >
                  <option value="">Selecione...</option>
                  {kits.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.sku} — {kit.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Quantidade a desmontar *</span>
                  <input
                    className="st-input"
                    type="number"
                    step={1}
                    min={1}
                    inputMode="numeric"
                    value={desmontagemForm.quantidade}
                    onChange={(e) =>
                      setDesmontagemForm((prev) => ({
                        ...prev,
                        quantidade: filtrarInputQuantidadeInteira(e.target.value),
                      }))
                    }
                    required
                  />
                  {saldoItemResultanteDesmontagem !== null && (
                    <span className="st-field__hint">
                      Estoque do item montado:{' '}
                      <strong>{formatQuantidadeInteira(saldoItemResultanteDesmontagem)}</strong> un.
                      {qtdDesmontagemNum > saldoItemResultanteDesmontagem && (
                        <span className="st-form-error"> — quantidade acima do disponível</span>
                      )}
                    </span>
                  )}
                </label>
                <label className="st-field">
                  <span>Origem</span>
                  <input
                    className="st-input"
                    value={desmontagemForm.origem}
                    onChange={(e) =>
                      setDesmontagemForm((prev) => ({ ...prev, origem: e.target.value }))
                    }
                    placeholder="Ex.: estorno montagem acidental"
                  />
                </label>
              </div>
              {kitDesmontagemSelecionado && (
                <div className="st-kit-montagem-preview">
                  <p className="st-kit-montagem-preview__title">Movimentações desta desmontagem</p>
                  <ul>
                    <li>
                      <span className="st-kit-montagem-preview__saida">
                        Saída: {formatQuantidadeInteira(qtdDesmontagemNum)}×{' '}
                        {kitDesmontagemSelecionado.itemResultanteNome ?? 'item montado'}
                      </span>
                    </li>
                    {kitDesmontagemSelecionado.componentes.map((c) => (
                      <li key={c.id}>
                        <span className="st-kit-montagem-preview__entrada">
                          Entrada: {formatQuantidadeInteira(c.quantidade * qtdDesmontagemNum)}×{' '}
                          {c.componenteNome}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
              {formError && <p className="st-form-error st-form-error--modal-foot">{formError}</p>}
              <div className="st-form-actions st-form-actions--modal-foot">
                <button
                  type="button"
                  className="st-ghost-btn"
                  onClick={() => setModalDesmontagemOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="st-primary-btn"
                  disabled={
                    salvandoDesmontagem ||
                    (saldoItemResultanteDesmontagem !== null &&
                      qtdDesmontagemNum > saldoItemResultanteDesmontagem)
                  }
                >
                  {salvandoDesmontagem ? 'Processando...' : 'Desmontar kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalMontagemOpen && (
        <div
          className="st-modal-overlay st-modal-overlay--scroll"
          role="dialog"
          aria-modal="true"
          aria-labelledby="st-montagem-title"
        >
          <div className="st-modal st-modal--lg st-modal--scroll">
            <div className="st-modal__head">
              <h2 id="st-montagem-title" className="st-modal__title">Montar kit</h2>
              <button type="button" className="st-modal__close" onClick={() => setModalMontagemOpen(false)}>
                ×
              </button>
            </div>
            <form className="st-form st-form--modal-scroll" onSubmit={handleMontarKit}>
              <div className="st-modal__body">
              <label className="st-field">
                <span>Kit *</span>
                <select
                  className="st-input"
                  value={montagemForm.kitId}
                  onChange={(e) => setMontagemForm((prev) => ({ ...prev, kitId: e.target.value }))}
                  required
                >
                  <option value="">Selecione...</option>
                  {kits.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.sku} — {kit.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="st-form-grid">
                <label className="st-field">
                  <span>Quantidade *</span>
                  <input
                    className="st-input"
                    type="number"
                    step={1}
                    min={1}
                    inputMode="numeric"
                    value={montagemForm.quantidade}
                    onChange={(e) =>
                      setMontagemForm((prev) => ({
                        ...prev,
                        quantidade: filtrarInputQuantidadeInteira(e.target.value),
                      }))
                    }
                    required
                  />
                </label>
                <label className="st-field">
                  <span>Origem</span>
                  <input
                    className="st-input"
                    value={montagemForm.origem}
                    onChange={(e) => setMontagemForm((prev) => ({ ...prev, origem: e.target.value }))}
                    placeholder="Ex.: OS #1234"
                  />
                </label>
              </div>
              {kitMontagemSelecionado && (
                <div
                  className={`st-kit-montagem-preview${faltasEstoqueMontagem.length > 0 ? ' has-falta' : ''}`}
                >
                  <p className="st-kit-montagem-preview__title">Movimentações desta montagem</p>
                  <ul>
                    {kitMontagemSelecionado.componentes.map((c) => {
                      const qtdSaida = c.quantidade * qtdMontagemNum
                      const saldo = saldoComponenteMontagemPorId.get(c.componenteItemId) ?? 0
                      const insuficiente = qtdMontagemNum > 0 && saldo < qtdSaida

                      return (
                        <li key={c.id}>
                          <span
                            className={`st-kit-montagem-preview__saida${insuficiente ? ' is-insuficiente' : ''}`}
                          >
                            Saída: {formatQuantidadeInteira(qtdSaida)}× {c.componenteNome}
                            {qtdMontagemNum > 0 && (
                              <span className="st-kit-montagem-preview__saldo">
                                {' '}
                                (estoque: {formatQuantidadeInteira(saldo)})
                              </span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                    <li>
                      <span className="st-kit-montagem-preview__entrada">
                        Entrada: {formatQuantidadeInteira(qtdMontagemNum)}×{' '}
                        {kitMontagemSelecionado.itemResultanteNome ?? 'item resultante'}
                      </span>
                    </li>
                  </ul>
                  {faltasEstoqueMontagem.length > 0 && (
                    <p className="st-kit-montagem-preview__alert" role="alert">
                      {mensagemFaltaEstoqueMontagemKit(faltasEstoqueMontagem)}
                    </p>
                  )}
                </div>
              )}
              </div>
              {formError && (
                <p className="st-form-error st-form-error--modal-foot st-form-error--pre">{formError}</p>
              )}
              <div className="st-form-actions st-form-actions--modal-foot">
                <button type="button" className="st-ghost-btn" onClick={() => setModalMontagemOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="st-primary-btn"
                  disabled={salvandoMontagem || faltasEstoqueMontagem.length > 0}
                  title={
                    faltasEstoqueMontagem.length > 0
                      ? 'Corrija o estoque dos componentes em falta'
                      : undefined
                  }
                >
                  {salvandoMontagem ? 'Processando...' : 'Montar kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EstoqueImportModal
        open={modalImportOpen}
        companyId={companyId}
        activeStoreId={activeStoreId}
        fornecedores={fornecedores}
        onClose={() => setModalImportOpen(false)}
        onImported={carregarDados}
      />
    </div>
  )
}

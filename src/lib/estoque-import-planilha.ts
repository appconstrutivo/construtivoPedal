import * as XLSX from 'xlsx'
import { ehQuantidadeInteiraNaoNegativa } from './quantidade'

/** Leitura local (ArrayBuffer no navegador). O arquivo .xlsx nunca é enviado ao Supabase Storage. */

export type LinhaPlanilhaEstoque = {
  linhaPlanilha: number
  skuFornecedor: string
  nome: string
  custo: number
  quantidade: number
}

export type ResultadoParsePlanilha = {
  linhas: LinhaPlanilhaEstoque[]
  erros: string[]
  totalLinhasLidas: number
}

function normalizarCabecalho(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function indiceColuna(headers: string[], padroes: RegExp[]): number {
  return headers.findIndex((h) => padroes.some((p) => p.test(h)))
}

/** Converte "R$ 5,48" ou número da célula para decimal. */
export function parsePrecoPlanilha(val: unknown): number {
  if (val == null || val === '') return Number.NaN
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const s = String(val)
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
  if (!s) return Number.NaN
  const n =
    s.includes(',') && s.includes('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

export function parseQuantidadePlanilha(val: unknown): number {
  if (val == null || val === '') return Number.NaN
  if (typeof val === 'number' && Number.isFinite(val)) {
    return ehQuantidadeInteiraNaoNegativa(val) ? val : Number.NaN
  }
  const n = Number(String(val).trim().replace(',', '.'))
  return ehQuantidadeInteiraNaoNegativa(n) ? n : Number.NaN
}

export function parsePlanilhaEstoque(buffer: ArrayBuffer): ResultadoParsePlanilha {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { linhas: [], erros: ['Planilha vazia ou sem abas.'], totalLinhasLidas: 0 }
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  })

  if (rows.length < 2) {
    return {
      linhas: [],
      erros: ['Planilha sem dados (é necessário cabeçalho + ao menos uma linha).'],
      totalLinhasLidas: rows.length,
    }
  }

  const headers = (rows[0] as unknown[]).map(normalizarCabecalho)
  const idxSku = indiceColuna(headers, [/^sku$/])
  const idxNome = indiceColuna(headers, [/^nome$/])
  const idxPreco = indiceColuna(headers, [/preco de venda/, /preço de venda/])
  const idxQtd = indiceColuna(headers, [/^quantidade$/])

  const erros: string[] = []
  if (idxSku < 0) erros.push('Coluna "SKU" não encontrada.')
  if (idxNome < 0) erros.push('Coluna "Nome" não encontrada.')
  if (idxPreco < 0) erros.push('Coluna "Preço de Venda" não encontrada.')
  if (idxQtd < 0) erros.push('Coluna "Quantidade" não encontrada.')
  if (erros.length > 0) {
    return { linhas: [], erros, totalLinhasLidas: rows.length }
  }

  const linhas: LinhaPlanilhaEstoque[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue

    const skuFornecedor = String(row[idxSku] ?? '').trim()
    const nome = String(row[idxNome] ?? '').trim()
    const custo = parsePrecoPlanilha(row[idxPreco])
    const quantidade = parseQuantidadePlanilha(row[idxQtd])
    const linhaPlanilha = i + 1

    if (!skuFornecedor && !nome) continue

    if (!nome) {
      erros.push(`Linha ${linhaPlanilha}: nome obrigatório.`)
      continue
    }
    if (!skuFornecedor) {
      erros.push(`Linha ${linhaPlanilha}: SKU do fornecedor obrigatório.`)
      continue
    }
    if (!Number.isFinite(custo) || custo < 0) {
      erros.push(`Linha ${linhaPlanilha}: preço de venda inválido.`)
      continue
    }
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      erros.push(`Linha ${linhaPlanilha}: quantidade inválida (use número inteiro).`)
      continue
    }

    linhas.push({ linhaPlanilha, skuFornecedor, nome, custo, quantidade })
  }

  if (linhas.length === 0 && erros.length === 0) {
    erros.push('Nenhuma linha válida encontrada na planilha.')
  }

  return { linhas, erros, totalLinhasLidas: rows.length }
}

/** Acréscimo opcional no custo da planilha (impostos, cupons etc.). */
export function calcularCustoComAdicional(custo: number, adicionalPct: number): number {
  const a = Number(adicionalPct)
  if (!Number.isFinite(a) || a <= 0) return custo
  return Math.round(custo * (1 + a / 100) * 100) / 100
}

export function calcularPrecoComMarkup(custo: number, markupPct: number): number {
  const m = Number(markupPct)
  if (!Number.isFinite(m)) return custo
  return Math.round(custo * (1 + m / 100) * 100) / 100
}

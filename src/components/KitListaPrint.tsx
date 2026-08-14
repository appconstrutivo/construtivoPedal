import { formatQuantidadeInteira } from '../lib/quantidade'
import { roundMoney } from '../lib/money'
import type { EstoqueItemComLocal, KitComComponentes } from '../services/estoque.service'

export type KitListaPrintLinha = {
  descricao: string
  quantidade: number
  valorUnitario: number
  subtotal: number
  fornecedor: string
}

type KitListaPrintProps = {
  kit: KitComComponentes
  linhas: KitListaPrintLinha[]
  custoTotal: number
  companyName: string
  storeName?: string | null
}

function formatBRL(v: number) {
  const n = Number.isFinite(v) ? v : 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarLinhasListaKit(
  kit: KitComComponentes,
  itens: Array<Pick<EstoqueItemComLocal, 'id' | 'custo_medio' | 'fornecedorNome' | 'nome'>>,
): KitListaPrintLinha[] {
  const porId = new Map(itens.map((i) => [i.id, i]))

  return kit.componentes.map((c) => {
    const item = porId.get(c.componenteItemId)
    const valorUnitario = roundMoney(Number(item?.custo_medio) || 0)
    const quantidade = Number(c.quantidade) || 0
    return {
      descricao: c.componenteNome || item?.nome || 'Componente',
      quantidade,
      valorUnitario,
      subtotal: roundMoney(valorUnitario * quantidade),
      fornecedor: item?.fornecedorNome?.trim() || '—',
    }
  })
}

export function KitListaPrintHtml({
  kit,
  linhas,
  custoTotal,
  companyName,
  storeName,
}: KitListaPrintProps) {
  const linhasHtml = linhas
    .map(
      (linha) =>
        '<tr>' +
        `<td>${escapeHtml(linha.descricao)}</td>` +
        `<td class="num">${formatQuantidadeInteira(linha.quantidade)}</td>` +
        `<td class="num">${formatBRL(linha.valorUnitario)}</td>` +
        `<td class="num">${formatBRL(linha.subtotal)}</td>` +
        `<td>${escapeHtml(linha.fornecedor)}</td>` +
        '</tr>',
    )
    .join('')

  const parts: string[] = []
  parts.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />')
  parts.push(`<title>Lista do kit ${escapeHtml(kit.sku)} — ${escapeHtml(kit.nome)}</title>`)
  parts.push('<style>')
  parts.push('@page{size:A4 portrait;margin:16mm 16mm}')
  parts.push('body{font-family:Segoe UI,system-ui,sans-serif;font-size:11pt;color:#111;margin:0}')
  parts.push('.head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}')
  parts.push('.head h1{margin:0;font-size:16pt}')
  parts.push('.head h2{margin:6px 0 0;font-size:12pt;font-weight:650}')
  parts.push('.meta{font-size:10pt;color:#444;line-height:1.45}')
  parts.push('table{width:100%;border-collapse:collapse;margin:12px 0}')
  parts.push('th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left;vertical-align:top}')
  parts.push('th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.03em;color:#666}')
  parts.push('.num{text-align:right;white-space:nowrap}')
  parts.push('.totals{margin-top:8px;max-width:280px;margin-left:auto}')
  parts.push('.totals .row{display:flex;justify-content:space-between;padding:4px 0}')
  parts.push('.totals .total{font-weight:800;font-size:13pt;border-top:2px solid #111;margin-top:6px;padding-top:8px}')
  parts.push('.foot{margin-top:28px;font-size:9pt;color:#888;text-align:center}')
  parts.push('</style></head><body>')

  parts.push('<div class="head"><div>')
  parts.push(`<h1>${escapeHtml(companyName)}</h1>`)
  parts.push('<h2>Lista de componentes do kit</h2>')
  parts.push(`<p class="meta"><strong>${escapeHtml(kit.nome)}</strong> · ${escapeHtml(kit.sku)}</p>`)
  parts.push('</div><div class="meta" style="text-align:right">')
  if (storeName?.trim()) parts.push(`<div>Loja: <strong>${escapeHtml(storeName.trim())}</strong></div>`)
  if (kit.itemResultanteNome) {
    parts.push(`<div>Item resultante: ${escapeHtml(kit.itemResultanteNome)}</div>`)
  }
  parts.push(`<div>Emitido: ${formatDate(new Date())}</div>`)
  parts.push(`<div>${formatQuantidadeInteira(kit.componentes.length)} componente(s)</div>`)
  parts.push('</div></div>')

  if (linhas.length === 0) {
    parts.push('<p class="meta">Este kit não possui componentes cadastrados.</p>')
  } else {
    parts.push(
      '<table><thead><tr>' +
        '<th>Descrição</th>' +
        '<th class="num">Qtd</th>' +
        '<th class="num">Valor un.</th>' +
        '<th class="num">Subtotal</th>' +
        '<th>Fornecedor</th>' +
        '</tr></thead>',
    )
    parts.push(`<tbody>${linhasHtml}</tbody></table>`)
    parts.push('<div class="totals">')
    parts.push(`<div class="row total"><span>Custo total</span><span>${formatBRL(custoTotal)}</span></div>`)
    parts.push('</div>')
  }

  parts.push(
    '<p class="foot">Lista operacional de composição · valores pelo custo médio do estoque · Construtivo Pedal</p>',
  )
  parts.push('</body></html>')

  return parts.join('')
}

export function imprimirListaKit(
  kit: KitComComponentes,
  itens: Array<Pick<EstoqueItemComLocal, 'id' | 'custo_medio' | 'fornecedorNome' | 'nome'>>,
  companyName: string,
  storeName?: string | null,
) {
  const linhas = montarLinhasListaKit(kit, itens)
  const custoTotal = roundMoney(linhas.reduce((acc, l) => acc + l.subtotal, 0))
  const html = KitListaPrintHtml({ kit, linhas, custoTotal, companyName, storeName })
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) throw new Error('Permita pop-ups para gerar o PDF da lista do kit.')
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

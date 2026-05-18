import type { OrcamentoDetalhe } from '../services/orcamento.service'
import { calcularSubtotalOrcamento, calcularTotalOrcamento } from '../services/orcamento.service'

type OrcamentoPrintProps = {
  det: OrcamentoDetalhe
  companyName: string
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T12:00:00`)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function OrcamentoPrintHtml({ det, companyName }: OrcamentoPrintProps) {
  const subtotal = calcularSubtotalOrcamento(det.itens)
  const total = calcularTotalOrcamento(det.itens, det.desconto)
  const linhas = det.itens
    .map((item) => {
      const sub = item.quantidade * item.preco_unitario
      const tipo = item.tipo === 'servico' ? 'Serviço' : 'Peça'
      return (
        '<tr>' +
        `<td>${escapeHtml(item.descricao)}<br /><small>${tipo}</small></td>` +
        `<td class="num">${item.quantidade}</td>` +
        `<td class="num">${formatBRL(item.preco_unitario)}</td>` +
        `<td class="num">${formatBRL(sub)}</td>` +
        '</tr>'
      )
    })
    .join('')

  const parts: string[] = []
  parts.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />')
  parts.push(`<title>Orçamento #${det.numero}</title>`)
  parts.push('<style>')
  parts.push('@page{size:A4 portrait;margin:18mm 20mm}')
  parts.push('body{font-family:Segoe UI,system-ui,sans-serif;font-size:11pt;color:#111;margin:0}')
  parts.push('.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}')
  parts.push('.head h1{margin:0;font-size:18pt}')
  parts.push('.meta{font-size:10pt;color:#444}')
  parts.push('table{width:100%;border-collapse:collapse;margin:16px 0}')
  parts.push('th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left}')
  parts.push('th{font-size:9pt;text-transform:uppercase;color:#666}')
  parts.push('.num{text-align:right;white-space:nowrap}')
  parts.push('.totals{margin-top:12px;max-width:280px;margin-left:auto}')
  parts.push('.totals .row{display:flex;justify-content:space-between;padding:4px 0}')
  parts.push('.totals .total{font-weight:800;font-size:13pt;border-top:2px solid #111;margin-top:6px;padding-top:8px}')
  parts.push('.foot{margin-top:32px;font-size:9pt;color:#888;text-align:center}')
  parts.push('</style></head><body>')

  parts.push('<div class="head"><div>')
  parts.push(`<h1>${escapeHtml(companyName)}</h1>`)
  parts.push(`<p class="meta">Orçamento nº <strong>${det.numero}</strong></p></div>`)
  parts.push('<div class="meta" style="text-align:right">')
  parts.push(`<motion>Cliente: <strong>${escapeHtml(det.clienteNome)}</strong></motion>`)
  if (det.bikeLabel) parts.push(`<motion>Bike: ${escapeHtml(det.bikeLabel)}</motion>`)
  parts.push(`<motion>Emitido: ${formatDate(det.created_at)}</motion>`)
  if (det.valido_ate) parts.push(`<motion>Válido até: ${formatDate(det.valido_ate)}</motion>`)
  parts.push('</div></div>')

  if (det.resumo) parts.push(`<p><strong>Resumo:</strong> ${escapeHtml(det.resumo)}</p>`)
  parts.push('<table><thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Subtotal</th></tr></thead>')
  parts.push(`<tbody>${linhas}</tbody></table>`)
  parts.push('<div class="totals">')
  parts.push(`<div class="row"><span>Subtotal</span><span>${formatBRL(subtotal)}</span></div>`)
  if (Number(det.desconto) > 0) {
    parts.push(`<div class="row"><span>Desconto</span><span>− ${formatBRL(Number(det.desconto))}</span></div>`)
  }
  parts.push(`<div class="row total"><span>Total</span><span>${formatBRL(total)}</span></div>`)
  parts.push('</div>')
  if (det.observacoes) {
    parts.push(`<p><strong>Observações:</strong> ${escapeHtml(det.observacoes)}</p>`)
  }
  parts.push('<p class="foot">Documento comercial — sem valor fiscal · Construtivo Pedal</p>')
  parts.push('</body></html>')

  return parts.join('').replace(/<motion>/g, '<div>').replace(/<\/motion>/g, '</div>')
}

export function imprimirOrcamento(det: OrcamentoDetalhe, companyName: string) {
  const html = OrcamentoPrintHtml({ det, companyName })
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) throw new Error('Permita pop-ups para imprimir o orçamento.')
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

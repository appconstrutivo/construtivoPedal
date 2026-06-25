import type { OrdemServicoDetalhe } from '../services/oficina.service'

export type OsPrintCabecalho = {
  status?: string
  problema?: string
  diagnostico?: string
  observacoes?: string
}

export type OsPrintLocalEstoque = {
  codigo: string | null
  nome: string | null
}

type OsPrintProps = {
  det: OrdemServicoDetalhe
  companyName: string
  storeName?: string | null
  cabecalho?: OsPrintCabecalho
  locaisPorItemId?: Record<string, OsPrintLocalEstoque>
}

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_aprovacao: 'Aguardando cliente',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s
}

function formatLocalCodigoExibicao(codigo: string): string {
  const parts = codigo.trim().split('-').map((p) => p.trim())
  if (parts.length === 3) {
    const divisoria = Number.parseInt(parts[2], 10)
    const div = Number.isFinite(divisoria) ? String(divisoria) : parts[2]
    return `${parts[0]} - ${parts[1]} - ${div}`
  }
  return codigo.replace(/\s*-\s*/g, ' - ')
}

function formatLocalHtml(local: OsPrintLocalEstoque | undefined): string {
  if (!local?.codigo?.trim()) return '—'
  return escapeHtml(formatLocalCodigoExibicao(local.codigo))
}

export function OsPrintHtml({ det, companyName, storeName, cabecalho, locaisPorItemId }: OsPrintProps) {
  const status = cabecalho?.status ?? det.status
  const problema = cabecalho?.problema ?? det.problema_relatado ?? ''
  const diagnostico = cabecalho?.diagnostico ?? det.diagnostico ?? ''
  const observacoes = cabecalho?.observacoes ?? det.observacoes_internas ?? ''

  const checklistHtml = det.checklist.length
    ? det.checklist
        .map(
          (i) =>
            `<li class="check-item${i.concluido ? ' check-item--done' : ''}">` +
            `<span class="check-box" aria-hidden="true">${i.concluido ? '☑' : '☐'}</span>` +
            `<span>${escapeHtml(i.rotulo)}</span></li>`,
        )
        .join('')
    : '<li class="check-item check-item--empty">Nenhum item no checklist.</li>'

  const linhasItens = det.itens
    .map((item) => {
      const tipo = item.tipo === 'servico' ? 'Serviço' : 'Peça'
      const local =
        item.tipo === 'peca' && item.estoque_item_id
          ? locaisPorItemId?.[item.estoque_item_id]
          : undefined
      return (
        '<tr>' +
        `<td>${escapeHtml(item.descricao)}</td>` +
        `<td class="tipo">${tipo}</td>` +
        `<td class="num">${item.quantidade}</td>` +
        `<td class="local">${formatLocalHtml(local)}</td>` +
        '</tr>'
      )
    })
    .join('')

  const parts: string[] = []
  parts.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />')
  parts.push(`<title>OS #${det.numero}</title>`)
  parts.push('<style>')
  parts.push('@page{size:A4 portrait;margin:14mm 16mm}')
  parts.push('*{box-sizing:border-box}')
  parts.push('body{font-family:Segoe UI,system-ui,sans-serif;font-size:11pt;color:#111;margin:0;line-height:1.45}')
  parts.push('.head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}')
  parts.push('.head h1{margin:0 0 4px;font-size:17pt;font-weight:800}')
  parts.push('.head__sub{margin:0;font-size:10pt;color:#555}')
  parts.push('.head__doc{text-align:right;flex-shrink:0}')
  parts.push('.head__doc-title{margin:0 0 6px;font-size:13pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em}')
  parts.push('.head__doc-meta{margin:0;font-size:10pt;color:#444;line-height:1.5}')
  parts.push('.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:#e2e8f0;color:#334155}')
  parts.push('.info{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:16px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}')
  parts.push('.info dt{margin:0;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b}')
  parts.push('.info dd{margin:2px 0 0;font-size:11pt;font-weight:600}')
  parts.push('.block{margin-bottom:14px}')
  parts.push('.block h2{margin:0 0 6px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b}')
  parts.push('.block p{margin:0;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;white-space:pre-wrap}')
  parts.push('.block--highlight p{border-color:#cbd5e1;background:#f1f5f9;font-weight:600}')
  parts.push('.checklist{margin:0;padding:0;list-style:none;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}')
  parts.push('.check-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid #e2e8f0}')
  parts.push('.check-item:last-child{border-bottom:none}')
  parts.push('.check-item--done{color:#64748b;text-decoration:line-through}')
  parts.push('.check-item--empty{color:#94a3b8;font-style:italic}')
  parts.push('.check-box{font-size:14pt;line-height:1;flex-shrink:0}')
  parts.push('table{width:100%;border-collapse:collapse;margin:8px 0 0}')
  parts.push('th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;vertical-align:top}')
  parts.push('th{background:#f1f5f9;font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569}')
  parts.push('.num{text-align:center;white-space:nowrap}')
  parts.push('.tipo{font-size:9.5pt;color:#64748b;white-space:nowrap}')
  parts.push('.local{font-size:10pt;font-weight:600;white-space:nowrap}')
  parts.push('.foot{margin-top:24px;padding-top:12px;border-top:1px dashed #cbd5e1;font-size:9pt;color:#94a3b8;text-align:center}')
  parts.push('@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}')
  parts.push('</style></head><body>')

  parts.push('<header class="head"><div>')
  parts.push(`<h1>${escapeHtml(companyName)}</h1>`)
  if (storeName?.trim()) parts.push(`<p class="head__sub">Loja: ${escapeHtml(storeName.trim())}</p>`)
  parts.push('<p class="head__sub">Uso interno — oficina</p></div>')
  parts.push('<div class="head__doc">')
  parts.push('<p class="head__doc-title">Ordem de serviço</p>')
  parts.push(`<p class="head__doc-meta">Nº <strong>${det.numero}</strong><br />`)
  parts.push(`<span class="badge">${escapeHtml(statusLabel(status))}</span><br />`)
  parts.push(`Aberta: ${formatDate(det.created_at)}`)
  if (det.closed_at) parts.push(`<br />Encerrada: ${formatDate(det.closed_at)}`)
  parts.push('</p></div></header>')

  parts.push('<dl class="info">')
  parts.push(`<div><dt>Cliente</dt><dd>${escapeHtml(det.clienteNome)}</dd></div>`)
  parts.push(
    `<div><dt>Bicicleta</dt><dd>${det.bikeLabel ? escapeHtml(det.bikeLabel) : '—'}</dd></div>`,
  )
  parts.push('</dl>')

  if (problema.trim()) {
    parts.push('<section class="block block--highlight">')
    parts.push('<h2>Problema relatado</h2>')
    parts.push(`<p>${escapeHtml(problema.trim())}</p></section>`)
  }

  if (diagnostico.trim()) {
    parts.push('<section class="block">')
    parts.push('<h2>Diagnóstico</h2>')
    parts.push(`<p>${escapeHtml(diagnostico.trim())}</p></section>`)
  }

  parts.push('<section class="block">')
  parts.push('<h2>Checklist</h2>')
  parts.push(`<ul class="checklist">${checklistHtml}</ul></section>`)

  parts.push('<section class="block">')
  parts.push('<h2>Peças e serviços</h2>')
  if (det.itens.length) {
    parts.push(
      '<table><thead><tr><th>Descrição</th><th>Tipo</th><th class="num">Qtd</th><th>Localização</th></tr></thead>',
    )
    parts.push(`<tbody>${linhasItens}</tbody></table>`)
  } else {
    parts.push('<p style="margin:0;color:#94a3b8;font-style:italic">Nenhum item lançado.</p>')
  }
  parts.push('</section>')

  if (observacoes.trim()) {
    parts.push('<section class="block">')
    parts.push('<h2>Observações internas</h2>')
    parts.push(`<p>${escapeHtml(observacoes.trim())}</p></section>`)
  }

  parts.push('<p class="foot">Documento interno — não fiscal · Construtivo Pedal</p>')
  parts.push('</body></html>')

  return parts.join('')
}

export function imprimirOrdemServico(
  det: OrdemServicoDetalhe,
  companyName: string,
  opts?: {
    storeName?: string | null
    cabecalho?: OsPrintCabecalho
    locaisPorItemId?: Record<string, OsPrintLocalEstoque>
  },
) {
  const html = OsPrintHtml({
    det,
    companyName,
    storeName: opts?.storeName,
    cabecalho: opts?.cabecalho,
    locaisPorItemId: opts?.locaisPorItemId,
  })
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) throw new Error('Permita pop-ups para imprimir a ordem de serviço.')
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

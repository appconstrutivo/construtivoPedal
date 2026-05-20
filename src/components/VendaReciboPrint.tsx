import type { VendaDetalhe } from '../services/lancamentos.service'
import { dataExibicaoVenda, resumoPagamentosVenda } from '../services/lancamentos.service'

type VendaReciboPrintProps = {
  venda: VendaDetalhe
  companyName: string
  segundaVia?: boolean
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function VendaReciboHtml({ venda, companyName, segundaVia = false }: VendaReciboPrintProps) {
  const linhas = venda.itens.map((item) => {
    const sub = item.quantidade * item.preco_unitario
    return `
      <tr>
        <td>${escapeHtml(item.descricao)}</td>
        <td class="num">${item.quantidade}</td>
        <td class="num">${formatBRL(item.preco_unitario)}</td>
        <td class="num">${formatBRL(sub)}</td>
      </tr>`
  })

  const cancelada = venda.status === 'cancelada'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo venda #${venda.numero}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 20mm;
    }
    * { box-sizing: border-box; }
    html, body {
      width: 210mm;
      min-height: 297mm;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 11pt;
      color: #111;
      background: #fff;
    }
    .page {
      width: 100%;
      min-height: 257mm;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #111;
      margin-bottom: 20px;
    }
    .head__brand h1 {
      margin: 0 0 6px;
      font-size: 20pt;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .head__brand p {
      margin: 0;
      color: #444;
      font-size: 11pt;
    }
    .head__doc {
      text-align: right;
      flex-shrink: 0;
    }
    .head__doc-title {
      margin: 0 0 8px;
      font-size: 14pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #333;
    }
    .head__doc-meta {
      margin: 0;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #444;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge--2via { background: #e0f2fe; color: #0369a1; }
    .badge--cancel { background: #fee2e2; color: #991b1b; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 32px;
      margin-bottom: 24px;
      padding: 16px 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .info-grid dt {
      margin: 0;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .info-grid dd {
      margin: 2px 0 0;
      font-size: 11pt;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      border-bottom: 2px solid #cbd5e1;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
    }
    td {
      border-bottom: 1px solid #e2e8f0;
      font-size: 10.5pt;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .num { text-align: right; white-space: nowrap; }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: auto;
      padding-top: 16px;
    }
    .totals {
      width: 280px;
    }
    .totals__row {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 6px 0;
      font-size: 11pt;
    }
    .totals__row dt {
      margin: 0;
      color: #64748b;
      font-weight: 500;
    }
    .totals__row dd {
      margin: 0;
      font-weight: 700;
    }
    .totals__row--disc dd { color: #b91c1c; }
    .totals__row--total {
      margin-top: 8px;
      padding-top: 12px;
      border-top: 2px solid #111;
      font-size: 14pt;
    }
    .totals__row--total dt,
    .totals__row--total dd {
      font-weight: 800;
      color: #111;
    }
    .foot {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px dashed #cbd5e1;
      font-size: 9pt;
      color: #64748b;
      text-align: center;
      line-height: 1.5;
    }
    @media screen {
      body {
        padding: 12mm;
        background: #e2e8f0;
      }
      .page {
        background: #fff;
        padding: 18mm 20mm;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        min-height: 297mm;
      }
    }
    @media print {
      html, body { width: auto; min-height: auto; }
      body { background: #fff; padding: 0; }
      .page {
        box-shadow: none;
        padding: 0;
        min-height: auto;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="head">
      <div class="head__brand">
        <h1>${escapeHtml(companyName)}</h1>
        <p>${escapeHtml(venda.lojaNome)}</p>
      </div>
      <div class="head__doc">
        <p class="head__doc-title">Recibo de venda</p>
        <p class="head__doc-meta">
          Nº <strong>${venda.numero}</strong><br />
          ${formatDateTime(dataExibicaoVenda(venda))}
        </p>
      </div>
    </header>

    <div class="badges">
      ${segundaVia ? '<span class="badge badge--2via">2ª via</span>' : ''}
      ${cancelada ? '<span class="badge badge--cancel">Venda cancelada</span>' : ''}
    </div>

    <dl class="info-grid">
      <div>
        <dt>Cliente</dt>
        <dd>${escapeHtml(venda.clienteNome ?? 'Consumidor / balcão')}</dd>
      </div>
      <div>
        <dt>${venda.pagamentos.length > 1 ? 'Pagamentos' : 'Forma de pagamento'}</dt>
        <dd>${escapeHtml(resumoPagamentosVenda(venda.forma_pagamento, venda.pagamentos))}</dd>
      </div>
      ${
        venda.clienteFone
          ? `<div><dt>Telefone</dt><dd>${escapeHtml(venda.clienteFone)}</dd></div>`
          : ''
      }
    </dl>

    <table>
      <thead>
        <tr>
          <th>Descrição</th>
          <th class="num">Qtd</th>
          <th class="num">Valor unit.</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>${linhas.join('')}</tbody>
    </table>

    <div class="totals-wrap">
      <dl class="totals">
        <div class="totals__row">
          <dt>Subtotal</dt>
          <dd>${formatBRL(Number(venda.subtotal))}</dd>
        </div>
        ${
          Number(venda.desconto) > 0
            ? `<div class="totals__row totals__row--disc"><dt>Desconto</dt><dd>− ${formatBRL(Number(venda.desconto))}</dd></div>`
            : ''
        }
        <div class="totals__row totals__row--total">
          <dt>Total</dt>
          <dd>${formatBRL(Number(venda.total))}</dd>
        </div>
      </dl>
    </div>

    <p class="foot">
      Construtivo Pedal — documento sem valor fiscal<br />
      Impresso em ${formatDateTime(new Date().toISOString())}
    </p>
  </div>
</body>
</html>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function imprimirReciboVenda(
  venda: VendaDetalhe,
  companyName: string,
  opts?: { segundaVia?: boolean },
) {
  const html = VendaReciboHtml({ venda, companyName, segundaVia: opts?.segundaVia ?? true })
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) {
    throw new Error('Permita pop-ups para imprimir o recibo.')
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => {
    w.print()
  }, 400)
}

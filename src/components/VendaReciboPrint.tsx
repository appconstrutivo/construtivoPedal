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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function formatNumeroDoc(numero: number) {
  return String(numero).padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1.')
}

function apenasDigitos(s: string) {
  return s.replace(/\D/g, '')
}

/** Chave visual de 44 dígitos (identificação interna, não é chave SEFAZ). */
function gerarChaveDocumento(venda: VendaDetalhe): string {
  const cnpj = apenasDigitos(venda.empresa?.cnpj ?? '00000000000000').padStart(14, '0').slice(0, 14)
  const data = new Date(dataExibicaoVenda(venda))
  const aa = String(data.getFullYear()).slice(2)
  const mm = String(data.getMonth() + 1).padStart(2, '0')
  const num = String(venda.numero).padStart(9, '0')
  const id = apenasDigitos(venda.id).padStart(8, '0').slice(0, 8)
  const raw = `${cnpj}${aa}${mm}55${num}${id}`.padEnd(44, '0').slice(0, 44)
  return raw.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

/** Padrões Interleaved 2 of 5 (1 = estreito, 2 = largo). */
const ITF_PATTERNS: Record<string, [number, number, number, number, number]> = {
  '0': [1, 1, 2, 2, 1],
  '1': [2, 1, 1, 1, 2],
  '2': [1, 2, 1, 1, 2],
  '3': [2, 2, 1, 1, 1],
  '4': [1, 1, 2, 1, 2],
  '5': [2, 1, 2, 1, 1],
  '6': [1, 2, 2, 1, 1],
  '7': [1, 1, 1, 2, 2],
  '8': [2, 1, 1, 2, 1],
  '9': [1, 2, 1, 2, 1],
}

function gerarBarcodeSvg(codigo: string): string {
  const raw = apenasDigitos(codigo).slice(0, 44) || '0'
  const digits = raw.length % 2 === 0 ? raw : `0${raw}`
  const module = 2
  const h = 42
  const bars: string[] = []
  let x = 0

  const appendBar = (widthModules: number) => {
    const w = widthModules * module
    bars.push(`<rect x="${x}" y="0" width="${w}" height="${h}" fill="#000"/>`)
    x += w
  }

  const appendSpace = (widthModules: number) => {
    x += widthModules * module
  }

  // Start: barra-espaço-barra-espaço (estreitos)
  appendBar(1)
  appendSpace(1)
  appendBar(1)
  appendSpace(1)

  for (let i = 0; i < digits.length; i += 2) {
    const p1 = ITF_PATTERNS[digits[i]] ?? ITF_PATTERNS['0']
    const p2 = ITF_PATTERNS[digits[i + 1]] ?? ITF_PATTERNS['0']
    for (let j = 0; j < 5; j++) {
      appendBar(p1[j])
      appendSpace(p2[j])
    }
  }

  // Stop: barra larga, espaço estreito, barra estreita
  appendBar(2)
  appendSpace(1)
  appendBar(1)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet">${bars.join('')}</svg>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function blocoCampo(label: string, valor: string, classe = '') {
  return `
    <div class="campo ${classe}">
      <span class="campo__label">${label}</span>
      <span class="campo__valor">${valor}</span>
    </div>`
}

export function VendaReciboHtml({ venda, companyName, segundaVia = false }: VendaReciboPrintProps) {
  const empresa = venda.empresa
  const loja = venda.loja
  const nomeEmpresa = empresa?.nome ?? companyName
  const razaoSocial = empresa?.razaoSocial ?? nomeEmpresa
  const enderecoEmitente = loja?.endereco ?? empresa?.endereco ?? '—'
  const cnpjEmitente = empresa?.cnpj ?? '—'
  const dataVenda = dataExibicaoVenda(venda)
  const chave = gerarChaveDocumento(venda)
  const chaveSemEspaco = chave.replace(/\s/g, '')
  const cancelada = venda.status === 'cancelada'
  const pagamento = escapeHtml(resumoPagamentosVenda(venda.forma_pagamento, venda.pagamentos))
  const cliente = escapeHtml(venda.clienteNome ?? 'CONSUMIDOR / BALCÃO')
  const clienteDoc = escapeHtml(venda.clienteCpfCnpj ?? '—')
  const clienteFone = escapeHtml(venda.clienteFone ?? '—')
  const clienteIe = escapeHtml(venda.clienteInscricaoEstadual ?? '—')
  const clienteEndereco = escapeHtml(venda.clienteEndereco ?? '—')
  const clienteBairro = escapeHtml(venda.clienteBairro ?? '—')
  const clienteCep = escapeHtml(venda.clienteCep ?? '—')
  const clienteMunicipio = escapeHtml(venda.clienteMunicipio ?? '—')
  const clienteUf = escapeHtml(venda.clienteUf ?? '—')
  const total = Number(venda.total)
  const subtotal = Number(venda.subtotal)
  const desconto = Number(venda.desconto)
  const totalProdutos = Math.max(subtotal - desconto, 0)
  const acrescimoPagamento = Math.max(total - totalProdutos, 0)

  const linhas = venda.itens.map((item, idx) => {
    const sub = item.quantidade * item.preco_unitario
    const cod = String(idx + 1).padStart(3, '0')
    return `
      <tr>
        <td class="c c-cod">${cod}</td>
        <td class="c c-desc">${escapeHtml(item.descricao)}</td>
        <td class="c c-un">UN</td>
        <td class="c c-qtd num">${item.quantidade}</td>
        <td class="c c-unit num">${formatBRL(item.preco_unitario)}</td>
        <td class="c c-total num">${formatBRL(sub)}</td>
      </tr>`
  })

  const avisoCancelada = cancelada
    ? '<div class="aviso aviso--cancel">DOCUMENTO CANCELADO — SEM VALIDADE</div>'
    : ''
  const aviso2Via = segundaVia ? '<div class="aviso aviso--2via">2ª VIA DO DOCUMENTO</div>' : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Nota de Compra #${venda.numero}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .danfe {
      width: 100%;
      border: 1px solid #000;
    }
    .danfe table {
      width: 100%;
      border-collapse: collapse;
    }
    .danfe td, .danfe th {
      border: 1px solid #000;
      vertical-align: top;
      padding: 0;
    }
    .campo {
      padding: 2px 4px;
      min-height: 28px;
    }
    .campo__label {
      display: block;
      font-size: 5.5pt;
      font-weight: 400;
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 1px;
    }
    .campo__valor {
      display: block;
      font-size: 8pt;
      font-weight: 700;
      line-height: 1.25;
      word-break: break-word;
    }
    .campo--sm .campo__valor { font-size: 7pt; font-weight: 600; }
    .campo--lg .campo__valor { font-size: 9pt; }
    .campo--center { text-align: center; }
    .campo--right { text-align: right; }

    .head-emit { width: 42%; }
    .head-emit .emit-nome {
      font-size: 9pt;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 2px;
    }
    .head-emit .emit-meta {
      font-size: 7pt;
      line-height: 1.35;
      font-weight: 400;
    }

    .head-tipo {
      width: 16%;
      text-align: center;
      vertical-align: middle;
      border-left: 1px solid #000;
      border-right: 1px solid #000;
    }
    .head-tipo__titulo {
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .head-tipo__sub {
      font-size: 5.5pt;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .head-tipo__entrada {
      margin-top: 6px;
      font-size: 14pt;
      font-weight: 700;
      border: 1px solid #000;
      display: inline-block;
      padding: 1px 6px;
    }

    .head-nf { width: 42%; }
    .head-nf .nf-linha {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      padding: 2px 4px;
      border-bottom: 1px solid #000;
      font-size: 7pt;
    }
    .head-nf .nf-linha:last-child { border-bottom: none; }
    .head-nf .nf-linha strong { font-size: 8pt; }
    .head-nf .nf-num {
      font-size: 10pt;
      font-weight: 700;
      text-align: right;
      padding: 4px;
    }

    .chave-row td { border-top: none; }
    .chave-barcode {
      padding: 4px 8px 2px;
      text-align: center;
    }
    .chave-barcode svg { display: block; width: 100%; max-height: 42px; }
    .chave-texto {
      font-size: 7pt;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-align: center;
      padding: 2px 4px 4px;
      font-family: "Courier New", Courier, monospace;
    }

    .grid-2 td { width: 50%; }
    .grid-3 td { width: 33.33%; }
    .grid-4 td { width: 25%; }
    .grid-5 td { width: 20%; }
    .grid-6 td { width: 16.66%; }

    .sec-titulo td {
      background: #e8e8e8;
      font-size: 5.5pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 4px;
      letter-spacing: 0.03em;
    }

    .itens th {
      font-size: 5.5pt;
      font-weight: 700;
      text-transform: uppercase;
      text-align: center;
      padding: 3px 2px;
      background: #f0f0f0;
      line-height: 1.2;
    }
    .itens td.c {
      font-size: 7pt;
      padding: 3px 4px;
      border-top: none;
    }
    .itens .c-cod { width: 5%; text-align: center; }
    .itens .c-desc { width: 49%; }
    .itens .c-un { width: 6%; text-align: center; }
    .itens .c-qtd { width: 8%; }
    .itens .c-unit { width: 16%; }
    .itens .c-total { width: 16%; }
    .num { text-align: right; white-space: nowrap; }

    .imposto .campo { min-height: 24px; }
    .imposto .campo__valor { font-weight: 600; font-size: 7.5pt; }

    .total-destaque td {
      padding: 4px;
      font-size: 9pt;
      font-weight: 700;
    }
    .total-destaque .total-valor {
      text-align: right;
      font-size: 11pt;
    }

    .dados-adic {
      min-height: 48px;
      font-size: 7pt;
      line-height: 1.4;
      padding: 4px;
    }
    .dados-adic p { margin: 0 0 2px; }

    .aviso {
      text-align: center;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 3px;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #000;
    }
    .aviso--cancel { background: #000; color: #fff; }
    .aviso--2via { background: #f5f5f5; }

    .rodape {
      border-top: 1px solid #000;
      padding: 4px 6px;
      font-size: 5.5pt;
      color: #333;
      text-align: center;
      line-height: 1.4;
    }

    @media screen {
      body {
        padding: 10mm;
        background: #ccc;
      }
      .danfe {
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      }
    }
    @media print {
      html, body { width: auto; }
      body { padding: 0; background: #fff; }
    }
  </style>
</head>
<body>
  <div class="danfe">
    ${avisoCancelada}
    ${aviso2Via}

    <table>
      <tr>
        <td class="head-emit" rowspan="2">
          <div class="campo">
            <div class="emit-nome">${escapeHtml(razaoSocial)}</div>
            <div class="emit-meta">
              ${escapeHtml(loja?.nome ?? venda.lojaNome)}<br />
              ${escapeHtml(enderecoEmitente)}<br />
              ${cnpjEmitente !== '—' ? `CNPJ: ${escapeHtml(cnpjEmitente)}` : ''}
              ${empresa?.telefone ? `<br />Fone: ${escapeHtml(empresa.telefone)}` : ''}
              ${empresa?.email ? `<br />${escapeHtml(empresa.email)}` : ''}
            </div>
          </div>
        </td>
        <td class="head-tipo" rowspan="2">
          <div class="head-tipo__titulo">NOTA DE<br />COMPRA</div>
          <div class="head-tipo__sub">Documento auxiliar<br />de compra</div>
          <div class="head-tipo__entrada">0</div>
        </td>
        <td class="head-nf">
          <div class="nf-num">Nº ${formatNumeroDoc(venda.numero)}</div>
        </td>
      </tr>
      <tr>
        <td class="head-nf">
          <div class="nf-linha"><span>SÉRIE</span><strong>001</strong></div>
          <div class="nf-linha"><span>FOLHA</span><strong>1 / 1</strong></div>
          <div class="nf-linha"><span>DATA EMISSÃO</span><strong>${formatDate(dataVenda)} ${formatTime(dataVenda)}</strong></div>
          <div class="nf-linha"><span>DATA SAÍDA</span><strong>${formatDate(dataVenda)}</strong></div>
        </td>
      </tr>
    </table>

    <table class="chave-row">
      <tr>
        <td>
          <div class="chave-barcode">${gerarBarcodeSvg(chaveSemEspaco)}</div>
          <div class="chave-texto">${escapeHtml(chave)}</div>
        </td>
      </tr>
    </table>

    <table class="grid-2">
      <tr>
        ${blocoCampo('Natureza da operação', 'VENDA DE MERCADORIAS E SERVIÇOS', 'campo--lg')}
        ${blocoCampo('Protocolo de autorização de uso', formatDateTime(dataVenda), 'campo--sm campo--right')}
      </tr>
    </table>

    <table class="grid-2">
      <tr>
        ${blocoCampo('Inscrição estadual', 'ISENTO')}
        ${blocoCampo('Inscrição estadual do subst. tributário', '—')}
      </tr>
    </table>

    <table>
      <tr class="sec-titulo"><td colspan="2">Destinatário / Remetente</td></tr>
      <tr>
        ${blocoCampo('Nome / Razão social', cliente, 'campo--lg')}
        ${blocoCampo('CNPJ / CPF', clienteDoc)}
      </tr>
      <tr class="grid-2">
        ${blocoCampo('Telefone', clienteFone)}
        ${blocoCampo('Inscrição estadual', clienteIe)}
      </tr>
      <tr class="grid-3">
        ${blocoCampo('Endereço', clienteEndereco)}
        ${blocoCampo('Bairro / Distrito', clienteBairro)}
        ${blocoCampo('CEP', clienteCep)}
      </tr>
      <tr class="grid-3">
        ${blocoCampo('Município', clienteMunicipio)}
        ${blocoCampo('UF', clienteUf)}
        ${blocoCampo('País', 'BRASIL')}
      </tr>
    </table>

    <table>
      <tr class="sec-titulo"><td colspan="6">Dados dos produtos / serviços</td></tr>
      <tr class="itens">
        <th>Cód.</th>
        <th>Descrição do produto / serviço</th>
        <th>Un.</th>
        <th>Qtd.</th>
        <th>V. unit.</th>
        <th>V. total</th>
      </tr>
      ${linhas.join('')}
    </table>

    <table>
      <tr class="sec-titulo"><td colspan="6">Cálculo do imposto</td></tr>
      <tr class="grid-6 imposto">
        ${blocoCampo('Base cálc. ICMS', formatBRL(0), 'campo--sm campo--right')}
        ${blocoCampo('Valor ICMS', formatBRL(0), 'campo--sm campo--right')}
        ${blocoCampo('Base cálc. ICMS ST', formatBRL(0), 'campo--sm campo--right')}
        ${blocoCampo('Valor ICMS ST', formatBRL(0), 'campo--sm campo--right')}
        ${blocoCampo('V. total produtos', formatBRL(subtotal), 'campo--sm campo--right')}
        ${blocoCampo('Desconto', desconto > 0 ? formatBRL(desconto) : formatBRL(0), 'campo--sm campo--right')}
      </tr>
      ${acrescimoPagamento > 0.009
      ? `<tr class="grid-6 imposto">
        ${blocoCampo('Acréscimo (taxa/juros)', formatBRL(acrescimoPagamento), 'campo--sm campo--right')}
        ${blocoCampo('', '', 'campo--sm')}
        ${blocoCampo('', '', 'campo--sm')}
        ${blocoCampo('', '', 'campo--sm')}
        ${blocoCampo('', '', 'campo--sm')}
        ${blocoCampo('', '', 'campo--sm')}
      </tr>`
      : ''
    }
    </table>

    <table class="total-destaque">
      <tr>
        <td>VALOR TOTAL DA NOTA</td>
        <td class="total-valor">${formatBRL(total)}</td>
      </tr>
    </table>

    <table>
      <tr class="sec-titulo"><td>Dados adicionais</td></tr>
      <tr>
        <td class="dados-adic">
          <p><strong>Forma de pagamento:</strong> ${pagamento}</p>
          <p><strong>Informações complementares:</strong> Documento comprobatório de compra emitido por ${escapeHtml(nomeEmpresa)}.</p>
          ${venda.observacao ? `<p><strong>Observações:</strong> ${escapeHtml(venda.observacao)}</p>` : ''}
        </td>
      </tr>
    </table>

    <div class="rodape">
      Documento emitido eletronicamente — comprovante de compra do estabelecimento, sem valor fiscal.<br />
      Impresso em ${formatDateTime(new Date().toISOString())}
    </div>
  </div>
</body>
</html>`
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

import { labelPagamento } from '../services/pdv.service'
import {
  FORMAS_PAGAMENTO_MISTO,
  adicionarLinhaPagamento,
  pagamentoAceitaValorLiquido,
  preencherRestanteLinha,
  removerLinhaPagamento,
  validarPagamentoMisto,
  type PagamentoLinha,
} from '../lib/pagamento-misto'
import { maskMoneyInput, parseMoneyInput } from '../lib/money'

type PagamentoMistoFieldsProps = {
  total: number
  linhas: PagamentoLinha[]
  onChange: (linhas: PagamentoLinha[]) => void
  label?: string
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function PagamentoMistoFields({
  total,
  linhas,
  onChange,
  label = 'Pagamento',
}: PagamentoMistoFieldsProps) {
  const { ok, restante, erroLiquido } = validarPagamentoMisto(total, linhas)

  function atualizar(id: string, patch: Partial<PagamentoLinha>) {
    onChange(linhas.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  return (
    <div className="pdv-pay-mixed">
      <div className="pdv-pay-mixed__head">
        <span className="pdv-field__lbl">{label}</span>
        <button
          type="button"
          className="pdv-link-btn"
          onClick={() => onChange(adicionarLinhaPagamento(linhas))}
          disabled={linhas.length >= FORMAS_PAGAMENTO_MISTO.length}
        >
          + Forma
        </button>
      </div>
      <ul className="pdv-pay-mixed__list">
        {linhas.map((p) => {
          const valorBruto = parseMoneyInput(p.valorStr) ?? 0
          const mostraLiquido = pagamentoAceitaValorLiquido(p.forma) && valorBruto > 0
          return (
            <li key={p.id} className={`pdv-pay-line${mostraLiquido ? ' pdv-pay-line--stacked' : ''}`}>
              <div className="pdv-pay-line__main">
                <select
                  className="pdv-input pdv-pay-line__forma"
                  value={p.forma}
                  onChange={(e) => {
                    const forma = e.target.value as PagamentoLinha['forma']
                    atualizar(p.id, {
                      forma,
                      valorLiquidoStr: pagamentoAceitaValorLiquido(forma) ? p.valorLiquidoStr : '',
                    })
                  }}
                >
                  {FORMAS_PAGAMENTO_MISTO.map((fp) => (
                    <option key={fp} value={fp}>
                      {labelPagamento(fp)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  className="pdv-input pdv-pay-line__valor"
                  placeholder="Valor pago"
                  title="Valor pago pelo cliente"
                  value={p.valorStr}
                  onChange={(e) => atualizar(p.id, { valorStr: maskMoneyInput(e.target.value) })}
                />
                <button
                  type="button"
                  className="pdv-pay-line__fill"
                  title="Preencher valor restante"
                  onClick={() => onChange(preencherRestanteLinha(linhas, p.id, total))}
                >
                  Restante
                </button>
                {linhas.length > 1 ? (
                  <button
                    type="button"
                    className="pdv-icon-btn"
                    aria-label="Remover forma"
                    onClick={() => onChange(removerLinhaPagamento(linhas, p.id))}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {mostraLiquido ? (
                <div className="pdv-pay-line__liquido">
                  <label className="pdv-pay-line__liquido-lbl">
                    Entrada líquida
                    <input
                      type="text"
                      inputMode="numeric"
                      className="pdv-input pdv-pay-line__liquido-input"
                      placeholder={p.valorStr || 'Após taxas'}
                      title="Quanto de fato entrará na conta (após taxas do cartão/adquirente)"
                      value={p.valorLiquidoStr ?? ''}
                      onChange={(e) =>
                        atualizar(p.id, { valorLiquidoStr: maskMoneyInput(e.target.value) })
                      }
                    />
                  </label>
                  <span className="pdv-pay-line__liquido-hint">
                    Deixe em branco se o valor pago for igual ao recebido.
                  </span>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className={`pdv-pay-mixed__hint${!ok ? ' pdv-pay-mixed__hint--warn' : ''}`}>
        {erroLiquido
          ? erroLiquido
          : ok
            ? 'Valor do pagamento conferido.'
            : restante > 0
              ? `Falta ${formatBRL(restante)}`
              : `Total a pagar: ${formatBRL(total)}`}
      </p>
    </div>
  )
}

export { validarPagamentoMisto }

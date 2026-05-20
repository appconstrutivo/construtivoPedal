import { labelPagamento } from '../services/pdv.service'
import {
  FORMAS_PAGAMENTO_MISTO,
  adicionarLinhaPagamento,
  preencherRestanteLinha,
  removerLinhaPagamento,
  validarPagamentoMisto,
  type PagamentoLinha,
} from '../lib/pagamento-misto'
import { maskMoneyInput } from '../lib/money'

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
  const { ok, restante } = validarPagamentoMisto(total, linhas)

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
        {linhas.map((p) => (
          <li key={p.id} className="pdv-pay-line">
            <select
              className="pdv-input pdv-pay-line__forma"
              value={p.forma}
              onChange={(e) =>
                atualizar(p.id, { forma: e.target.value as PagamentoLinha['forma'] })
              }
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
              placeholder="0,00"
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
          </li>
        ))}
      </ul>
      <p className={`pdv-pay-mixed__hint${!ok ? ' pdv-pay-mixed__hint--warn' : ''}`}>
        {ok
          ? 'Valor do pagamento conferido.'
          : restante > 0
            ? `Falta ${formatBRL(restante)}`
            : `Total a receber: ${formatBRL(total)}`}
      </p>
    </div>
  )
}

export { validarPagamentoMisto }

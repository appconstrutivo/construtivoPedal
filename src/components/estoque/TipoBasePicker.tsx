import { TIPOS_BASE, type TipoBaseEstoque } from '../../services/estoque-tipos.service'

type Props = {
  value: TipoBaseEstoque
  onChange: (base: TipoBaseEstoque) => void
  patrimonio: boolean
  onPatrimonioChange: (patrimonio: boolean) => void
  disabled?: boolean
}

const DICA_BASE: Record<TipoBaseEstoque, string> = {
  peca: 'Aparece na oficina, orçamentos e PDV.',
  acessorio: 'Aparece na oficina, orçamentos e PDV.',
  bike: 'No PDV, permite vincular a bicicleta ao cliente.',
}

/** Configuração de um tipo personalizado: comportamento (tipo nativo) e patrimônio. */
export function TipoBasePicker({ value, onChange, patrimonio, onPatrimonioChange, disabled }: Props) {
  return (
    <div className="st-base-picker">
      <span className="st-base-picker__label">Funciona como</span>
      <div className="st-base-picker__options" role="radiogroup" aria-label="Funciona como">
        {TIPOS_BASE.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={value === t.key}
            className={
              value === t.key ? 'st-base-picker__btn st-base-picker__btn--on' : 'st-base-picker__btn'
            }
            onClick={() => onChange(t.key)}
            disabled={disabled}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className="st-base-picker__hint">{DICA_BASE[value]}</span>
      <label className="st-base-picker__check">
        <input
          type="checkbox"
          checked={patrimonio}
          onChange={(e) => onPatrimonioChange(e.target.checked)}
          disabled={disabled}
        />
        <span>
          Patrimônio da loja
          <small>Uso interno (ferramentas, equipamentos). Não soma no valor do estoque.</small>
        </span>
      </label>
    </div>
  )
}

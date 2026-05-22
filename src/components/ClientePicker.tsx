import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  CLIENTE_BALCAO_LABEL,
  balcaoCorrespondeBusca,
  clienteCorrespondeBusca,
  rotuloCliente,
} from '../lib/cliente-busca'
import type { ClienteComRelacoes } from '../services/clientes.service'

type ClientePickerProps = {
  clientes: ClienteComRelacoes[]
  value: string
  onChange: (clienteId: string) => void
  /** Valor vazio = Consumidor / balcão */
  allowBalcao?: boolean
  balcaoLabel?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  inputClassName?: string
}

export function ClientePicker({
  clientes,
  value,
  onChange,
  allowBalcao = true,
  balcaoLabel = CLIENTE_BALCAO_LABEL,
  placeholder = 'Buscar por nome ou telefone…',
  disabled = false,
  id,
  inputClassName,
}: ClientePickerProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const inputId = id ?? listId

  const selecionado = useMemo(() => clientes.find((c) => c.id === value) ?? null, [clientes, value])
  const emBalcao = allowBalcao && !value

  const mostraBalcao = allowBalcao && balcaoCorrespondeBusca(busca)

  const resultados = useMemo(() => {
    const lista = busca.trim()
      ? clientes.filter((c) => clienteCorrespondeBusca(c, busca))
      : clientes
    return lista.slice(0, 60)
  }, [clientes, busca])

  useEffect(() => {
    if (!aberto) return
    const fecharAoClicarFora = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false)
        setBusca('')
      }
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [aberto])

  function abrir() {
    if (disabled) return
    setAberto(true)
    setBusca('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function selecionar(clienteId: string) {
    onChange(clienteId)
    setAberto(false)
    setBusca('')
  }

  function limpar() {
    onChange('')
    setBusca('')
    setAberto(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const valorInput = aberto
    ? busca
    : selecionado
      ? rotuloCliente(selecionado)
      : emBalcao
        ? balcaoLabel
        : ''

  const inputClasses = ['st-input', 'st-item-picker__input', inputClassName].filter(Boolean).join(' ')

  return (
    <div className="st-item-picker" ref={wrapRef}>
      <div className="st-item-picker__control">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className={inputClasses}
          value={valorInput}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={aberto ? listId : undefined}
          aria-expanded={aberto}
          role="combobox"
          onFocus={abrir}
          onChange={(e) => {
            setBusca(e.target.value)
            if (!aberto) setAberto(true)
            if (selecionado && e.target.value !== rotuloCliente(selecionado)) {
              onChange('')
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAberto(false)
              setBusca('')
              inputRef.current?.blur()
            }
          }}
        />
        {(selecionado || busca.trim()) && !disabled && (
          <button
            type="button"
            className="st-item-picker__clear"
            aria-label="Limpar cliente selecionado"
            onClick={limpar}
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>
      {aberto && !disabled && (
        <ul id={listId} className="st-item-picker__list" role="listbox">
          {mostraBalcao && (
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`st-item-picker__option${!value ? ' st-item-picker__option--on' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selecionar('')}
              >
                <span className="st-item-picker__body">
                  <span className="st-item-picker__nome">{balcaoLabel}</span>
                  <span className="st-item-picker__meta">Serviço rápido sem cadastro</span>
                </span>
              </button>
            </li>
          )}
          {resultados.length === 0 && !mostraBalcao ? (
            <li className="st-item-picker__empty">Nenhum cliente encontrado.</li>
          ) : (
            resultados.map((cliente) => (
              <li key={cliente.id} role="option" aria-selected={cliente.id === value}>
                <button
                  type="button"
                  className={`st-item-picker__option${cliente.id === value ? ' st-item-picker__option--on' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selecionar(cliente.id)}
                >
                  <span className="st-item-picker__body">
                    <span className="st-item-picker__nome">{cliente.nome}</span>
                    {cliente.fone ? (
                      <span className="st-item-picker__meta">{cliente.fone}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

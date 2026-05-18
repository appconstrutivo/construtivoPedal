import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { EstoqueItemComLocal } from '../services/estoque.service'

function rotuloItem(item: EstoqueItemComLocal) {
  return `${item.nome} (${item.sku})`
}

function itemCorrespondeBusca(item: EstoqueItemComLocal, busca: string) {
  const termos = busca
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true

  const texto = [item.nome, item.sku, item.sku_fornecedor ?? ''].join(' ').toLowerCase()
  return termos.every((t) => texto.includes(t))
}

type EstoqueItemPickerProps = {
  itens: EstoqueItemComLocal[]
  value: string
  onChange: (itemId: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
}

export function EstoqueItemPicker({
  itens,
  value,
  onChange,
  placeholder = 'Buscar por nome ou SKU…',
  disabled = false,
  required = false,
  id,
}: EstoqueItemPickerProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const inputId = id ?? listId

  const selecionado = useMemo(() => itens.find((i) => i.id === value) ?? null, [itens, value])

  const resultados = useMemo(() => {
    const lista = busca.trim() ? itens.filter((i) => itemCorrespondeBusca(i, busca)) : itens
    return lista.slice(0, 60)
  }, [itens, busca])

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

  function selecionar(itemId: string) {
    onChange(itemId)
    setAberto(false)
    setBusca('')
  }

  function limpar() {
    onChange('')
    setBusca('')
    setAberto(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const valorInput = aberto ? busca : selecionado ? rotuloItem(selecionado) : ''

  return (
    <div className="st-item-picker" ref={wrapRef}>
      {required && (
        <input
          type="text"
          className="st-item-picker__validator"
          value={value}
          required
          tabIndex={-1}
          aria-hidden
          onChange={() => {}}
        />
      )}
      <div className="st-item-picker__control">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className="st-input st-item-picker__input"
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
            if (selecionado && e.target.value !== rotuloItem(selecionado)) {
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
        {selecionado && !disabled && (
          <button
            type="button"
            className="st-item-picker__clear"
            aria-label="Limpar item selecionado"
            onClick={limpar}
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>
      {aberto && !disabled && (
        <ul id={listId} className="st-item-picker__list" role="listbox">
          {resultados.length === 0 ? (
            <li className="st-item-picker__empty">Nenhum item encontrado.</li>
          ) : (
            resultados.map((item) => (
              <li key={item.id} role="option" aria-selected={item.id === value}>
                <button
                  type="button"
                  className={`st-item-picker__option${item.id === value ? ' st-item-picker__option--on' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selecionar(item.id)}
                >
                  <span className="st-item-picker__nome">{item.nome}</span>
                  <span className="st-item-picker__sku">{item.sku}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CatalogoServicoRow } from '../services/catalogo-servicos.service'

function rotuloServico(s: CatalogoServicoRow, formatPreco: (v: number) => string) {
  const preco = Number(s.preco_sugerido) || 0
  return `${s.nome} — ${formatPreco(preco)}`
}

function servicoCorrespondeBusca(s: CatalogoServicoRow, busca: string) {
  const termos = busca
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true
  const texto = s.nome.toLowerCase()
  return termos.every((t) => texto.includes(t))
}

type ServicoCatalogoPickerProps = {
  servicos: CatalogoServicoRow[]
  value: string
  onChange: (servicoId: string) => void
  formatPreco: (v: number) => string
  placeholder?: string
  disabled?: boolean
  id?: string
}

export function ServicoCatalogoPicker({
  servicos,
  value,
  onChange,
  formatPreco,
  placeholder = 'Buscar serviço…',
  disabled = false,
  id,
}: ServicoCatalogoPickerProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const inputId = id ?? listId

  const selecionado = useMemo(() => servicos.find((s) => s.id === value) ?? null, [servicos, value])

  const resultados = useMemo(() => {
    const lista = busca.trim() ? servicos.filter((s) => servicoCorrespondeBusca(s, busca)) : servicos
    return lista.slice(0, 60)
  }, [servicos, busca])

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

  function selecionar(servicoId: string) {
    onChange(servicoId)
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
      ? rotuloServico(selecionado, formatPreco)
      : ''

  return (
    <div className="st-item-picker" ref={wrapRef}>
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
            if (selecionado && e.target.value !== rotuloServico(selecionado, formatPreco)) {
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
            aria-label="Limpar serviço selecionado"
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
            <li className="st-item-picker__empty">Nenhum serviço encontrado.</li>
          ) : (
            resultados.map((s) => (
              <li key={s.id} role="option" aria-selected={s.id === value}>
                <button
                  type="button"
                  className={`st-item-picker__option${s.id === value ? ' st-item-picker__option--on' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selecionar(s.id)}
                >
                  <span className="st-item-picker__nome">{s.nome}</span>
                  <span className="st-item-picker__sku">{formatPreco(Number(s.preco_sugerido) || 0)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

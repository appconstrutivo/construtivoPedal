import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { normalizarNomeEstoque } from '../services/estoque.service'
import type { CatalogoServicoRow } from '../services/catalogo-servicos.service'

function rotuloServico(s: CatalogoServicoRow, formatPreco: (v: number) => string) {
  const preco = Number(s.preco_sugerido) || 0
  return `${s.nome} — ${formatPreco(preco)}`
}

function servicoCorrespondeBusca(s: CatalogoServicoRow, busca: string) {
  const termos = normalizarNomeEstoque(busca)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true
  const texto = s.nome.toLowerCase()
  return termos.every((t) => texto.includes(t))
}

function avulsoCorrespondeBusca(busca: string, rotuloAvulso: string) {
  const termos = normalizarNomeEstoque(busca)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true
  const texto = rotuloAvulso.toLowerCase()
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
  /** Exibe opção para serviço avulso (valor vazio) na lista. */
  permitirAvulso?: boolean
  rotuloAvulso?: string
  hintAvulso?: string
}

export function ServicoCatalogoPicker({
  servicos,
  value,
  onChange,
  formatPreco,
  placeholder = 'Buscar serviço do catálogo…',
  disabled = false,
  id,
  permitirAvulso = false,
  rotuloAvulso = 'Serviço avulso (descrição livre abaixo)',
  hintAvulso = 'Sem vínculo ao catálogo',
}: ServicoCatalogoPickerProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [idLocal, setIdLocal] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ignorarOnChangeRef = useRef(false)
  const listId = useId()
  const inputId = id ?? listId

  const idEfetivo = value || idLocal || ''
  const selecionado = useMemo(
    () => (idEfetivo ? servicos.find((s) => s.id === idEfetivo) ?? null : null),
    [servicos, idEfetivo],
  )

  useEffect(() => {
    if (value && idLocal === value) setIdLocal(null)
  }, [value, idLocal])

  const mostraAvulso = permitirAvulso && avulsoCorrespondeBusca(busca, rotuloAvulso)

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
    setBusca(selecionado ? rotuloServico(selecionado, formatPreco) : '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function selecionar(servicoId: string) {
    ignorarOnChangeRef.current = true
    setIdLocal(servicoId || null)
    onChange(servicoId)
    setAberto(false)
    setBusca('')
    requestAnimationFrame(() => {
      ignorarOnChangeRef.current = false
    })
  }

  function limpar() {
    setIdLocal(null)
    onChange('')
    setBusca('')
    setAberto(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const valorInput = aberto ? busca : selecionado ? rotuloServico(selecionado, formatPreco) : ''

  return (
    <div className="st-item-picker" ref={wrapRef}>
      <div className="st-item-picker__control">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
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
            if (ignorarOnChangeRef.current) return
            const texto = e.target.value
            setBusca(texto)
            if (!aberto) setAberto(true)
            const rotuloAtual = selecionado ? rotuloServico(selecionado, formatPreco) : ''
            if (idEfetivo && texto !== rotuloAtual) {
              setIdLocal(null)
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
          {mostraAvulso && (
            <li role="option" aria-selected={!idEfetivo}>
              <button
                type="button"
                className={`st-item-picker__option${!idEfetivo ? ' st-item-picker__option--on' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selecionar('')
                }}
              >
                <span className="st-item-picker__body">
                  <span className="st-item-picker__nome">{rotuloAvulso}</span>
                  <span className="st-item-picker__meta">{hintAvulso}</span>
                </span>
              </button>
            </li>
          )}
          {resultados.length === 0 && !mostraAvulso ? (
            <li className="st-item-picker__empty">Nenhum serviço encontrado.</li>
          ) : (
            resultados.map((s) => (
              <li key={s.id} role="option" aria-selected={s.id === idEfetivo}>
                <button
                  type="button"
                  className={`st-item-picker__option${s.id === idEfetivo ? ' st-item-picker__option--on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selecionar(s.id)
                  }}
                >
                  <span className="st-item-picker__body">
                    <span className="st-item-picker__nome">{s.nome}</span>
                    <span className="st-item-picker__meta">
                      {formatPreco(Number(s.preco_sugerido) || 0)}
                    </span>
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

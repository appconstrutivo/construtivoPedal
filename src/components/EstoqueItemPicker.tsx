import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EstoqueItemThumb } from './EstoqueItemThumb'
import { normalizarNomeEstoque } from '../services/estoque.service'
import type { EstoqueItemComLocal } from '../services/estoque.service'

function rotuloItem(item: EstoqueItemComLocal) {
  return `${item.nome} (${item.sku})`
}

function textoBuscaItem(item: EstoqueItemComLocal) {
  return [item.nome, item.sku, item.sku_fornecedor ?? ''].join(' ').toLowerCase()
}

function itemCorrespondeBusca(item: EstoqueItemComLocal, busca: string) {
  const termos = normalizarNomeEstoque(busca)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (termos.length === 0) return true

  const texto = textoBuscaItem(item)
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
  /** Exibe miniatura do produto na lista e no campo (padrão: true). */
  comImagem?: boolean
}

export function EstoqueItemPicker({
  itens,
  value,
  onChange,
  placeholder = 'Buscar por nome ou SKU…',
  disabled = false,
  required = false,
  id,
  comImagem = true,
}: EstoqueItemPickerProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  /** Mantém o rótulo visível até o `value` do pai atualizar após o clique na lista. */
  const [idLocal, setIdLocal] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ignorarOnChangeRef = useRef(false)
  const listId = useId()
  const inputId = id ?? listId

  const idEfetivo = value || idLocal || ''
  const selecionado = useMemo(
    () => (idEfetivo ? itens.find((i) => i.id === idEfetivo) ?? null : null),
    [itens, idEfetivo],
  )

  useEffect(() => {
    if (value && idLocal === value) setIdLocal(null)
  }, [value, idLocal])

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
    setBusca(selecionado ? rotuloItem(selecionado) : '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function selecionar(itemId: string) {
    ignorarOnChangeRef.current = true
    setIdLocal(itemId)
    onChange(itemId)
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

  const valorInput = aberto ? busca : selecionado ? rotuloItem(selecionado) : ''
  const mostrarThumbNoCampo = comImagem && selecionado && !aberto

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
      <div
        className={[
          'st-item-picker__control',
          mostrarThumbNoCampo ? 'st-item-picker__control--with-thumb' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {mostrarThumbNoCampo && (
          <span className="st-item-picker__field-thumb" aria-hidden>
            <EstoqueItemThumb
              imagemUrl={selecionado.imagem_url}
              alt=""
              variant="picker"
            />
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={[
            'st-input',
            'st-item-picker__input',
            mostrarThumbNoCampo ? 'st-item-picker__input--with-thumb' : '',
          ]
            .filter(Boolean)
            .join(' ')}
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
            const rotuloAtual = selecionado ? rotuloItem(selecionado) : ''
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
              <li key={item.id} role="option" aria-selected={item.id === idEfetivo}>
                <button
                  type="button"
                  className={`st-item-picker__option${item.id === idEfetivo ? ' st-item-picker__option--on' : ''}${comImagem ? ' st-item-picker__option--with-thumb' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selecionar(item.id)
                  }}
                >
                  {comImagem ? (
                    <>
                      <EstoqueItemThumb
                        imagemUrl={item.imagem_url}
                        alt=""
                        variant="picker"
                      />
                      <span className="st-item-picker__body">
                        <span className="st-item-picker__nome">{item.nome}</span>
                        <span className="st-item-picker__meta">
                          SKU {item.sku}
                          {Number(item.saldo_atual) > 0
                            ? ` · ${Number(item.saldo_atual)} ${item.unidade}`
                            : ' · sem saldo'}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="st-item-picker__nome">{item.nome}</span>
                      <span className="st-item-picker__sku">{item.sku}</span>
                    </>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

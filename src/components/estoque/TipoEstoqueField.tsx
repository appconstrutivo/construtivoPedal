import { useEffect, useId, useRef, useState } from 'react'
import {
  NOME_TIPO_MAX,
  TIPOS_BASE,
  ehNomeTipoBase,
  normalizarNomeTipo,
  toTipoBaseEstoque,
  type ConfigTipoEstoque,
  type EstoqueTipoRow,
  type TipoBaseEstoque,
} from '../../services/estoque-tipos.service'
import { TipoBasePicker } from './TipoBasePicker'

const OPCAO_NOVO = '__novo__'

type Props = {
  tipos: EstoqueTipoRow[]
  /** Tipo nativo gravado em `estoque_itens.categoria`. */
  base: TipoBaseEstoque
  /** Tipo personalizado selecionado ('' = nativo). */
  tipoId: string
  onChange: (base: TipoBaseEstoque, tipoId: string) => void
  onCriar: (config: ConfigTipoEstoque) => Promise<EstoqueTipoRow>
}

export function TipoEstoqueField({ tipos, base, tipoId, onChange, onCriar }: Props) {
  const fieldId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [novaBase, setNovaBase] = useState<TipoBaseEstoque>('peca')
  const [novoPatrimonio, setNovoPatrimonio] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (criando) inputRef.current?.focus()
  }, [criando])

  function abrirCriacao() {
    setNome('')
    setNovaBase(base)
    setNovoPatrimonio(false)
    setErro(null)
    setCriando(true)
  }

  function cancelarCriacao() {
    if (salvando) return
    setCriando(false)
    setNome('')
    setErro(null)
  }

  function selecionar(valor: string) {
    if (valor === OPCAO_NOVO) {
      abrirCriacao()
      return
    }
    const personalizado = tipos.find((t) => t.id === valor)
    if (personalizado) onChange(toTipoBaseEstoque(personalizado.base), personalizado.id)
    else onChange(toTipoBaseEstoque(valor), '')
  }

  async function confirmarCriacao() {
    const nomeLimpo = normalizarNomeTipo(nome)
    if (!nomeLimpo) {
      setErro('Informe o nome do tipo.')
      inputRef.current?.focus()
      return
    }

    if (ehNomeTipoBase(nomeLimpo)) {
      setErro('Este tipo já existe na lista.')
      inputRef.current?.focus()
      return
    }

    const existente = tipos.find(
      (t) => t.nome.localeCompare(nomeLimpo, 'pt-BR', { sensitivity: 'base' }) === 0,
    )
    if (existente) {
      onChange(toTipoBaseEstoque(existente.base), existente.id)
      setCriando(false)
      setNome('')
      setErro(null)
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      const novo = await onCriar({ nome: nomeLimpo, base: novaBase, patrimonio: novoPatrimonio })
      onChange(toTipoBaseEstoque(novo.base), novo.id)
      setCriando(false)
      setNome('')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar tipo.')
      inputRef.current?.focus()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="st-field">
      <div className="st-field__label-row">
        <label htmlFor={fieldId} className="st-field__label">
          Tipo
        </label>
        {!criando && (
          <button type="button" className="st-field__action" onClick={abrirCriacao}>
            + Novo tipo
          </button>
        )}
      </div>

      {criando ? (
        <div className="st-inline-create st-inline-create--stacked">
          <input
            ref={inputRef}
            id={fieldId}
            className="st-input"
            value={nome}
            maxLength={NOME_TIPO_MAX}
            placeholder="Ex.: Ferramenta, Vestuário"
            autoComplete="off"
            disabled={salvando}
            aria-invalid={erro ? true : undefined}
            onChange={(e) => {
              setNome(e.target.value)
              if (erro) setErro(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void confirmarCriacao()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                cancelarCriacao()
              }
            }}
          />
          <TipoBasePicker
            value={novaBase}
            onChange={setNovaBase}
            patrimonio={novoPatrimonio}
            onPatrimonioChange={setNovoPatrimonio}
            disabled={salvando}
          />
          <div className="st-inline-create__actions">
            <button
              type="button"
              className="st-inline-create__btn"
              onClick={cancelarCriacao}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="st-inline-create__btn st-inline-create__btn--primary"
              onClick={() => void confirmarCriacao()}
              disabled={salvando}
            >
              {salvando ? 'Criando…' : 'Criar'}
            </button>
          </div>
        </div>
      ) : (
        <select
          id={fieldId}
          className="st-input"
          value={tipoId || base}
          onChange={(e) => selecionar(e.target.value)}
        >
          {TIPOS_BASE.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
          {tipos.length > 0 && (
            <optgroup label="Criados pela loja">
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </optgroup>
          )}
          <option value={OPCAO_NOVO}>+ Novo tipo…</option>
        </select>
      )}

      {erro && (
        <span className="st-field__error" role="alert">
          {erro}
        </span>
      )}
    </div>
  )
}

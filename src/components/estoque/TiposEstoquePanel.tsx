import { useEffect, useRef, useState } from 'react'
import {
  NOME_TIPO_MAX,
  labelTipoBase,
  toTipoBaseEstoque,
  type ConfigTipoEstoque,
  type EstoqueTipoRow,
  type TipoBaseEstoque,
} from '../../services/estoque-tipos.service'
import { IconPencil, IconX } from './icons'
import { TipoBasePicker } from './TipoBasePicker'

type Props = {
  tipos: EstoqueTipoRow[]
  /** Quantidade de itens da loja ativa por tipo personalizado. */
  itensPorTipo: Record<string, number>
  onCriar: (config: ConfigTipoEstoque) => Promise<unknown>
  onAtualizar: (id: string, config: ConfigTipoEstoque) => Promise<unknown>
  onExcluir: (tipo: EstoqueTipoRow) => Promise<void>
}

/** id do tipo em edição, 'novo' para criação ou null. */
type Edicao = string | 'novo' | null

export function TiposEstoquePanel({ tipos, itensPorTipo, onCriar, onAtualizar, onExcluir }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [edicao, setEdicao] = useState<Edicao>(null)
  const [nome, setNome] = useState('')
  const [base, setBase] = useState<TipoBaseEstoque>('peca')
  const [patrimonio, setPatrimonio] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (edicao) inputRef.current?.focus()
  }, [edicao])

  function iniciar(alvo: Edicao, tipo?: EstoqueTipoRow) {
    setEdicao(alvo)
    setNome(tipo?.nome ?? '')
    setBase(toTipoBaseEstoque(tipo?.base))
    setPatrimonio(tipo?.patrimonio ?? false)
    setErro(null)
  }

  function cancelar() {
    if (salvando) return
    setEdicao(null)
    setNome('')
    setErro(null)
  }

  async function salvar() {
    if (!edicao) return
    setSalvando(true)
    setErro(null)
    try {
      const config = { nome, base, patrimonio }
      if (edicao === 'novo') await onCriar(config)
      else await onAtualizar(edicao, config)
      setEdicao(null)
      setNome('')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar tipo.')
      inputRef.current?.focus()
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(tipo: EstoqueTipoRow) {
    setExcluindoId(tipo.id)
    setErro(null)
    try {
      await onExcluir(tipo)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir tipo.')
    } finally {
      setExcluindoId(null)
    }
  }

  function renderEditor(label: string) {
    return (
      <div className="st-inline-create st-inline-create--stacked st-inline-create--panel">
        <input
          ref={inputRef}
          className="st-input st-input--compact"
          value={nome}
          maxLength={NOME_TIPO_MAX}
          placeholder="Nome do tipo"
          aria-label={label}
          autoComplete="off"
          disabled={salvando}
          onChange={(e) => {
            setNome(e.target.value)
            if (erro) setErro(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void salvar()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelar()
            }
          }}
        />
        <TipoBasePicker
          value={base}
          onChange={setBase}
          patrimonio={patrimonio}
          onPatrimonioChange={setPatrimonio}
          disabled={salvando}
        />
        <div className="st-inline-create__actions">
          <button type="button" className="st-inline-create__btn" onClick={cancelar} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="st-inline-create__btn st-inline-create__btn--primary"
            onClick={() => void salvar()}
            disabled={salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="st-panel">
      <div className="st-panel__head">
        <h2 className="st-panel__title">Tipos de item</h2>
        <button
          type="button"
          className="st-link-btn"
          onClick={() => iniciar('novo')}
          disabled={edicao === 'novo'}
        >
          Novo
        </button>
      </div>

      {edicao === 'novo' && renderEditor('Nome do novo tipo')}

      {erro && (
        <p className="st-panel__error" role="alert">
          {erro}
        </p>
      )}

      {tipos.length === 0 && edicao !== 'novo' ? (
        <p className="st-panel__hint">
          Além de Peça, Acessório e Bike, crie tipos próprios como Ferramenta ou Vestuário.
        </p>
      ) : (
        <ul className="st-sup-list st-sup-list--scroll">
          {tipos.map((tipo) => {
            const qtd = itensPorTipo[tipo.id] ?? 0
            return (
              <li key={tipo.id} className="st-sup-item">
                {edicao === tipo.id ? (
                  renderEditor(`Editar tipo ${tipo.nome}`)
                ) : (
                  <>
                    <div className="st-sup-item__body">
                      <strong>{tipo.nome}</strong>
                      <span>
                        {tipo.patrimonio ? 'Patrimônio' : `Funciona como ${labelTipoBase(tipo.base).toLowerCase()}`} ·{' '}
                        {qtd === 1 ? '1 item nesta loja' : `${qtd} itens nesta loja`}
                      </span>
                    </div>
                    <div className="st-sup-item__actions">
                      <button
                        type="button"
                        className="st-row__action st-row__action--icon"
                        aria-label={`Editar tipo ${tipo.nome}`}
                        onClick={() => iniciar(tipo.id, tipo)}
                        disabled={excluindoId === tipo.id}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="st-row__action st-row__action--icon st-row__action--danger"
                        aria-label={`Excluir tipo ${tipo.nome}`}
                        onClick={() => void excluir(tipo)}
                        disabled={excluindoId === tipo.id}
                      >
                        <IconX />
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

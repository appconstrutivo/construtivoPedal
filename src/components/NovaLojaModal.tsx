import { useEffect, useState } from 'react'

type NovaLojaModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (payload: { name: string; address: string }) => Promise<void>
}

export function NovaLojaModal({ open, onClose, onSubmit }: NovaLojaModalProps) {
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open) return
    setNome('')
    setEndereco('')
    setErro(null)
    setSalvando(false)
  }, [open])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = nome.trim()
    if (!name) {
      setErro('Informe o nome da loja.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await onSubmit({ name, address: endereco.trim() })
      onClose()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar loja.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="st-modal cp-loja-modal" role="dialog" aria-modal="true" aria-labelledby="cp-loja-title">
        <div className="st-modal__head">
          <h2 id="cp-loja-title" className="st-modal__title">
            Nova loja
          </h2>
          <button type="button" className="st-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form className="st-form" onSubmit={handleSubmit}>
          <p className="cp-loja-modal__hint">
            A loja cadastrada aparecerá no seletor do topo. Estoque, OS e demais lançamentos usarão a loja
            selecionada na sessão.
          </p>
          <label className="st-field">
            <span>Nome da loja *</span>
            <input
              className="st-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Matriz, Filial Centro"
              autoFocus
              required
            />
          </label>
          <label className="st-field">
            <span>Endereço (opcional)</span>
            <input
              className="st-input"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
            />
          </label>
          {erro && <p className="st-form-error">{erro}</p>}
          <div className="st-form-actions">
            <button type="button" className="st-ghost-btn" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="st-primary-btn" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Cadastrar loja'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="st-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ClientePicker } from './ClientePicker'
import { criarBicicleta, type BicicletaRow, type ClienteComRelacoes } from '../services/clientes.service'
import { supabase } from '../lib/supabaseClient'
import {
  buscarTokenManualBike,
  montarTextoWhatsappManual,
  urlManualProprietario,
} from '../services/manual-proprietario.service'

export type PdvBikePosVendaItem = {
  key: string
  estoqueItemId: string
  produtoNome: string
  descricao: string | null
  imagemUrl: string | null
}

export type PdvPosVendaBikePayload = {
  vendaId: string
  numero: number
  clienteId: string
  /** Data da venda (YYYY-MM-DD) — vira data_compra da bike */
  dataCompra: string
  /** Se o operador já vinculou uma bike existente no checkout */
  bicicletaIdExistente: string | null
  itens: PdvBikePosVendaItem[]
}

type PdvRegistrarBikeManualModalProps = {
  companyId: string
  companyName?: string | null
  storeName?: string | null
  clientes: ClienteComRelacoes[]
  payload: PdvPosVendaBikePayload
  onClose: () => void
  onClientesAtualizados: () => void
}

/** Heurística leve: 1º token = marca, resto = modelo. Nomes genéricos ("Bicicleta…") vão só no modelo. */
export function sugerirMarcaModelo(nomeProduto: string): { marca: string; modelo: string } {
  const t = nomeProduto.trim().replace(/\s+/g, ' ')
  if (!t) return { marca: '', modelo: '' }
  const parts = t.split(' ')
  const primeiro = parts[0].toLowerCase()
  const genericos = new Set(['bicicleta', 'bike', 'mtb', 'speed', 'eletrica', 'elétrica'])
  if (parts.length === 1 || genericos.has(primeiro)) {
    return { marca: '', modelo: t }
  }
  return { marca: parts[0], modelo: parts.slice(1).join(' ') }
}

type Etapa = 'form' | 'link'

export function PdvRegistrarBikeManualModal({
  companyId,
  companyName,
  storeName,
  clientes,
  payload,
  onClose,
  onClientesAtualizados,
}: PdvRegistrarBikeManualModalProps) {
  const soCompartilhar = Boolean(payload.bicicletaIdExistente)
  const fila = payload.itens
  const [indice, setIndice] = useState(0)
  const itemAtual = fila[Math.min(indice, Math.max(fila.length - 1, 0))] ?? null

  const sugestao = useMemo(
    () => sugerirMarcaModelo(itemAtual?.produtoNome ?? ''),
    [itemAtual?.produtoNome],
  )

  const [clienteId, setClienteId] = useState(payload.clienteId)
  const [marca, setMarca] = useState(sugestao.marca)
  const [modelo, setModelo] = useState(sugestao.modelo)
  const [aro, setAro] = useState('')
  const [cor, setCor] = useState('')
  const [numeroSerie, setNumeroSerie] = useState('')
  const [observacoes, setObservacoes] = useState(itemAtual?.descricao?.trim() || '')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<Etapa>(soCompartilhar ? 'link' : 'form')
  const [bikePronta, setBikePronta] = useState<BicicletaRow | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [msgOk, setMsgOk] = useState<string | null>(null)

  // Ao trocar item da fila, reaplica sugestão do produto
  useEffect(() => {
    if (soCompartilhar) return
    const s = sugerirMarcaModelo(itemAtual?.produtoNome ?? '')
    setMarca(s.marca)
    setModelo(s.modelo)
    setAro('')
    setCor('')
    setNumeroSerie('')
    setObservacoes(itemAtual?.descricao?.trim() || '')
    setErro(null)
    setEtapa('form')
    setBikePronta(null)
    setToken(null)
    setMsgOk(null)
  }, [itemAtual?.key, itemAtual?.produtoNome, itemAtual?.descricao, soCompartilhar])

  useEffect(() => {
    if (!soCompartilhar || !payload.bicicletaIdExistente) return
    let cancelled = false
    setSaving(true)
    void (async () => {
      try {
        // Se a bike ainda não tem data de compra, assume a data desta venda
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: bikeRow } = await (supabase as any)
          .from('bicicletas')
          .select('data_compra')
          .eq('id', payload.bicicletaIdExistente)
          .maybeSingle()
        if (!bikeRow?.data_compra && payload.dataCompra) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('bicicletas')
            .update({
              data_compra: payload.dataCompra,
              comprada_na_loja: true,
            })
            .eq('id', payload.bicicletaIdExistente)
        }
        const t = await buscarTokenManualBike(payload.bicicletaIdExistente!)
        if (cancelled) return
        setToken(t)
        setEtapa('link')
      } catch (e) {
        if (cancelled) return
        setErro(e instanceof Error ? e.message : 'Erro ao preparar o manual.')
      } finally {
        if (!cancelled) setSaving(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [soCompartilhar, payload.bicicletaIdExistente, payload.dataCompra])

  async function vincularBikeNaVenda(bikeId: string, cliId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('vendas')
        .update({ bicicleta_id: bikeId, cliente_id: cliId })
        .eq('id', payload.vendaId)
        .eq('company_id', companyId)
    } catch {
      /* não bloqueia o fluxo do manual */
    }
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId) {
      setErro('Selecione o cliente dono da bike para gerar o Manual.')
      return
    }
    if (!marca.trim()) {
      setErro('Informe a marca da bike.')
      return
    }
    if (!modelo.trim()) {
      setErro('Informe o modelo da bike.')
      return
    }
    setSaving(true)
    setErro(null)
    setMsgOk(null)
    try {
      const nova = await criarBicicleta({
        company_id: companyId,
        cliente_id: clienteId,
        marca: marca.trim(),
        modelo: modelo.trim(),
        aro: aro.trim() || null,
        cor: cor.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        observacoes: observacoes.trim() || null,
        data_compra: payload.dataCompra || null,
        comprada_na_loja: true,
      })
      await vincularBikeNaVenda(nova.id, clienteId)
      const t = nova.token_manual || (await buscarTokenManualBike(nova.id))
      if (!t) throw new Error('Bike salva, mas o link do manual não foi gerado.')
      setBikePronta(nova)
      setToken(t)
      setEtapa('link')
      onClientesAtualizados()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar a bike.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopiar() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(urlManualProprietario(token))
      setMsgOk('Link do Manual copiado.')
    } catch {
      setErro('Não foi possível copiar o link.')
    }
  }

  function handleWhatsapp() {
    if (!token) return
    const label = bikePronta
      ? `${bikePronta.marca} ${bikePronta.modelo}`
      : itemAtual?.produtoNome || 'bicicleta'
    const texto = montarTextoWhatsappManual(token, label, storeName || companyName)
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  function avancarOuFechar() {
    if (!soCompartilhar && indice < fila.length - 1) {
      setIndice((i) => i + 1)
      return
    }
    onClose()
  }

  const tituloFila =
    !soCompartilhar && fila.length > 1 ? ` · bike ${indice + 1} de ${fila.length}` : ''

  return (
    <div
      className="st-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        className="st-modal st-modal--scroll pdv-manual-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdv-manual-title"
      >
        <div className="st-modal__head pdv-manual-modal__head">
          <h2 id="pdv-manual-title" className="st-modal__title">
            {etapa === 'link' ? 'Manual do Proprietário' : `Registrar bike${tituloFila}`}
          </h2>
          <button
            type="button"
            className="st-modal__close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="pdv-manual-modal__body">
          <p className="pdv-manual-modal__hint">
            {etapa === 'link'
              ? 'Envie o link ao cliente. No celular dele abre o quadro de revisões da bike.'
              : 'A venda já foi concluída. Cadastre os dados desta unidade (chassi, cor…) para gerar o Manual — sem alterar o produto do estoque.'}
          </p>

          {itemAtual && etapa === 'form' && (
            <p className="pdv-manual-modal__produto">
              Produto vendido: <strong>{itemAtual.produtoNome}</strong>
            </p>
          )}

          {erro && (
            <p className="st-form-error" role="alert">
              {erro}
            </p>
          )}
          {msgOk && (
            <p className="pdv-manual-modal__ok" role="status">
              {msgOk}
            </p>
          )}

          {etapa === 'form' && (
            <form
              id="pdv-manual-form"
              className="pdv-manual-form"
              onSubmit={(e) => void handleSalvar(e)}
              noValidate
            >
              <div className="pdv-field">
                <label className="pdv-field__lbl" htmlFor="pdv-man-cliente">
                  Cliente <span aria-hidden>*</span>
                </label>
                <ClientePicker
                  id="pdv-man-cliente"
                  clientes={clientes}
                  value={clienteId}
                  inputClassName="pdv-input"
                  onChange={setClienteId}
                />
              </div>

              <div className="pdv-manual-form__row">
                <label className="pdv-field">
                  <span className="pdv-field__lbl">
                    Marca <span aria-hidden>*</span>
                  </span>
                  <input
                    className="pdv-input"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    placeholder="Ex.: Caloi, Trek"
                    autoComplete="off"
                  />
                </label>
                <label className="pdv-field">
                  <span className="pdv-field__lbl">
                    Modelo <span aria-hidden>*</span>
                  </span>
                  <input
                    className="pdv-input"
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="Ex.: Elite 10"
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="pdv-manual-form__row">
                <label className="pdv-field">
                  <span className="pdv-field__lbl">Aro</span>
                  <input
                    className="pdv-input"
                    value={aro}
                    onChange={(e) => setAro(e.target.value)}
                    placeholder="29, 700C…"
                    autoComplete="off"
                  />
                </label>
                <label className="pdv-field">
                  <span className="pdv-field__lbl">Cor</span>
                  <input
                    className="pdv-input"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    placeholder="Preto, azul…"
                    autoComplete="off"
                  />
                </label>
              </div>

              <label className="pdv-field">
                <span className="pdv-field__lbl">Nº de série / chassi</span>
                <input
                  className="pdv-input"
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value)}
                  placeholder="Número único desta unidade"
                  autoComplete="off"
                />
              </label>

              <label className="pdv-field">
                <span className="pdv-field__lbl">Observações</span>
                <textarea
                  className="pdv-input pdv-manual-form__obs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </form>
          )}

          {etapa === 'link' && (
            <div className="pdv-manual-link">
              {saving && !token ? (
                <p className="pdv-manual-modal__hint">Preparando link…</p>
              ) : token ? (
                <>
                  {bikePronta && (
                    <p className="pdv-manual-link__bike">
                      {bikePronta.marca} {bikePronta.modelo}
                      {bikePronta.numero_serie ? ` · ${bikePronta.numero_serie}` : ''}
                    </p>
                  )}
                  <code className="pdv-manual-link__url">{urlManualProprietario(token)}</code>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="pdv-manual-modal__footer">
          {etapa === 'form' && (
            <>
              <button type="button" className="st-ghost-btn" onClick={onClose} disabled={saving}>
                Agora não
              </button>
              <button type="submit" form="pdv-manual-form" className="pdv-finalize" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar e gerar Manual'}
              </button>
            </>
          )}
          {etapa === 'link' && token && (
            <>
              <button type="button" className="st-ghost-btn" onClick={() => void handleCopiar()}>
                Copiar link
              </button>
              <button type="button" className="pdv-finalize" onClick={handleWhatsapp}>
                WhatsApp
              </button>
              <button type="button" className="st-ghost-btn pdv-manual-modal__footer-done" onClick={avancarOuFechar}>
                {!soCompartilhar && indice < fila.length - 1 ? 'Próxima bike' : 'Concluir'}
              </button>
            </>
          )}
          {etapa === 'link' && !token && !saving && (
            <button type="button" className="st-ghost-btn" onClick={onClose}>
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

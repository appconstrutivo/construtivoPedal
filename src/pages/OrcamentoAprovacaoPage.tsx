import { useEffect, useMemo, useState } from 'react'
import {
  calcularTotalOrcamento,
  carregarOrcamentoPublico,
  labelStatusOrcamento,
  responderOrcamentoPublico,
  type OrcamentoPublico,
  type StatusOrcamento,
} from '../services/orcamento.service'

type OrcamentoAprovacaoPageProps = {
  token: string
}

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${iso}T12:00:00`),
  )
}

export function OrcamentoAprovacaoPage({ token }: OrcamentoAprovacaoPageProps) {
  const [dados, setDados] = useState<OrcamentoPublico | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [respondendo, setRespondendo] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErro(null)
    void carregarOrcamentoPublico(token)
      .then((res) => {
        if (!res) {
          setErro('Orçamento não encontrado ou link inválido.')
          setDados(null)
          return
        }
        if (res.erro) {
          setErro(res.erro)
          setDados(null)
          return
        }
        setDados(res)
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }, [token])

  const total = useMemo(() => {
    if (!dados?.itens) return 0
    return calcularTotalOrcamento(
      dados.itens.map((i) => ({
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
      })),
      Number(dados.desconto),
    )
  }, [dados])

  async function responder(aprovar: boolean) {
    setRespondendo(true)
    setMensagem(null)
    try {
      const res = await responderOrcamentoPublico(token, aprovar)
      if (!res.ok) {
        setErro(res.erro ?? 'Não foi possível registrar sua resposta.')
        return
      }
      setMensagem(aprovar ? 'Orçamento aprovado. Obrigado!' : 'Orçamento recusado.')
      setDados((prev) => (prev ? { ...prev, status: res.status ?? prev.status } : prev))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar resposta.')
    } finally {
      setRespondendo(false)
    }
  }

  const podeResponder = dados?.status === 'enviado'

  return (
    <div className="orc-pub">
      <div className="orc-pub__card">
        {loading && <p className="orc-pub__hint">Carregando orçamento…</p>}
        {erro && <p className="orc-pub__erro">{erro}</p>}
        {!loading && dados && !dados.erro && (
          <>
            <header className="orc-pub__head">
              <p className="orc-pub__loja">{dados.loja_nome}</p>
              <h1 className="orc-pub__title">Orçamento #{dados.numero}</h1>
              <p className="orc-pub__cliente">{dados.cliente_nome}</p>
              <span className={`orc-pub__status orc-pub__status--${dados.status}`}>
                {labelStatusOrcamento(dados.status as StatusOrcamento)}
              </span>
            </header>
            {dados.resumo && <p className="orc-pub__resumo">{dados.resumo}</p>}
            {formatDate(dados.valido_ate) && (
              <p className="orc-pub__validade">Válido até {formatDate(dados.valido_ate)}</p>
            )}
            <table className="orc-pub__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qtd</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item, idx) => (
                  <tr key={`${item.descricao}-${idx}`}>
                    <td>
                      {item.descricao}
                      <small>{item.tipo === 'servico' ? 'Serviço' : 'Peça'}</small>
                    </td>
                    <td>{item.quantidade}</td>
                    <td>{formatBRL(Number(item.quantidade) * Number(item.preco_unitario))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="orc-pub__total">Total: {formatBRL(total)}</p>
            {mensagem && <p className="orc-pub__ok">{mensagem}</p>}
            {podeResponder && !mensagem && (
              <div className="orc-pub__actions">
                <button
                  type="button"
                  className="orc-pub__btn orc-pub__btn--no"
                  disabled={respondendo}
                  onClick={() => void responder(false)}
                >
                  Recusar
                </button>
                <button
                  type="button"
                  className="orc-pub__btn orc-pub__btn--yes"
                  disabled={respondendo}
                  onClick={() => void responder(true)}
                >
                  Aprovar orçamento
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}


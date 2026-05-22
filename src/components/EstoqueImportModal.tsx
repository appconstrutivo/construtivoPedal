import { useEffect, useMemo, useState } from 'react'
import {
  calcularCustoComAdicional,
  calcularPrecoComMarkup,
  parsePlanilhaEstoque,
  type LinhaPlanilhaEstoque,
} from '../lib/estoque-import-planilha'
import { formatQuantidadeInteira } from '../lib/quantidade'
import {
  importarItensPlanilhaEstoque,
  type FornecedorRow,
  type ResultadoImportacaoPlanilha,
} from '../services/estoque.service'

type EstoqueImportModalProps = {
  open: boolean
  companyId: string
  activeStoreId: string
  fornecedores: FornecedorRow[]
  onClose: () => void
  onImported: () => Promise<void>
}

function formatBRL(v: number) {
  const n = Number.isFinite(v) ? v : 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export function EstoqueImportModal({
  open,
  companyId,
  activeStoreId,
  fornecedores,
  onClose,
  onImported,
}: EstoqueImportModalProps) {
  const [fornecedorId, setFornecedorId] = useState('')
  const [custoAdicionalPct, setCustoAdicionalPct] = useState('')
  const [markupPct, setMarkupPct] = useState('0')
  const [linhas, setLinhas] = useState<LinhaPlanilhaEstoque[]>([])
  const [parseErros, setParseErros] = useState<string[]>([])
  const [arquivoNome, setArquivoNome] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 })
  const [resultado, setResultado] = useState<ResultadoImportacaoPlanilha | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const preview = useMemo(() => linhas.slice(0, 8), [linhas])
  const custoAdicionalNumero = useMemo(() => {
    const raw = String(custoAdicionalPct).trim().replace(',', '.')
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : Number.NaN
  }, [custoAdicionalPct])
  const markupNumero = Number(String(markupPct).trim().replace(',', '.'))

  useEffect(() => {
    if (!open) return
    setFornecedorId(fornecedores[0]?.id ?? '')
    setCustoAdicionalPct('')
    setMarkupPct('0')
    setLinhas([])
    setParseErros([])
    setArquivoNome(null)
    setResultado(null)
    setErro(null)
    setProgresso({ feito: 0, total: 0 })
  }, [open, fornecedores])

  if (!open) return null

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setResultado(null)
    setErro(null)
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      setErro('Envie um arquivo Excel (.xlsx ou .xls).')
      return
    }

    setArquivoNome(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = parsePlanilhaEstoque(buffer)
      setLinhas(parsed.linhas)
      setParseErros(parsed.erros)
      if (parsed.linhas.length === 0 && parsed.erros.length > 0) {
        setErro(parsed.erros[0] ?? 'Planilha inválida.')
      }
    } catch {
      setLinhas([])
      setParseErros(['Não foi possível ler o arquivo.'])
      setErro('Não foi possível ler o arquivo.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setResultado(null)

    if (!activeStoreId) {
      setErro('Selecione uma loja no topo da tela.')
      return
    }
    if (!fornecedorId) {
      setErro('Selecione o fornecedor da planilha.')
      return
    }
    const custoAdicional = String(custoAdicionalPct).trim()
      ? Number(String(custoAdicionalPct).trim().replace(',', '.'))
      : 0
    if (!Number.isFinite(custoAdicional) || custoAdicional < 0) {
      setErro('Informe um custo adicional válido (0 ou mais), ou deixe em branco.')
      return
    }
    const markup = Number(String(markupPct).trim().replace(',', '.'))
    if (!Number.isFinite(markup) || markup < 0) {
      setErro('Informe um markup válido (0 ou mais).')
      return
    }
    if (linhas.length === 0) {
      setErro('Carregue uma planilha com ao menos um item válido.')
      return
    }

    setImportando(true)
    setProgresso({ feito: 0, total: linhas.length })
    try {
      const res = await importarItensPlanilhaEstoque({
        companyId,
        storeId: activeStoreId,
        fornecedorId,
        markupPct: markup,
        custoAdicionalPct: custoAdicional,
        linhas,
        onProgress: (feito, total) => setProgresso({ feito, total }),
      })
      setResultado(res)
      await onImported()
      if (res.erros.length === 0) onClose()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar planilha.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="st-import-title">
      <div className="st-modal st-modal--lg">
        <div className="st-modal__head">
          <h2 id="st-import-title" className="st-modal__title">
            Importar itens por planilha
          </h2>
          <button type="button" className="st-modal__close" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="st-form" onSubmit={(e) => void handleSubmit(e)}>
          <p className="st-pricing-hint">
            Colunas da planilha: <strong>SKU</strong> (código do fornecedor, só para conferência),{' '}
            <strong>Nome</strong>, <strong>Preço de Venda</strong> (= <strong>Custo (R$)</strong> no cadastro) e{' '}
            <strong>Quantidade</strong>. Se o item já existir, o sistema mantém o <strong>maior custo</strong> entre o
            cadastro e a planilha e <strong>não altera</strong> o preço varejo/atacado já cadastrado.
            O arquivo é lido apenas no seu navegador — <strong>não é salvo no Supabase</strong>. Cada item
            novo recebe o <strong>SKU interno da loja</strong> (000001, 000002…) como no cadastro manual.
          </p>
          <label className="st-field">
            <span>Fornecedor *</span>
              <select
                className="st-input"
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
                required
                disabled={importando || fornecedores.length === 0}
              >
                <option value="">
                  {fornecedores.length === 0 ? 'Cadastre um fornecedor antes' : 'Selecione…'}
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
          </label>
          <div className="st-form-grid">
            <label className="st-field">
              <span>Custo adicional (%)</span>
              <input
                className="st-input"
                type="number"
                min={0}
                step="0.01"
                value={custoAdicionalPct}
                onChange={(e) => setCustoAdicionalPct(e.target.value)}
                placeholder="Opcional — impostos, cupons…"
                disabled={importando}
              />
              <p className="st-field__hint">
                Soma em todos os itens sobre o valor da planilha (ex.: 5% em R$ 10,00 → R$ 10,50 de custo).
              </p>
            </label>
            <label className="st-field">
              <span>Markup sobre o custo (%)</span>
              <input
                className="st-input"
                type="number"
                min={0}
                step="0.01"
                value={markupPct}
                onChange={(e) => setMarkupPct(e.target.value)}
                disabled={importando}
              />
              <p className="st-field__hint">
                Aplica só em itens <strong>novos</strong>: preço varejo/atacado = custo (com adicional) + markup.
              </p>
            </label>
          </div>
          <label className="st-field">
            <span>Arquivo Excel (.xlsx)</span>
            <input
              className="st-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void handleArquivo(e)}
              disabled={importando}
            />
            {arquivoNome && (
              <p className="st-field__hint">
                {arquivoNome} — {linhas.length} item(ns) válido(s). Arquivo descartado após a leitura.
              </p>
            )}
          </label>
          {parseErros.length > 0 && (
            <div className="st-import-erros" role="alert">
              <p className="st-import-erros__title">Avisos na leitura</p>
              <ul>
                {parseErros.slice(0, 6).map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.length > 0 && (
            <div className="st-import-preview">
              <p className="st-import-preview__title">Prévia</p>
              <div className="st-import-preview__scroll">
                <table className="st-import-table">
                  <thead>
                    <tr>
                      <th>Cód. planilha</th>
                      <th>Nome</th>
                      <th>Custo</th>
                      <th>Qtd</th>
                      <th>Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((linha) => {
                      const adicional = Number.isFinite(custoAdicionalNumero) ? custoAdicionalNumero : 0
                      const custo = calcularCustoComAdicional(linha.custo, adicional)
                      const markup = Number.isFinite(markupNumero) ? markupNumero : 0
                      return (
                        <tr key={`${linha.linhaPlanilha}-${linha.skuFornecedor}`}>
                          <td>{linha.skuFornecedor}</td>
                          <td>{linha.nome.length > 40 ? `${linha.nome.slice(0, 40)}…` : linha.nome}</td>
                          <td>{formatBRL(custo)}</td>
                          <td>{formatQuantidadeInteira(linha.quantidade)}</td>
                          <td>{formatBRL(calcularPrecoComMarkup(custo, markup))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {importando && (
            <p className="st-field__hint" aria-live="polite">
              Importando… {progresso.feito} de {progresso.total}
            </p>
          )}
          {resultado && (
            <div className="st-import-resultado" role="status">
              <p>
                <strong>{resultado.criados}</strong> criado(s),                 <strong>{resultado.atualizados}</strong>{' '}
                atualizado(s) (mesmo SKU do fornecedor ou nome, na loja e fornecedor selecionados).
              </p>
              {resultado.erros.length > 0 && (
                <ul>
                  {resultado.erros.slice(0, 5).map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {erro && <p className="st-form-error">{erro}</p>}
          <div className="st-form-actions">
            <button type="button" className="st-ghost-btn" onClick={onClose} disabled={importando}>
              Cancelar
            </button>
            <button
              type="submit"
              className="st-primary-btn"
              disabled={importando || !fornecedorId || linhas.length === 0}
            >
              {importando ? 'Importando…' : `Importar ${linhas.length} item(ns)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

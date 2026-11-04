import { formatQuantidadeInteira } from './quantidade'

export type FaltaEstoqueMontagemKit = {
  componenteItemId: string
  componenteNome: string
  necessario: number
  disponivel: number
  falta: number
}

export type SubstituicaoMontagemKit = {
  componenteItemId: string
  substituirPorItemId: string
}

type ComponenteMontagem = {
  componenteItemId: string
  componenteNome: string
  quantidade: number
}

type ItemSaldo = {
  id: string
  nome: string
  saldo_atual: number
}

/** Aplica substituições manuais sobre a receita da versão. */
export function componentesEfetivosMontagem(
  componentes: ComponenteMontagem[],
  substituicoes: SubstituicaoMontagemKit[],
  itens: Array<{ id: string; nome: string }>,
): ComponenteMontagem[] {
  const subPorReceita = new Map(
    substituicoes
      .filter((s) => s.componenteItemId && s.substituirPorItemId)
      .map((s) => [s.componenteItemId, s.substituirPorItemId]),
  )
  const nomePorId = new Map(itens.map((i) => [i.id, i.nome]))

  return componentes.map((comp) => {
    const efetivoId = subPorReceita.get(comp.componenteItemId) ?? comp.componenteItemId
    if (efetivoId === comp.componenteItemId) return comp
    return {
      ...comp,
      componenteItemId: efetivoId,
      componenteNome: nomePorId.get(efetivoId) || 'Peça substituta',
    }
  })
}

/** Verifica se há saldo para montar `quantidadeKits` unidades (multiplica cada componente efetivo). */
export function verificarEstoqueMontagemKit(
  componentes: ComponenteMontagem[],
  quantidadeKits: number,
  itens: ItemSaldo[],
  substituicoes: SubstituicaoMontagemKit[] = [],
): FaltaEstoqueMontagemKit[] {
  if (!Number.isFinite(quantidadeKits) || quantidadeKits <= 0) return []

  const efetivos = componentesEfetivosMontagem(componentes, substituicoes, itens)
  const saldoPorId = new Map(
    itens.map((i) => [i.id, Math.max(0, Math.trunc(Number(i.saldo_atual) || 0))]),
  )
  const nomePorId = new Map(itens.map((i) => [i.id, i.nome]))
  const faltas: FaltaEstoqueMontagemKit[] = []

  for (const comp of efetivos) {
    const qtdPorKit = Math.trunc(Number(comp.quantidade) || 0)
    if (qtdPorKit <= 0) continue

    const necessario = qtdPorKit * quantidadeKits
    const disponivel = saldoPorId.get(comp.componenteItemId) ?? 0

    if (disponivel < necessario) {
      faltas.push({
        componenteItemId: comp.componenteItemId,
        componenteNome: comp.componenteNome || nomePorId.get(comp.componenteItemId) || 'Componente',
        necessario,
        disponivel,
        falta: necessario - disponivel,
      })
    }
  }

  return faltas
}

export function mensagemFaltaEstoqueMontagemKit(faltas: FaltaEstoqueMontagemKit[]): string {
  if (faltas.length === 0) return ''

  const linhas = faltas.map(
    (f) =>
      `• ${f.componenteNome}: necessário ${formatQuantidadeInteira(f.necessario)}, disponível ${formatQuantidadeInteira(f.disponivel)} (faltam ${formatQuantidadeInteira(f.falta)})`,
  )

  return `Estoque insuficiente para montar o kit:\n${linhas.join('\n')}`
}

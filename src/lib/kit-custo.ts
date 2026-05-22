import { roundMoney } from './money'
import { parseQuantidadeInteira } from './quantidade'

type ItemComCusto = { id: string; custo_medio: number }

export type LinhaCustoKit = {
  componenteItemId: string
  quantidade: number
}

/** Custo de 1 unidade montada = Σ (custo médio do componente × quantidade na receita). */
export function calcularCustoComposicaoKit(
  componentes: LinhaCustoKit[],
  itens: ItemComCusto[],
): number {
  if (componentes.length === 0) return 0

  const custoPorId = new Map(itens.map((i) => [i.id, Number(i.custo_medio) || 0]))
  let total = 0

  for (const comp of componentes) {
    const qtd = Number(comp.quantidade)
    if (!Number.isFinite(qtd) || qtd <= 0) continue
    total += (custoPorId.get(comp.componenteItemId) ?? 0) * qtd
  }

  return roundMoney(total)
}

export function calcularCustoLinhasKitForm(
  linhas: Array<{ itemId: string; quantidade: string }>,
  itens: ItemComCusto[],
): number {
  const componentes: LinhaCustoKit[] = []

  for (const linha of linhas) {
    const itemId = linha.itemId.trim()
    if (!itemId) continue
    const quantidade = parseQuantidadeInteira(linha.quantidade)
    if (!Number.isFinite(quantidade) || quantidade <= 0) continue
    componentes.push({ componenteItemId: itemId, quantidade })
  }

  return calcularCustoComposicaoKit(componentes, itens)
}

/**
 * Helpers para consultas PostgREST com muitos IDs.
 * `.in()` em URL longa gera HTTP 400 (Bad Request) — lotear evita o limite.
 */

const IN_CHUNK = 80
const PAGE_SIZE = 1000

export function chunkIds<T>(ids: T[], size = IN_CHUNK): T[][] {
  if (ids.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size))
  }
  return out
}

type QueryError = { message?: string } | null

/**
 * Busca linhas filtrando por `.in(coluna, ids)` em lotes.
 * `buildQuery` deve retornar a query já com select/eq — só falta o `.in`.
 */
export async function selectByIdsInBatches<T>(
  ids: string[],
  buildQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: QueryError }>,
): Promise<T[]> {
  if (ids.length === 0) return []
  const rows: T[] = []
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await buildQuery(chunk)
    if (error) {
      throw new Error(error.message ?? 'Erro ao carregar dados em lote.')
    }
    if (data?.length) rows.push(...data)
  }
  return rows
}

/**
 * Pagina um select até esgotar (PostgREST limita ~1000 linhas por request).
 * `buildPage` recebe from/to inclusivos para `.range(from, to)`.
 */
export async function selectAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await buildPage(from, to)
    if (error) {
      throw new Error(error.message ?? 'Erro ao carregar página de dados.')
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return rows
}

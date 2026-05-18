-- Parcelas de despesas recorrentes (aluguel, internet, etc.).

alter table public.financeiro_contas_pagar
  add column if not exists grupo_recorrencia_id uuid,
  add column if not exists parcela integer,
  add column if not exists parcelas_total integer;

create index if not exists idx_financeiro_contas_pagar_grupo
  on public.financeiro_contas_pagar (grupo_recorrencia_id)
  where grupo_recorrencia_id is not null;

alter table public.financeiro_contas_pagar
  drop constraint if exists financeiro_contas_pagar_parcela_check;

alter table public.financeiro_contas_pagar
  add constraint financeiro_contas_pagar_parcela_check
  check (
    (parcela is null and parcelas_total is null)
    or (
      parcela is not null
      and parcelas_total is not null
      and parcela >= 1
      and parcelas_total >= 1
      and parcela <= parcelas_total
    )
  );

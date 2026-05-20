-- Alinha data_recebimento das contas já recebidas com realizada_em da venda vinculada.
update public.financeiro_contas_receber cr
set data_recebimento = (v.realizada_em at time zone 'America/Sao_Paulo')::date
from public.vendas v
where cr.venda_id = v.id
  and cr.status = 'recebido'
  and v.realizada_em is not null
  and cr.data_recebimento is distinct from (v.realizada_em at time zone 'America/Sao_Paulo')::date;

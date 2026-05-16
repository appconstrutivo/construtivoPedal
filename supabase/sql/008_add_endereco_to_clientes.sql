-- Campo opcional de endereço no cadastro de clientes.
alter table public.clientes
  add column if not exists endereco text;

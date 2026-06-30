-- Campos do cliente para exibição na nota de compra (destinatário).
alter table public.clientes
  add column if not exists cpf_cnpj text,
  add column if not exists inscricao_estadual text,
  add column if not exists bairro text,
  add column if not exists cep text,
  add column if not exists municipio text,
  add column if not exists uf char(2);

comment on column public.clientes.cpf_cnpj is 'CPF ou CNPJ do cliente (somente dígitos ou formatado).';
comment on column public.clientes.inscricao_estadual is 'Inscrição estadual do cliente (PJ).';
comment on column public.clientes.endereco is 'Logradouro e número.';
comment on column public.clientes.bairro is 'Bairro ou distrito.';
comment on column public.clientes.cep is 'CEP.';
comment on column public.clientes.municipio is 'Município.';
comment on column public.clientes.uf is 'UF (sigla de 2 letras).';

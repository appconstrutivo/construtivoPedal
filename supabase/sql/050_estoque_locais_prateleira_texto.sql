-- Permite texto livre na prateleira (ex.: "topo", "A", "fundo").
-- Execute após 049.

alter table public.estoque_locais
  drop constraint if exists estoque_locais_prateleira_letter;

alter table public.estoque_locais
  drop constraint if exists estoque_locais_prateleira_not_empty;

alter table public.estoque_locais
  add constraint estoque_locais_prateleira_not_empty
    check (char_length(trim(prateleira)) > 0 and char_length(trim(prateleira)) <= 32);

create or replace function public.estoque_local_format_codigo(
  p_estante integer,
  p_prateleira text,
  p_divisoria integer
)
returns text
language sql
immutable
as $$
  select p_estante::text || '-' || trim(p_prateleira) || '-' || lpad(p_divisoria::text, 2, '0');
$$;

create or replace function public.estoque_local_format_nome(
  p_estante integer,
  p_prateleira text,
  p_divisoria integer
)
returns text
language sql
immutable
as $$
  select
    'Estante ' || p_estante::text
    || ' · Prateleira ' || trim(p_prateleira)
    || ' · Divisória ' || p_divisoria::text;
$$;

create or replace function public.set_estoque_locais_derived_fields()
returns trigger
language plpgsql
as $$
begin
  new.prateleira := trim(new.prateleira);
  new.codigo := public.estoque_local_format_codigo(new.estante, new.prateleira, new.divisoria);
  new.nome := public.estoque_local_format_nome(new.estante, new.prateleira, new.divisoria);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

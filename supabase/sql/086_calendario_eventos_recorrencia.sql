-- Recorrência na agenda: série materializada (ex.: todo dia 10 até data limite).

alter table public.calendario_eventos
  add column if not exists grupo_recorrencia_id uuid,
  add column if not exists ocorrencia integer,
  add column if not exists ocorrencias_total integer;

create index if not exists idx_calendario_eventos_grupo_recorrencia
  on public.calendario_eventos (grupo_recorrencia_id)
  where grupo_recorrencia_id is not null;

comment on column public.calendario_eventos.grupo_recorrencia_id is
  'Agrupa ocorrências geradas juntas (evento recorrente).';
comment on column public.calendario_eventos.ocorrencia is
  'Número da ocorrência na série (1..N).';
comment on column public.calendario_eventos.ocorrencias_total is
  'Total de ocorrências da série.';

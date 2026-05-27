-- Normaliza nomes de itens importados com quebras de linha ou espaços duplicados.
update public.estoque_itens
set nome = regexp_replace(trim(nome), '\s+', ' ', 'g'),
    updated_at = now()
where nome ~ E'[\r\n]' or nome ~ '\s{2,}';

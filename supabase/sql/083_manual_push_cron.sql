-- Agenda diária do dispatch de push do Manual (09:00 America/Sao_Paulo = 12:00 UTC).
-- O secret do header deve bater com CRON_SECRET da Edge Function.
-- Se recriar o job, atualize o x-cron-secret no SQL abaixo via Dashboard/SQL Editor.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Nota: o valor do secret é configurado no projeto (não versionar o secret real aqui).
-- Use o SQL Editor para (re)agendar com o CRON_SECRET atual dos secrets da function.

-- Rode LOGO DEPOIS de restaurar a cópia de TESTE na VPS.
-- Desliga todas as rotinas automáticas da cópia, para que ela não envie
-- mensagens nem chame o painel antigo enquanto você testa.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < deploy/vps/sql/00-modo-teste.sql
UPDATE cron.job SET active = false;
SELECT jobname, active FROM cron.job ORDER BY jobname;

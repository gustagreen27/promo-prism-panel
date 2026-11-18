-- Conferência rápida depois de restaurar: quantidade de registros principais.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < deploy/vps/sql/02-conferir.sql
SELECT 'contas de login' AS item, count(*) FROM auth.users
UNION ALL SELECT 'clientes (workspaces)', count(*) FROM public.workspaces
UNION ALL SELECT 'disparos', count(*) FROM public.wa_campaigns
UNION ALL SELECT 'destinatários', count(*) FROM public.campaign_recipients
UNION ALL SELECT 'campanhas de link', count(*) FROM public.campaigns
UNION ALL SELECT 'cliques', count(*) FROM public.campaign_clicks
UNION ALL SELECT 'automações', count(*) FROM public.automations
UNION ALL SELECT 'carteiras', count(*) FROM public.workspace_wallets
UNION ALL SELECT 'arquivos registrados', count(*) FROM storage.objects;

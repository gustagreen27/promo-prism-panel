UPDATE public.campaign_recipients SET status='skipped', failed_reason='Número inválido (não é celular brasileiro)', updated_at=now()
WHERE campaign_id='c0a9929e-3251-40b2-8dc4-9fd514162964' AND status='pending' AND phone !~ '^55[1-9][1-9]9[0-9]{8}$';
UPDATE public.wa_campaigns SET last_error=NULL WHERE id='c0a9929e-3251-40b2-8dc4-9fd514162964';
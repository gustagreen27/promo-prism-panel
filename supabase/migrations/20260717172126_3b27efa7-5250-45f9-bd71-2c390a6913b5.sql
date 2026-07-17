CREATE OR REPLACE FUNCTION public.wa_clamp_campaign_worker_lease()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'running'
     AND NEW.worker_lease_until IS NOT NULL
     AND NEW.worker_lease_until > (clock_timestamp() + interval '5 seconds') THEN
    NEW.worker_lease_until := clock_timestamp() + interval '5 seconds';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_wa_clamp_campaign_worker_lease ON public.wa_campaigns;
CREATE TRIGGER trg_wa_clamp_campaign_worker_lease
BEFORE INSERT OR UPDATE OF worker_lease_until, status ON public.wa_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.wa_clamp_campaign_worker_lease();

UPDATE public.wa_campaigns
SET worker_lease_until = LEAST(worker_lease_until, clock_timestamp() + interval '5 seconds'),
    updated_at = clock_timestamp()
WHERE status = 'running'
  AND worker_lease_until IS NOT NULL
  AND worker_lease_until > (clock_timestamp() + interval '5 seconds');

INSERT INTO public.campaign_timeline (campaign_id, event_type, message, payload)
VALUES (
  'cf31166b-1b8d-4e59-9ae8-9801334fce25',
  'throughput_fix',
  'Proteção ativa: lease de worker limitado a 5s para evitar pausas longas',
  jsonb_build_object('max_worker_lease_seconds', 5)
);
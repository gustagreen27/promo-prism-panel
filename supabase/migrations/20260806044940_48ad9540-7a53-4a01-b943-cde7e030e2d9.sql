INSERT INTO public.whatsapp_wabas (nome_interno, business_id, waba_id, status, access_token, onboarded_via, onboarded_at, workspace_id)
SELECT 'Amanda Sales', '875290778530113', '1567288174802413', 'ativa',
 'EAANL0m3F3lkBSG8AJm2Wf67AynyZB7XEeKJIObxpRGAIBHNcqQlMCKHhOcseZCf2SXdjEW7iWy5uskZB4uJV6Q7LAEEm6P2Q1hXqQbPl0NvquA2Y9rpvitrhRagaD6ZA9ef2gtGVZCntVANQTsEU2WyhjUBcbZAexwZBMQAi65RGpBjMzaPIqQ6v0xFZAMwq308g0GVjfqeKR9yLl09YEKnvZAuDeDyayNcZBdevusAFm69wTK6ZBuLpX0VZAMvnkWAW05rSvzsaxdXwiFMZC3EvCQnr2KnDeI7A9tiWBNuQOQEG1z50fYppvt3IhAfCgDbC8AP2hZB95LX38ZD',
 'embedded_signup', now(), 'b9d103f7-1d10-42a7-ac8a-a9b115070bec'
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_wabas w WHERE w.waba_id='1567288174802413');

INSERT INTO public.whatsapp_connections
 (name, nome_interno, display_phone, verified_name, display_name, phone_number_id, waba_id, business_id,
  access_token, use_global_token, status, quality_rating, code_verification_status,
  onboarding_mode, embedded_signup_completed_at, workspace_id, waba_ref_id)
SELECT 'Amanda Sales', 'Amanda Sales', '+1 555-401-6605', 'Amanda Sales', 'Amanda Sales',
 '1193707613832523', '1567288174802413', '875290778530113',
 'EAANL0m3F3lkBSG8AJm2Wf67AynyZB7XEeKJIObxpRGAIBHNcqQlMCKHhOcseZCf2SXdjEW7iWy5uskZB4uJV6Q7LAEEm6P2Q1hXqQbPl0NvquA2Y9rpvitrhRagaD6ZA9ef2gtGVZCntVANQTsEU2WyhjUBcbZAexwZBMQAi65RGpBjMzaPIqQ6v0xFZAMwq308g0GVjfqeKR9yLl09YEKnvZAuDeDyayNcZBdevusAFm69wTK6ZBuLpX0VZAMvnkWAW05rSvzsaxdXwiFMZC3EvCQnr2KnDeI7A9tiWBNuQOQEG1z50fYppvt3IhAfCgDbC8AP2hZB95LX38ZD',
 false, 'ativa', 'UNKNOWN', 'VERIFIED', 'standard', now(), 'b9d103f7-1d10-42a7-ac8a-a9b115070bec',
 w.id
FROM public.whatsapp_wabas w
WHERE w.waba_id = '1567288174802413'
AND NOT EXISTS (SELECT 1 FROM public.whatsapp_connections c WHERE c.phone_number_id = '1193707613832523');
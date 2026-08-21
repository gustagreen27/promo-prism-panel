UPDATE public.wa_campaigns c
SET approval_status = 'not_required'
WHERE c.approval_status = 'pending'
  AND c.created_by IS NOT NULL
  AND public.is_internal_staff(c.created_by);
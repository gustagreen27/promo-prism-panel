DELETE FROM public.imported_dispatch_report_records a
USING public.imported_dispatch_report_records b
WHERE a.ctid < b.ctid
  AND a.report_id = b.report_id
  AND a.boost_item_id IS NOT NULL
  AND a.boost_item_id = b.boost_item_id;

CREATE UNIQUE INDEX IF NOT EXISTS imported_report_records_report_item_uidx
  ON public.imported_dispatch_report_records (report_id, boost_item_id)
  WHERE boost_item_id IS NOT NULL;
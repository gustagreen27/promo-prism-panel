DROP INDEX IF EXISTS public.imported_report_records_report_item_uidx;
DROP INDEX IF EXISTS public.idx_idrr_report_item;
CREATE UNIQUE INDEX idx_idrr_report_item ON public.imported_dispatch_report_records (report_id, boost_item_id);

-- 1) Table for imported purchases (audit + history)
CREATE TABLE public.imported_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_path TEXT,
  extracted_payload JSONB,
  final_payload JSONB,
  gestaoclick_purchase_id TEXT,
  gestaoclick_invoice_number TEXT,
  supplier_name TEXT,
  supplier_document TEXT,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  error_message TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_purchases TO authenticated;
GRANT ALL ON public.imported_purchases TO service_role;

ALTER TABLE public.imported_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imported_purchases_select_admin_logistico"
ON public.imported_purchases FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role));

CREATE POLICY "imported_purchases_insert_admin_logistico"
ON public.imported_purchases FOR INSERT
TO authenticated
WITH CHECK (
  (created_by = auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
);

CREATE POLICY "imported_purchases_update_admin_logistico"
ON public.imported_purchases FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role));

CREATE POLICY "imported_purchases_delete_admin"
ON public.imported_purchases FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_imported_purchases_updated_at
BEFORE UPDATE ON public.imported_purchases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Private storage bucket for invoice scans
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-scans', 'invoice-scans', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "invoice_scans_select_admin_logistico"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-scans'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
);

CREATE POLICY "invoice_scans_insert_admin_logistico"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoice-scans'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
);

CREATE POLICY "invoice_scans_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoice-scans'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

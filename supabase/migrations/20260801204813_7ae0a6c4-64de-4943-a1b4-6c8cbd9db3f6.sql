CREATE POLICY "recibos_caixa_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recibos-caixa'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "recibos_caixa_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'recibos-caixa'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'logistico')
  )
);

CREATE POLICY "recibos_caixa_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'recibos-caixa'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);
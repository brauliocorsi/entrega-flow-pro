CREATE POLICY assistencias_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assistencias' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY assistencias_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assistencias'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'logistico')
    )
  );
CREATE POLICY assistencias_delete_admin ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assistencias' AND public.has_role(auth.uid(), 'admin'));

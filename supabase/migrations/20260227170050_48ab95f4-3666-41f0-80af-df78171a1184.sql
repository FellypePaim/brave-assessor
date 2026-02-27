CREATE POLICY "Admins can view all whatsapp_links"
ON public.whatsapp_links
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));
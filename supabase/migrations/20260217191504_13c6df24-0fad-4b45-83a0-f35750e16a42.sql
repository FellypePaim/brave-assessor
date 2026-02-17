
-- Storage bucket for support chat images
INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true);

-- Anyone authenticated can upload
CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

-- Public read
CREATE POLICY "Support attachments are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'support-attachments');

-- Add image_url column to support_messages
ALTER TABLE public.support_messages ADD COLUMN image_url text;

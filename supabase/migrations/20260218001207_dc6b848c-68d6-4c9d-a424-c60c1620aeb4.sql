
-- Table to link WhatsApp numbers to user accounts
CREATE TABLE public.whatsapp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text,
  verification_code text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  UNIQUE(user_id)
);

-- Index for fast lookups
CREATE INDEX idx_whatsapp_links_phone ON public.whatsapp_links(phone_number) WHERE verified = true;
CREATE INDEX idx_whatsapp_links_code ON public.whatsapp_links(verification_code) WHERE verified = false;

-- Enable RLS
ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own link
CREATE POLICY "Users can view own whatsapp link"
  ON public.whatsapp_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own whatsapp link"
  ON public.whatsapp_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own whatsapp link"
  ON public.whatsapp_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own whatsapp link"
  ON public.whatsapp_links FOR DELETE
  USING (auth.uid() = user_id);

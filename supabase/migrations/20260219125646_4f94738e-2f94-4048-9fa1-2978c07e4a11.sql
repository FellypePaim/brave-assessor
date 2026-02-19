
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  step text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX idx_whatsapp_sessions_phone ON public.whatsapp_sessions(phone_number);
CREATE INDEX idx_whatsapp_sessions_expires ON public.whatsapp_sessions(expires_at);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage sessions"
  ON public.whatsapp_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

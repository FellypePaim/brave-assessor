CREATE TABLE IF NOT EXISTS public.whatsapp_pending_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  category_id UUID NULL,
  category_name TEXT NULL,
  payment_method TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.whatsapp_pending_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage pending transactions"
ON public.whatsapp_pending_transactions
FOR ALL
USING (true)
WITH CHECK (true);
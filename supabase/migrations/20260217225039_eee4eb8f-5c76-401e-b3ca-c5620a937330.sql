
-- Table for recurring transaction templates
CREATE TABLE public.recurring_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  expense_type TEXT DEFAULT 'fixed', -- 'fixed' or 'variable'
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recurring transactions"
ON public.recurring_transactions FOR ALL
USING (auth.uid() = user_id);

-- Add fields to transactions for bill tracking
ALTER TABLE public.transactions 
  ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN recurring_id UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
  ADD COLUMN due_date DATE;

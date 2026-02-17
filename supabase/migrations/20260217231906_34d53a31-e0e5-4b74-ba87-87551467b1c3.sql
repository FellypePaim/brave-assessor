
-- Add color column to wallets
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;

-- Add color column to cards
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;

-- Add color column to financial_goals
ALTER TABLE public.financial_goals ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;

-- Add subscription expiration date to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamp with time zone DEFAULT NULL;

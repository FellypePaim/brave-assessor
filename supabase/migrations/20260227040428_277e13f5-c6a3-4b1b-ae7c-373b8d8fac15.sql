-- Add unique constraint on phone_number for whatsapp_sessions
-- This is needed for upsert operations to work correctly
ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_phone_number_key UNIQUE (phone_number);

-- Rate limiter table for WhatsApp webhook
CREATE TABLE public.whatsapp_rate_limits (
  phone_number TEXT PRIMARY KEY,
  message_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service role accesses this
ALTER TABLE public.whatsapp_rate_limits ENABLE ROW LEVEL SECURITY;

-- DB function for atomic rate check + increment (returns true if allowed)
CREATE OR REPLACE FUNCTION public.check_whatsapp_rate_limit(
  _phone TEXT,
  _max_messages INT DEFAULT 30,
  _window_minutes INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count INT;
  _start TIMESTAMPTZ;
BEGIN
  -- Try to get existing record
  SELECT message_count, window_start INTO _count, _start
  FROM whatsapp_rate_limits
  WHERE phone_number = _phone
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First message ever
    INSERT INTO whatsapp_rate_limits (phone_number, message_count, window_start)
    VALUES (_phone, 1, now());
    RETURN TRUE;
  END IF;

  -- Check if window expired
  IF _start < now() - (_window_minutes || ' minutes')::INTERVAL THEN
    -- Reset window
    UPDATE whatsapp_rate_limits
    SET message_count = 1, window_start = now()
    WHERE phone_number = _phone;
    RETURN TRUE;
  END IF;

  -- Window active, check limit
  IF _count >= _max_messages THEN
    RETURN FALSE;
  END IF;

  -- Increment
  UPDATE whatsapp_rate_limits
  SET message_count = _count + 1
  WHERE phone_number = _phone;
  RETURN TRUE;
END;
$$;

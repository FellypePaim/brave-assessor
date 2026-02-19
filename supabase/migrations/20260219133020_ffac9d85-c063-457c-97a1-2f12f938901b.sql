
-- Add recurrence field to reminders
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));

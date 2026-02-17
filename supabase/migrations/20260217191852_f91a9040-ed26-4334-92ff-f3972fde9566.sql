
ALTER TABLE public.profiles ADD COLUMN monthly_income numeric DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN whatsapp_number text;
ALTER TABLE public.profiles ADD COLUMN notify_morning boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN notify_night boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN notify_monthly_report boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN notify_email_updates boolean DEFAULT true;

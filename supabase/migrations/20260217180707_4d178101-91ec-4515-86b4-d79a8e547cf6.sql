
-- =============================================
-- PHASE 1: Core tables, roles, auth, profiles
-- =============================================

-- 1. App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Subscription plan enum
CREATE TYPE public.subscription_plan AS ENUM ('free', 'mensal', 'trimestral', 'anual');

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  subscription_plan public.subscription_plan NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  budget_limit NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 6. Wallets table
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'checking', -- checking, savings, credit_card
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- 7. Cards table
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  last_4_digits TEXT,
  brand TEXT,
  credit_limit NUMERIC(12,2),
  due_day INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- 8. Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense', -- expense, income
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 9. Financial goals
CREATE TABLE public.financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL,
  current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;

-- 10. Family groups
CREATE TABLE public.family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;

-- 11. Family memberships
CREATE TABLE public.family_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_group_id, user_id)
);
ALTER TABLE public.family_memberships ENABLE ROW LEVEL SECURITY;

-- 12. Chat history for AI
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS (security definer)
-- =============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if two users share a family group
CREATE OR REPLACE FUNCTION public.can_access_family_resource(_resource_user_id UUID, _requesting_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _resource_user_id = _requesting_user_id
  OR EXISTS (
    SELECT 1
    FROM public.family_memberships fm1
    JOIN public.family_memberships fm2 ON fm1.family_group_id = fm2.family_group_id
    WHERE fm1.user_id = _resource_user_id
      AND fm2.user_id = _requesting_user_id
      AND fm1.status = 'active'
      AND fm2.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.family_groups fg
    JOIN public.family_memberships fm ON fg.id = fm.family_group_id
    WHERE fg.owner_id = _requesting_user_id
      AND fm.user_id = _resource_user_id
      AND fm.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.family_groups fg
    JOIN public.family_memberships fm ON fg.id = fm.family_group_id
    WHERE fg.owner_id = _resource_user_id
      AND fm.user_id = _requesting_user_id
      AND fm.status = 'active'
  )
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles (only admins can manage, users can read own)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Categories
CREATE POLICY "Users can manage own categories" ON public.categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Family can view categories" ON public.categories FOR SELECT USING (public.can_access_family_resource(user_id, auth.uid()));

-- Wallets
CREATE POLICY "Users can manage own wallets" ON public.wallets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Family can view wallets" ON public.wallets FOR SELECT USING (public.can_access_family_resource(user_id, auth.uid()));

-- Cards
CREATE POLICY "Users can manage own cards" ON public.cards FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Family can view cards" ON public.cards FOR SELECT USING (public.can_access_family_resource(user_id, auth.uid()));

-- Transactions
CREATE POLICY "Users can manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Family can view transactions" ON public.transactions FOR SELECT USING (public.can_access_family_resource(user_id, auth.uid()));

-- Financial goals
CREATE POLICY "Users can manage own goals" ON public.financial_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Family can view goals" ON public.financial_goals FOR SELECT USING (public.can_access_family_resource(user_id, auth.uid()));

-- Family groups
CREATE POLICY "Owners can manage own groups" ON public.family_groups FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Members can view their groups" ON public.family_groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.family_memberships WHERE family_group_id = id AND user_id = auth.uid() AND status = 'active')
);

-- Family memberships
CREATE POLICY "Owners can manage memberships" ON public.family_memberships FOR ALL USING (
  EXISTS (SELECT 1 FROM public.family_groups WHERE id = family_group_id AND owner_id = auth.uid())
);
CREATE POLICY "Users can view own membership" ON public.family_memberships FOR SELECT USING (auth.uid() = user_id);

-- Chat messages
CREATE POLICY "Users can manage own chat" ON public.chat_messages FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Seed default categories function (called after profile creation)
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color) VALUES
    (NEW.id, 'Alimentação', 'utensils', '#ef4444'),
    (NEW.id, 'Transporte', 'car', '#f97316'),
    (NEW.id, 'Moradia', 'home', '#8b5cf6'),
    (NEW.id, 'Saúde', 'heart', '#ec4899'),
    (NEW.id, 'Educação', 'book', '#3b82f6'),
    (NEW.id, 'Lazer', 'gamepad', '#10b981'),
    (NEW.id, 'Vestuário', 'shirt', '#f59e0b'),
    (NEW.id, 'Outros', 'more-horizontal', '#6b7280');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_seed_categories
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_categories();


-- Drop the broken recursive policies on family_groups
DROP POLICY IF EXISTS "Members can view their groups" ON public.family_groups;
DROP POLICY IF EXISTS "Owners can manage own groups" ON public.family_groups;

-- Drop broken policies on family_memberships too
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.family_memberships;
DROP POLICY IF EXISTS "Users can view own membership" ON public.family_memberships;

-- Create a security definer function to check if user is member of a group
-- This avoids RLS recursion by querying with elevated privileges
CREATE OR REPLACE FUNCTION public.is_family_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_memberships
    WHERE user_id = _user_id
      AND family_group_id = _group_id
      AND status = 'active'
  );
$$;

-- Create a security definer function to check if user owns a group
CREATE OR REPLACE FUNCTION public.is_family_owner(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_groups
    WHERE id = _group_id
      AND owner_id = _user_id
  );
$$;

-- Recreate family_groups policies (non-recursive)
CREATE POLICY "Owners can manage own groups"
ON public.family_groups
FOR ALL
USING (auth.uid() = owner_id);

CREATE POLICY "Members can view groups they belong to"
ON public.family_groups
FOR SELECT
USING (public.is_family_member(auth.uid(), id));

-- Recreate family_memberships policies (non-recursive)
CREATE POLICY "Users can view own membership"
ON public.family_memberships
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own membership"
ON public.family_memberships
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can manage memberships"
ON public.family_memberships
FOR ALL
USING (public.is_family_owner(auth.uid(), family_group_id));

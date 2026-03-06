import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Database, Users, HardDrive, Loader2, Copy, Check, Code } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExportItem {
  label: string;
  description: string;
  payload: Record<string, string>;
  icon: React.ReactNode;
  group: string;
}

const EXPORTS: ExportItem[] = [
  { label: "Perfis (profiles)", description: "Dados de perfil de todos os usuários", payload: { table: "profiles" }, icon: <Users className="h-4 w-4" />, group: "Database" },
  { label: "Roles (user_roles)", description: "Papéis de acesso dos usuários", payload: { table: "user_roles" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Carteiras (wallets)", description: "Todas as carteiras", payload: { table: "wallets" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Cartões (cards)", description: "Todos os cartões de crédito", payload: { table: "cards" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Categorias (categories)", description: "Categorias e limites de orçamento", payload: { table: "categories" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Transações (transactions)", description: "Todas as transações", payload: { table: "transactions" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Recorrências (recurring_transactions)", description: "Transações recorrentes", payload: { table: "recurring_transactions" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Metas (financial_goals)", description: "Metas financeiras", payload: { table: "financial_goals" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Lembretes (reminders)", description: "Lembretes configurados", payload: { table: "reminders" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Chat IA (chat_messages)", description: "Histórico do chat com IA", payload: { table: "chat_messages" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Grupos Familiares", description: "Grupos de família", payload: { table: "family_groups" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Membros Familiares", description: "Membros dos grupos", payload: { table: "family_memberships" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Conversas de Suporte", description: "Tickets de suporte", payload: { table: "support_conversations" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Mensagens de Suporte", description: "Mensagens dos tickets", payload: { table: "support_messages" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "WhatsApp Links", description: "Vinculações de WhatsApp", payload: { table: "whatsapp_links" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Pendentes", description: "Transações pendentes do WhatsApp", payload: { table: "whatsapp_pending_transactions" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Sessões", description: "Sessões ativas do bot", payload: { table: "whatsapp_sessions" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Rate Limits", description: "Limites de taxa por número", payload: { table: "whatsapp_rate_limits" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "Usuários Auth", description: "Todos os usuários registrados (email, data, etc)", payload: { type: "auth_users" }, icon: <Users className="h-4 w-4" />, group: "Usuários" },
  { label: "Storage Buckets", description: "Lista de buckets de armazenamento", payload: { type: "storage_buckets" }, icon: <HardDrive className="h-4 w-4" />, group: "Storage" },
  { label: "Arquivos (support-attachments)", description: "Arquivos no bucket de suporte", payload: { type: "storage_files", table: "support-attachments" }, icon: <HardDrive className="h-4 w-4" />, group: "Storage" },
];

const FULL_SCHEMA_SQL = [
  "-- =============================================",
  "-- BRAVE ASSESSOR — Schema completo para migração",
  "-- Execute na ordem abaixo no SQL Editor do Supabase",
  "-- =============================================",
  "",
  "-- 1. ENUMS",
  "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN CREATE TYPE public.app_role AS ENUM ('admin', 'user'); END IF; END $$;",
  "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN CREATE TYPE public.subscription_plan AS ENUM ('free', 'mensal', 'trimestral', 'anual', 'teste'); END IF; END $$;",
  "",
  "-- 2. TABELAS",
  "",
  "CREATE TABLE public.profiles (",
  "  id uuid PRIMARY KEY,",
  "  display_name text,",
  "  avatar_url text,",
  "  whatsapp_number text,",
  "  has_completed_onboarding boolean NOT NULL DEFAULT false,",
  "  subscription_plan subscription_plan NOT NULL DEFAULT 'free',",
  "  subscription_expires_at timestamptz,",
  "  monthly_income numeric DEFAULT 0,",
  "  notify_morning boolean DEFAULT true,",
  "  notify_night boolean DEFAULT true,",
  "  notify_monthly_report boolean DEFAULT true,",
  "  notify_email_updates boolean DEFAULT true,",
  "  created_at timestamptz NOT NULL DEFAULT now(),",
  "  updated_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.user_roles (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  role app_role NOT NULL DEFAULT 'user',",
  "  UNIQUE (user_id, role)",
  ");",
  "",
  "CREATE TABLE public.wallets (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  name text NOT NULL,",
  "  type text NOT NULL DEFAULT 'checking',",
  "  balance numeric NOT NULL DEFAULT 0,",
  "  color text,",
  "  icon text,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.categories (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  name text NOT NULL,",
  "  icon text,",
  "  color text,",
  "  budget_limit numeric,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.cards (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  name text NOT NULL,",
  "  credit_limit numeric,",
  "  color text,",
  "  brand text,",
  "  due_day integer,",
  "  last_4_digits text,",
  "  wallet_id uuid REFERENCES public.wallets(id),",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.recurring_transactions (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  description text NOT NULL,",
  "  amount numeric NOT NULL,",
  "  type text NOT NULL DEFAULT 'expense',",
  "  expense_type text DEFAULT 'fixed',",
  "  day_of_month integer NOT NULL DEFAULT 1,",
  "  category_id uuid REFERENCES public.categories(id),",
  "  wallet_id uuid REFERENCES public.wallets(id),",
  "  card_id uuid REFERENCES public.cards(id),",
  "  is_active boolean NOT NULL DEFAULT true,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.transactions (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  description text NOT NULL,",
  "  amount numeric NOT NULL,",
  "  type text NOT NULL DEFAULT 'expense',",
  "  date date NOT NULL DEFAULT CURRENT_DATE,",
  "  due_date date,",
  "  is_paid boolean NOT NULL DEFAULT true,",
  "  category_id uuid REFERENCES public.categories(id),",
  "  wallet_id uuid REFERENCES public.wallets(id),",
  "  card_id uuid REFERENCES public.cards(id),",
  "  recurring_id uuid REFERENCES public.recurring_transactions(id),",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.financial_goals (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  name text NOT NULL,",
  "  target_amount numeric NOT NULL,",
  "  current_amount numeric NOT NULL DEFAULT 0,",
  "  deadline date,",
  "  color text,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.reminders (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  title text NOT NULL,",
  "  description text,",
  "  event_at timestamptz NOT NULL,",
  "  notify_minutes_before integer NOT NULL DEFAULT 30,",
  "  recurrence text NOT NULL DEFAULT 'none',",
  "  is_sent boolean NOT NULL DEFAULT false,",
  "  is_active boolean NOT NULL DEFAULT true,",
  "  created_at timestamptz NOT NULL DEFAULT now(),",
  "  updated_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.chat_messages (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  role text NOT NULL,",
  "  content text NOT NULL,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.family_groups (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  owner_id uuid NOT NULL,",
  "  name text NOT NULL,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.family_memberships (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  family_group_id uuid NOT NULL REFERENCES public.family_groups(id),",
  "  user_id uuid NOT NULL,",
  "  status text NOT NULL DEFAULT 'pending',",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.support_conversations (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  subject text NOT NULL DEFAULT 'Suporte',",
  "  status text NOT NULL DEFAULT 'open',",
  "  created_at timestamptz NOT NULL DEFAULT now(),",
  "  updated_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.support_messages (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id),",
  "  sender_id uuid NOT NULL,",
  "  content text NOT NULL,",
  "  image_url text,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.whatsapp_links (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  verification_code text NOT NULL,",
  "  phone_number text,",
  "  verified boolean NOT NULL DEFAULT false,",
  "  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.whatsapp_pending_transactions (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  user_id uuid NOT NULL,",
  "  phone_number text NOT NULL,",
  "  description text NOT NULL,",
  "  amount numeric NOT NULL,",
  "  type text NOT NULL DEFAULT 'expense',",
  "  category_id uuid,",
  "  category_name text,",
  "  payment_method text,",
  "  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.whatsapp_sessions (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  phone_number text NOT NULL,",
  "  step text NOT NULL,",
  "  context jsonb NOT NULL DEFAULT '{}'::jsonb,",
  "  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "CREATE TABLE public.whatsapp_rate_limits (",
  "  phone_number text PRIMARY KEY,",
  "  message_count integer NOT NULL DEFAULT 1,",
  "  window_start timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
  "-- 3. FUNÇÕES",
  "",
  "CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)",
  "RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$",
  "  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.can_access_family_resource(_resource_user_id uuid, _requesting_user_id uuid)",
  "RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$",
  "  SELECT _resource_user_id = _requesting_user_id",
  "  OR EXISTS (",
  "    SELECT 1 FROM public.family_memberships fm1",
  "    JOIN public.family_memberships fm2 ON fm1.family_group_id = fm2.family_group_id",
  "    WHERE fm1.user_id = _resource_user_id AND fm2.user_id = _requesting_user_id",
  "      AND fm1.status = 'active' AND fm2.status = 'active'",
  "  )",
  "  OR EXISTS (",
  "    SELECT 1 FROM public.family_groups fg",
  "    JOIN public.family_memberships fm ON fg.id = fm.family_group_id",
  "    WHERE fg.owner_id = _requesting_user_id AND fm.user_id = _resource_user_id AND fm.status = 'active'",
  "  )",
  "  OR EXISTS (",
  "    SELECT 1 FROM public.family_groups fg",
  "    JOIN public.family_memberships fm ON fg.id = fm.family_group_id",
  "    WHERE fg.owner_id = _resource_user_id AND fm.user_id = _requesting_user_id AND fm.status = 'active'",
  "  )",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.is_family_member(_user_id uuid, _group_id uuid)",
  "RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$",
  "  SELECT EXISTS (",
  "    SELECT 1 FROM public.family_memberships",
  "    WHERE user_id = _user_id AND family_group_id = _group_id AND status = 'active'",
  "  );",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.is_family_owner(_user_id uuid, _group_id uuid)",
  "RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$",
  "  SELECT EXISTS (",
  "    SELECT 1 FROM public.family_groups WHERE id = _group_id AND owner_id = _user_id",
  "  );",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.check_whatsapp_rate_limit(_phone text, _max_messages integer DEFAULT 30, _window_minutes integer DEFAULT 60)",
  "RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$",
  "DECLARE _count INT; _start TIMESTAMPTZ;",
  "BEGIN",
  "  SELECT message_count, window_start INTO _count, _start",
  "  FROM whatsapp_rate_limits WHERE phone_number = _phone FOR UPDATE;",
  "  IF NOT FOUND THEN",
  "    INSERT INTO whatsapp_rate_limits (phone_number, message_count, window_start) VALUES (_phone, 1, now());",
  "    RETURN TRUE;",
  "  END IF;",
  "  IF _start < now() - (_window_minutes || ' minutes')::INTERVAL THEN",
  "    UPDATE whatsapp_rate_limits SET message_count = 1, window_start = now() WHERE phone_number = _phone;",
  "    RETURN TRUE;",
  "  END IF;",
  "  IF _count >= _max_messages THEN RETURN FALSE; END IF;",
  "  UPDATE whatsapp_rate_limits SET message_count = _count + 1 WHERE phone_number = _phone;",
  "  RETURN TRUE;",
  "END;",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.update_updated_at()",
  "RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$",
  "BEGIN NEW.updated_at = now(); RETURN NEW; END;",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.handle_new_user()",
  "RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$",
  "BEGIN",
  "  INSERT INTO public.profiles (id, display_name)",
  "  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));",
  "  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');",
  "  RETURN NEW;",
  "END;",
  "$$;",
  "",
  "CREATE OR REPLACE FUNCTION public.seed_default_categories()",
  "RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$",
  "BEGIN",
  "  INSERT INTO public.categories (user_id, name, icon, color) VALUES",
  "    (NEW.id, 'Alimentação', 'utensils', '#ef4444'),",
  "    (NEW.id, 'Transporte', 'car', '#f97316'),",
  "    (NEW.id, 'Moradia', 'home', '#8b5cf6'),",
  "    (NEW.id, 'Saúde', 'heart', '#ec4899'),",
  "    (NEW.id, 'Educação', 'book', '#3b82f6'),",
  "    (NEW.id, 'Lazer', 'gamepad', '#10b981'),",
  "    (NEW.id, 'Vestuário', 'shirt', '#f59e0b'),",
  "    (NEW.id, 'Outros', 'more-horizontal', '#6b7280');",
  "  RETURN NEW;",
  "END;",
  "$$;",
  "",
  "-- 4. TRIGGERS",
  "",
  "CREATE TRIGGER on_auth_user_created",
  "  AFTER INSERT ON auth.users",
  "  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
  "",
  "CREATE TRIGGER on_profile_created_seed_categories",
  "  AFTER INSERT ON public.profiles",
  "  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();",
  "",
  "CREATE TRIGGER update_profiles_updated_at",
  "  BEFORE UPDATE ON public.profiles",
  "  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();",
  "",
  "CREATE TRIGGER update_reminders_updated_at",
  "  BEFORE UPDATE ON public.reminders",
  "  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();",
  "",
  "CREATE TRIGGER update_support_conversations_updated_at",
  "  BEFORE UPDATE ON public.support_conversations",
  "  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();",
  "",
  "-- 5. RLS",
  "",
  "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.family_memberships ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.whatsapp_pending_transactions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;",
  "ALTER TABLE public.whatsapp_rate_limits ENABLE ROW LEVEL SECURITY;",
  "",
  "-- 6. RLS POLICIES",
  "",
  "-- profiles",
  "CREATE POLICY \"Users can view own profile\" ON public.profiles FOR SELECT USING (auth.uid() = id);",
  "CREATE POLICY \"Users can update own profile\" ON public.profiles FOR UPDATE USING (auth.uid() = id);",
  "CREATE POLICY \"Users can insert own profile\" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);",
  "CREATE POLICY \"Admins can view all profiles\" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'));",
  "",
  "-- user_roles",
  "CREATE POLICY \"Users can view own roles\" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);",
  "CREATE POLICY \"Admins can manage roles\" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));",
  "",
  "-- wallets",
  "CREATE POLICY \"Users can manage own wallets\" ON public.wallets FOR ALL USING (auth.uid() = user_id);",
  "CREATE POLICY \"Family can view wallets\" ON public.wallets FOR SELECT USING (can_access_family_resource(user_id, auth.uid()));",
  "",
  "-- categories",
  "CREATE POLICY \"Users can manage own categories\" ON public.categories FOR ALL USING (auth.uid() = user_id);",
  "CREATE POLICY \"Family can view categories\" ON public.categories FOR SELECT USING (can_access_family_resource(user_id, auth.uid()));",
  "",
  "-- cards",
  "CREATE POLICY \"Users can manage own cards\" ON public.cards FOR ALL USING (auth.uid() = user_id);",
  "CREATE POLICY \"Family can view cards\" ON public.cards FOR SELECT USING (can_access_family_resource(user_id, auth.uid()));",
  "",
  "-- transactions",
  "CREATE POLICY \"Users can manage own transactions\" ON public.transactions FOR ALL USING (auth.uid() = user_id);",
  "CREATE POLICY \"Family can view transactions\" ON public.transactions FOR SELECT USING (can_access_family_resource(user_id, auth.uid()));",
  "",
  "-- recurring_transactions",
  "CREATE POLICY \"Users can manage own recurring transactions\" ON public.recurring_transactions FOR ALL USING (auth.uid() = user_id);",
  "",
  "-- financial_goals",
  "CREATE POLICY \"Users can manage own goals\" ON public.financial_goals FOR ALL USING (auth.uid() = user_id);",
  "CREATE POLICY \"Family can view goals\" ON public.financial_goals FOR SELECT USING (can_access_family_resource(user_id, auth.uid()));",
  "",
  "-- reminders",
  "CREATE POLICY \"Users can manage own reminders\" ON public.reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);",
  "",
  "-- chat_messages",
  "CREATE POLICY \"Users can manage own chat\" ON public.chat_messages FOR ALL USING (auth.uid() = user_id);",
  "",
  "-- family_groups",
  "CREATE POLICY \"Owners can manage own groups\" ON public.family_groups FOR ALL USING (auth.uid() = owner_id);",
  "CREATE POLICY \"Members can view groups they belong to\" ON public.family_groups FOR SELECT USING (is_family_member(auth.uid(), id));",
  "",
  "-- family_memberships",
  "CREATE POLICY \"Users can view own membership\" ON public.family_memberships FOR SELECT USING (auth.uid() = user_id);",
  "CREATE POLICY \"Users can insert own membership\" ON public.family_memberships FOR INSERT WITH CHECK (auth.uid() = user_id);",
  "CREATE POLICY \"Owners can manage memberships\" ON public.family_memberships FOR ALL USING (is_family_owner(auth.uid(), family_group_id));",
  "",
  "-- support_conversations",
  "CREATE POLICY \"Users can view own conversations\" ON public.support_conversations FOR SELECT USING (auth.uid() = user_id);",
  "CREATE POLICY \"Users can create own conversations\" ON public.support_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);",
  "CREATE POLICY \"Admins can view all conversations\" ON public.support_conversations FOR SELECT USING (has_role(auth.uid(), 'admin'));",
  "CREATE POLICY \"Admins can update conversations\" ON public.support_conversations FOR UPDATE USING (has_role(auth.uid(), 'admin'));",
  "",
  "-- support_messages",
  "CREATE POLICY \"Users can view own conversation messages\" ON public.support_messages FOR SELECT",
  "  USING (EXISTS (SELECT 1 FROM support_conversations WHERE id = support_messages.conversation_id AND user_id = auth.uid()));",
  "CREATE POLICY \"Users can send messages in own conversations\" ON public.support_messages FOR INSERT",
  "  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM support_conversations WHERE id = support_messages.conversation_id AND user_id = auth.uid()));",
  "CREATE POLICY \"Admins can view all messages\" ON public.support_messages FOR SELECT USING (has_role(auth.uid(), 'admin'));",
  "CREATE POLICY \"Admins can send messages\" ON public.support_messages FOR INSERT WITH CHECK (auth.uid() = sender_id AND has_role(auth.uid(), 'admin'));",
  "",
  "-- whatsapp_links",
  "CREATE POLICY \"Users can view own whatsapp link\" ON public.whatsapp_links FOR SELECT USING (auth.uid() = user_id);",
  "CREATE POLICY \"Users can insert own whatsapp link\" ON public.whatsapp_links FOR INSERT WITH CHECK (auth.uid() = user_id);",
  "CREATE POLICY \"Users can update own whatsapp link\" ON public.whatsapp_links FOR UPDATE USING (auth.uid() = user_id);",
  "CREATE POLICY \"Users can delete own whatsapp link\" ON public.whatsapp_links FOR DELETE USING (auth.uid() = user_id);",
  "CREATE POLICY \"Admins can view all whatsapp_links\" ON public.whatsapp_links FOR SELECT USING (has_role(auth.uid(), 'admin'));",
  "",
  "-- whatsapp_pending_transactions",
  "CREATE POLICY \"Service role can manage pending transactions\" ON public.whatsapp_pending_transactions FOR ALL USING (true) WITH CHECK (true);",
  "",
  "-- whatsapp_sessions",
  "CREATE POLICY \"Service role can manage sessions\" ON public.whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);",
  "",
  "-- 7. STORAGE",
  "INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true)",
  "ON CONFLICT (id) DO NOTHING;",
].join("\n");

function downloadCsv(csv: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminExport() {
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopySQL = async () => {
    await navigator.clipboard.writeText(FULL_SCHEMA_SQL);
    setCopied(true);
    toast.success("SQL copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (item: ExportItem) => {
    const key = item.label;
    setLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke("admin-export-data", {
        body: item.payload,
      });
      if (error) throw error;
      const csv = typeof data === "string" ? data : await (data as Blob).text?.() || JSON.stringify(data);
      if (!csv || csv.trim().length === 0) {
        toast.info("Nenhum dado encontrado para exportar.");
        return;
      }
      const filename = (item.payload.table || item.payload.type || "export").replace(/[^a-z0-9_-]/gi, "_");
      downloadCsv(csv, filename + "_" + new Date().toISOString().slice(0, 10));
      toast.success(item.label + " exportado com sucesso!");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao exportar");
    } finally {
      setLoading(null);
    }
  };

  const handleExportAll = async () => {
    setLoading("ALL");
    for (const item of EXPORTS) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-export-data", { body: item.payload });
        if (error) continue;
        const csv = typeof data === "string" ? data : await (data as Blob).text?.() || "";
        if (csv && csv.trim().length > 0) {
          const filename = (item.payload.table || item.payload.type || "export").replace(/[^a-z0-9_-]/gi, "_");
          downloadCsv(csv, filename + "_" + new Date().toISOString().slice(0, 10));
        }
      } catch {
        // continue
      }
    }
    toast.success("Exportação completa!");
    setLoading(null);
  };

  const groups = [...new Set(EXPORTS.map((e) => e.group))];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exportar Dados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exporte dados em CSV ou copie o SQL para migrar tabelas
          </p>
        </div>
        <Button onClick={handleExportAll} disabled={!!loading} className="gap-2">
          {loading === "ALL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Tudo
        </Button>
      </div>

      <Tabs defaultValue="csv" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="csv" className="gap-2"><Download className="h-4 w-4" /> Exportar CSV</TabsTrigger>
          <TabsTrigger value="sql" className="gap-2"><Code className="h-4 w-4" /> SQL das Tabelas</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-4 mt-4">
          {groups.map((group) => (
            <Card key={group}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{group}</CardTitle>
                <CardDescription>
                  {group === "Database" && "Tabelas do banco de dados"}
                  {group === "WhatsApp" && "Dados de integração WhatsApp"}
                  {group === "Usuários" && "Dados de autenticação"}
                  {group === "Storage" && "Arquivos e buckets de armazenamento"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {EXPORTS.filter((e) => e.group === group).map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="text-muted-foreground">{item.icon}</div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleExport(item)} disabled={!!loading} className="gap-1.5 shrink-0">
                        {loading === item.label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        CSV
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sql" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Schema SQL Completo</CardTitle>
                  <CardDescription>
                    Copie e cole no SQL Editor do novo Supabase para recriar todas as tabelas, funções, triggers e RLS
                  </CardDescription>
                </div>
                <Button onClick={handleCopySQL} variant="outline" className="gap-2 shrink-0">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado!" : "Copiar SQL"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted/50 border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
                {FULL_SCHEMA_SQL}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

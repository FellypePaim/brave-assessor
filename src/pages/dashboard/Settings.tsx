import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import WhatsAppLinkCard from "@/components/WhatsAppLinkCard";
import {
  User, Camera, MessageSquare, Crown, HeadphonesIcon,
  Bell, Mail, Sparkles,
  FileText, Sun, Moon, CheckCircle2, Zap, Star, Lock,
} from "lucide-react";

const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

const PLANS = [
  {
    key: "mensal",
    name: "Nox Mensal",
    price: "R$ 19,90",
    period: "/mês",
    description: "Ideal para começar",
    icon: Zap,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    features: [
      { label: "WhatsApp conectado", included: true },
      { label: "Cartões de crédito", included: true },
      { label: "Orçamentos por categoria", included: true },
      { label: "Relatórios detalhados", included: true },
      { label: "Previsões com IA", included: true },
      { label: "Modo Família (5 pessoas)", included: false },
      { label: "Análise comportamental", included: false },
    ],
  },
  {
    key: "anual",
    name: "Nox Anual",
    price: "R$ 14,90",
    period: "/mês · 12x",
    description: "Melhor custo-benefício",
    icon: Star,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "Mais Popular",
    features: [
      { label: "WhatsApp conectado", included: true },
      { label: "Cartões de crédito", included: true },
      { label: "Orçamentos por categoria", included: true },
      { label: "Relatórios detalhados", included: true },
      { label: "Previsões com IA", included: true },
      { label: "Modo Família (5 pessoas)", included: true },
      { label: "Análise comportamental", included: true },
    ],
  },
];

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);
  const [notifyMorning, setNotifyMorning] = useState(true);
  const [notifyNight, setNotifyNight] = useState(true);
  const [notifyMonthlyReport, setNotifyMonthlyReport] = useState(true);
  const [notifyEmailUpdates, setNotifyEmailUpdates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || "");

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name || "");
        setMonthlyIncome(data.monthly_income?.toString() || "");
        setAvatarUrl(data.avatar_url);
        setPlan(data.subscription_plan || "free");
        setSubscriptionExpiresAt((data as any).subscription_expires_at ?? null);
        setNotifyMorning(data.notify_morning ?? true);
        setNotifyNight(data.notify_night ?? true);
        setNotifyMonthlyReport(data.notify_monthly_report ?? true);
        setNotifyEmailUpdates(data.notify_email_updates ?? true);
      }
    };
    fetchProfile();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    // Ensure bucket exists - upload directly
    const { error: uploadErr } = await supabase.storage
      .from("support-attachments")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast({ title: "Erro", description: uploadErr.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("support-attachments").getPublicUrl(path);
    const url = urlData.publicUrl;

    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url);
    setUploadingAvatar(false);
    toast({ title: "Foto atualizada!" });
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    // Update profile table
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      monthly_income: parseFloat(monthlyIncome) || 0,
    }).eq("id", user.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Sync display_name to auth user metadata so greeting updates everywhere
    const { error: metaError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });

    if (metaError) {
      toast({ title: "Perfil salvo, mas falha ao sincronizar nome", description: metaError.message, variant: "destructive" });
    } else {
      toast({ title: "Alterações salvas!", description: "Seu nome foi atualizado em todo o sistema." });
    }

    setSaving(false);
  };

  const saveNotifications = async (field: string, value: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
  };


  const currentPlan = PLANS.find(p => p.key === plan);
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "U";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e integrações</p>
      </div>

      {/* Top row: Profile + WhatsApp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Perfil</h2>
              <p className="text-xs text-muted-foreground">Suas informações pessoais</p>
            </div>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {uploadingAvatar ? "Enviando..." : "Alterar foto"}
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <Input value={email} disabled className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Renda mensal</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  className="pl-10"
                  type="number"
                />
              </div>
            </div>
            <Button onClick={saveProfile} disabled={saving} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </Card>

        {/* WhatsApp Card */}
        <WhatsAppLinkCard userId={user?.id} />
      </div>

      {/* Plan Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Crown className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Planos e Assinatura</h2>
            <p className="text-xs text-muted-foreground">
              {currentPlan ? `Plano atual: ${currentPlan.name}` : "Escolha o melhor plano para você"}
            </p>
          </div>
          {currentPlan && (
            <Badge className="ml-auto bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
            </Badge>
          )}
        </div>

        {/* Plan comparison grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {PLANS.map((p) => {
            const isActive = plan === p.key;
            const PlanIcon = p.icon;
            return (
              <div
                key={p.key}
                className={`relative rounded-xl border-2 p-5 transition-all ${
                  isActive
                    ? `${p.border} bg-gradient-to-b from-background to-${p.bg.replace("bg-", "")}`
                    : "border-border bg-muted/30"
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold bg-amber-500 text-white px-3 py-0.5 rounded-full">
                    {p.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute top-3 right-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </span>
                )}
                <div className={`h-9 w-9 rounded-xl ${p.bg} flex items-center justify-center mb-3`}>
                  <PlanIcon className={`h-4 w-4 ${p.color}`} />
                </div>
                <p className="font-bold text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-extrabold text-foreground">{p.price}</span>
                  <span className="text-xs text-muted-foreground">{p.period}</span>
                </div>
                <div className="space-y-2">
                  {p.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {f.included ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={f.included ? "text-foreground" : "text-muted-foreground/60 line-through"}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>
                {isActive ? (
                  <div className="mt-4 text-center">
                    <p className="text-xs font-medium text-emerald-600">✓ Plano atual</p>
                    {subscriptionExpiresAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Renova em {new Date(subscriptionExpiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-muted-foreground">Entre em contato para assinar este plano</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
          onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
        >
          <MessageSquare className="h-4 w-4" />
          Assinar ou gerenciar plano via WhatsApp · {NOX_PHONE_DISPLAY}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Fale com nossa equipe para assinar, cancelar ou atualizar seu plano
        </p>
      </Card>

      {/* Help Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center">
            <HeadphonesIcon className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Precisa de Ajuda?</h2>
            <p className="text-xs text-muted-foreground">Nossa equipe está pronta para te ajudar</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard/chat")}>
            <HeadphonesIcon className="h-4 w-4 mr-2" />
            Central de Suporte
          </Button>
          <Button
            className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp · {NOX_PHONE_DISPLAY}
          </Button>
        </div>
      </Card>

      {/* WhatsApp Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Notificações WhatsApp</h2>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Sun className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Mensagem Matinal</p>
                <p className="text-xs text-muted-foreground">Receba um resumo do dia anterior às 8h</p>
              </div>
            </div>
            <Switch
              checked={notifyMorning}
              onCheckedChange={(v) => { setNotifyMorning(v); saveNotifications("notify_morning", v); }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Moon className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Mensagem Noturna</p>
                <p className="text-xs text-muted-foreground">Receba um resumo do dia às 22:00</p>
              </div>
            </div>
            <Switch
              checked={notifyNight}
              onCheckedChange={(v) => { setNotifyNight(v); saveNotifications("notify_night", v); }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Relatório Mensal</p>
                <p className="text-xs text-muted-foreground">Receba um relatório completo no último dia do mês</p>
              </div>
            </div>
            <Switch
              checked={notifyMonthlyReport}
              onCheckedChange={(v) => { setNotifyMonthlyReport(v); saveNotifications("notify_monthly_report", v); }}
            />
          </div>
        </div>
      </Card>

      {/* Email Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Novidades por Email</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Novidades e Atualizações</p>
              <p className="text-xs text-muted-foreground">Receba novidades sobre o Nox e novas funcionalidades</p>
            </div>
          </div>
          <Switch
            checked={notifyEmailUpdates}
            onCheckedChange={(v) => { setNotifyEmailUpdates(v); saveNotifications("notify_email_updates", v); }}
          />
        </div>
      </Card>
    </div>
  );
}

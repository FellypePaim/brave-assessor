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
import {
  User, Camera, MessageSquare, Crown, HeadphonesIcon,
  Bell, Mail, Sparkles, Calendar, CreditCard, Tag,
  FileText, Brain, ExternalLink, Rocket, Sun, Moon, CheckCircle2
} from "lucide-react";

const PLAN_INFO: Record<string, { name: string; price: string; features: string[] }> = {
  free: {
    name: "Gratuito",
    price: "R$ 0",
    features: ["1 carteira", "Categorias básicas", "Relatórios limitados"],
  },
  mensal: {
    name: "Nylo Mensal",
    price: "R$ 39,90",
    features: ["WhatsApp conectado", "1 cartão de crédito", "Orçamentos por categoria", "Relatórios básicos", "Previsões com IA"],
  },
  trimestral: {
    name: "Nylo Trimestral",
    price: "R$ 29,90",
    features: ["Tudo do Mensal", "Modo família (2 pessoas)", "Relatórios avançados", "Metas financeiras", "Suporte prioritário"],
  },
  anual: {
    name: "Nylo Anual",
    price: "R$ 19,90",
    features: ["Tudo do Trimestral", "Modo família (5 pessoas)", "Investimentos", "Análise comportamental", "Assessor IA completo"],
  },
};

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
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      monthly_income: parseFloat(monthlyIncome) || 0,
    }).eq("id", user.id);

    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Alterações salvas!" });
    setSaving(false);
  };

  const saveNotifications = async (field: string, value: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
  };

  const planData = PLAN_INFO[plan] || PLAN_INFO.free;
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
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">WhatsApp</h2>
              <p className="text-xs text-muted-foreground">Registre transações enviando mensagens pelo WhatsApp</p>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 text-center">
            <Rocket className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">Vincular é super fácil!</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Clique no botão abaixo e envie a mensagem que vai aparecer no WhatsApp.
              Pronto! Seu número será vinculado automaticamente.
            </p>
            <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
              <MessageSquare className="h-4 w-4 mr-2" />
              Vincular meu WhatsApp
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Número oficial: (11) 94008-5873</span>
          </div>
        </Card>
      </div>

      {/* Plan Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Meu Plano</h2>
              <p className="text-xs text-muted-foreground">{planData.name}</p>
            </div>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CreditCard className="h-3 w-3" /> Valor
            </p>
            <p className="text-lg font-bold text-foreground mt-1">
              {planData.price}<span className="text-xs font-normal text-muted-foreground">/mês</span>
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Próxima cobrança
            </p>
            <p className="text-lg font-bold text-foreground mt-1">16 mar</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Recursos inclusos</p>
          <div className="space-y-2">
            {planData.features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            Gerenciar Assinatura
          </Button>
          <Button className="bg-primary hover:bg-primary/90">
            <Crown className="h-4 w-4 mr-2" />
            Upgrade para Família
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Gerencie pagamento, cancele ou atualize seu plano pelo portal seguro do Stripe
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
        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard/chat")}>
          <HeadphonesIcon className="h-4 w-4 mr-2" />
          Abrir Central de Suporte
        </Button>
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
                <p className="text-xs text-muted-foreground">Receba um resumo do dia à meia-noite</p>
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
              <p className="text-xs text-muted-foreground">Receba novidades sobre o Nylo e novas funcionalidades</p>
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

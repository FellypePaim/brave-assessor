import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Crown, Zap, Star, CheckCircle2, Lock, MessageSquare, Clock, LogOut } from "lucide-react";

const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

const PLANS = [
  {
    key: "teste",
    name: "Plano Teste",
    price: "Grátis",
    period: "10 minutos",
    description: "Liberado pelo administrador",
    icon: Clock,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    features: [
      "Acesso completo por 10 minutos",
      "Todas as funcionalidades do Mensal",
      "Apenas via convite do admin",
    ],
  },
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
      "WhatsApp conectado",
      "Cartões de crédito",
      "Orçamentos por categoria",
      "Relatórios detalhados",
      "Previsões com IA",
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
      "Tudo do plano Mensal",
      "Modo Família (5 pessoas)",
      "Análise comportamental",
      "Acesso prioritário a novidades",
    ],
  },
];

export default function PlanGate() {
  const { user } = useAuth();
  const [planInfo, setPlanInfo] = useState<{ plan: string; name: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchPlan = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at, display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const expired =
          data.subscription_expires_at &&
          new Date(data.subscription_expires_at) < new Date();
        if (data.subscription_plan !== "free" && expired) {
          setPlanInfo({ plan: "expired", name: data.display_name || "usuário" });
        } else {
          setPlanInfo({ plan: data.subscription_plan, name: data.display_name || "usuário" });
        }
      }
    };
    fetchPlan();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isExpired = planInfo?.plan === "expired";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg text-foreground">Nox Assessor</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-3xl">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              {isExpired ? (
                <Lock className="h-8 w-8 text-destructive" />
              ) : (
                <Crown className="h-8 w-8 text-primary" />
              )}
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-2">
              {isExpired
                ? "Seu plano expirou"
                : "Acesso bloqueado"}
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              {isExpired
                ? `Olá${planInfo?.name ? `, ${planInfo.name}` : ""}! Seu plano chegou ao fim. Renove para continuar acessando o Nox Assessor.`
                : `Olá${planInfo?.name ? `, ${planInfo.name}` : ""}! Para acessar o Nox Assessor, escolha um dos planos abaixo e entre em contato com nossa equipe.`}
            </p>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {PLANS.map((p) => {
              const PlanIcon = p.icon;
              return (
                <div
                  key={p.key}
                  className={`relative rounded-2xl border-2 p-5 ${p.border} bg-card`}
                >
                  {p.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-amber-500 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
                      {p.badge}
                    </span>
                  )}
                  <div className={`h-10 w-10 rounded-xl ${p.bg} flex items-center justify-center mb-3`}>
                    <PlanIcon className={`h-5 w-5 ${p.color}`} />
                  </div>
                  <p className="font-bold text-foreground text-base">{p.name}</p>
                  <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-xs text-muted-foreground">{p.period}</span>
                  </div>
                  <div className="space-y-2">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${p.color}`} />
                        <span className="text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                  {p.key === "teste" ? (
                    <div className="mt-4 text-center py-2 rounded-xl bg-muted/50 border border-border">
                      <p className="text-xs text-muted-foreground">Apenas via admin</p>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full mt-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white"
                      onClick={() =>
                        window.open(
                          `https://wa.me/${NOX_PHONE}?text=${encodeURIComponent(`Olá! Quero assinar o ${p.name} (${p.price}${p.period}).`)}`,
                          "_blank"
                        )
                      }
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Quero assinar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA WhatsApp geral */}
          <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Tem dúvidas? Fale diretamente com nossa equipe no WhatsApp.
            </p>
            <Button
              className="gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp · {NOX_PHONE_DISPLAY}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

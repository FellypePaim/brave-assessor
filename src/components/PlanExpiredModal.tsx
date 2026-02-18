import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Crown, Zap, Star, X, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PlanExpiredModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expired, setExpired] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [planName, setPlanName] = useState("");

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!data) return;

      const hasPaidPlan = ["mensal", "anual", "trimestral"].includes(data.subscription_plan);
      const hasExpiry = !!data.subscription_expires_at;
      const isExpired = hasExpiry && new Date(data.subscription_expires_at!) < new Date();

      if (hasPaidPlan && isExpired) {
        setExpired(true);
        const names: Record<string, string> = {
          mensal: "Nox Mensal",
          anual: "Nox Anual",
          trimestral: "Nox Trimestral",
        };
        setPlanName(names[data.subscription_plan] || data.subscription_plan);
      }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  if (!expired || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border bg-card shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Close (dismiss temporarily) */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-center text-foreground mb-1">
          Seu plano expirou
        </h2>
        <p className="text-sm text-center text-muted-foreground mb-6">
          O <span className="font-semibold text-foreground">{planName}</span> chegou ao fim.{" "}
          Renove agora para manter acesso a todos os seus recursos.
        </p>

        {/* What was lost */}
        <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 mb-6 space-y-2">
          <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Acesso perdido
          </p>
          {[
            "Modo Família desativado",
            "Grupos familiares encerrados",
            "Análise comportamental bloqueada",
          ].map((item) => (
            <p key={item} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
              {item}
            </p>
          ))}
        </div>

        {/* Plan options */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-center">
            <Zap className="h-4 w-4 text-blue-500 mx-auto mb-1" />
            <p className="text-xs font-bold text-foreground">Mensal</p>
            <p className="text-lg font-extrabold text-foreground">R$ 19,90</p>
            <p className="text-[10px] text-muted-foreground">/mês</p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-center relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
              MELHOR VALOR
            </span>
            <Star className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xs font-bold text-foreground">Anual</p>
            <p className="text-lg font-extrabold text-foreground">R$ 14,90</p>
            <p className="text-[10px] text-muted-foreground">/mês · 12x</p>
          </div>
        </div>

        <Button
          className="w-full font-semibold"
          onClick={() => {
            setDismissed(true);
            navigate("/dashboard/settings");
          }}
        >
          <Crown className="h-4 w-4 mr-2" />
          Renovar meu plano
        </Button>

        <p className="text-[10px] text-muted-foreground text-center mt-3">
          Você ainda pode usar recursos básicos enquanto não renova.
        </p>
      </div>
    </div>
  );
}

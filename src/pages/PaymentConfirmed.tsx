import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentConfirmed() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [planName, setPlanName] = useState("");

  useEffect(() => {
    if (!user) return;

    // Polling para aguardar o webhook atualizar o perfil (até 30s)
    let attempts = 0;
    const maxAttempts = 15;

    const check = async () => {
      attempts++;
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at")
        .eq("id", user.id)
        .maybeSingle();

      const plan = data?.subscription_plan;
      if (plan && plan !== "free" && data?.subscription_expires_at) {
        const label = plan === "anual" ? "Nox Anual" : "Nox Mensal";
        const value = plan === "anual" ? 178.80 : 19.90;
        setPlanName(label);
        setStatus("success");

        // Meta Pixel — Purchase event
        if (typeof window !== "undefined" && (window as any).fbq) {
          (window as any).fbq("track", "Purchase", {
            value,
            currency: "BRL",
          });
        }
        return;
      }

      if (attempts >= maxAttempts) {
        setStatus("error");
        return;
      }

      setTimeout(check, 2000);
    };

    check();
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">Confirmando pagamento…</h1>
            <p className="text-muted-foreground text-sm">
              Aguarde enquanto processamos sua assinatura. Isso leva apenas alguns segundos.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">Plano ativado! 🎉</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Seu <strong className="text-foreground">{planName}</strong> foi ativado com sucesso. Bem-vindo ao Nox Assessor!
            </p>
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              <Crown className="h-4 w-4 mr-2" />
              Acessar o Dashboard
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 mb-6">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">Quase lá!</h1>
            <p className="text-muted-foreground text-sm mb-6">
              O pagamento foi processado, mas a ativação está demorando mais que o normal. Tente acessar o dashboard — se o plano não aparecer em 5 minutos, entre em contato com o suporte.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/planos")}>
                Ver planos
              </Button>
              <Button className="flex-1" onClick={() => navigate("/dashboard")}>
                Ir ao Dashboard
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

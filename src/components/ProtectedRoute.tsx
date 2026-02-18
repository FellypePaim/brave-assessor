import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type PlanStatus = "loading" | "active" | "blocked";

function usePlanStatus(userId?: string): PlanStatus {
  const [status, setStatus] = useState<PlanStatus>("loading");

  useEffect(() => {
    if (!userId) {
      setStatus("blocked");
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at")
        .eq("id", userId)
        .maybeSingle();

      if (!data) {
        setStatus("blocked");
        return;
      }

      const { subscription_plan, subscription_expires_at } = data;

      // free = always blocked
      if (!subscription_plan || subscription_plan === "free") {
        setStatus("blocked");
        return;
      }

      // if plan has an expiry, check it
      if (subscription_expires_at) {
        const expired = new Date(subscription_expires_at) < new Date();
        setStatus(expired ? "blocked" : "active");
        return;
      }

      // plan set but no expiry = active (edge case)
      setStatus("active");
    };

    check();

    // recheck every 30s (important for "teste" 10min plan)
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [userId]);

  return status;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const planStatus = usePlanStatus(user?.id);

  if (loading || planStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (planStatus === "blocked") return <Navigate to="/planos" replace />;

  return <>{children}</>;
}

/** Rota acessível apenas por usuários logados (sem checar plano) */
export function AuthOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

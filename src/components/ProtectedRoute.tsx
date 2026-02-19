import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type PlanStatus = "loading" | "active" | "blocked";

function usePlanStatus(userId?: string, authLoading?: boolean): PlanStatus {
  const [status, setStatus] = useState<PlanStatus>("loading");

  useEffect(() => {
    // Don't evaluate plan status until auth has resolved
    if (authLoading) {
      setStatus("loading");
      return;
    }

    if (!userId) {
      // Auth resolved but no user — let ProtectedRoute handle redirect to /login
      setStatus("blocked");
      return;
    }

    const check = async () => {
      // Check if admin first — admins always have access
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (roleData) {
        setStatus("active");
        return;
      }

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

      // mensal/anual/trimestral: only block if expiry has passed
      // teste: block as soon as expiry passes (10 min limit)
      if (subscription_expires_at) {
        const expired = new Date(subscription_expires_at) < new Date();
        if (expired) {
          setStatus("blocked");
          return;
        }
      }

      // Active plan with no expiry or valid expiry
      setStatus("active");
    };

    check();

    // Only poll every 30s for "teste" plan (10min limit), otherwise check every 5min
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [userId]);

  return status;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const planStatus = usePlanStatus(user?.id, loading);

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

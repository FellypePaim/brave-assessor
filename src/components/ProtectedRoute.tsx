import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type PlanStatus = "loading" | "active" | "blocked";

function usePlanStatus(userId?: string, authLoading?: boolean): PlanStatus {
  const [status, setStatus] = useState<PlanStatus>("loading");
  const initialCheckDone = useRef(false);

  useEffect(() => {
    // Reset when user changes
    initialCheckDone.current = false;

    // Don't evaluate plan status until auth has resolved
    if (authLoading) {
      setStatus("loading");
      return;
    }

    if (!userId) {
      setStatus("blocked");
      return;
    }

    let isTeste = false;

    const check = async () => {
      try {
        // Check if admin first — admins always have access
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        if (roleData) {
          setStatus("active");
          initialCheckDone.current = true;
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("subscription_plan, subscription_expires_at")
          .eq("id", userId)
          .maybeSingle();

        // If query failed (network/token issue) and user was already active, keep active
        if (error || !data) {
          if (initialCheckDone.current) return; // don't downgrade on transient errors
          setStatus("blocked");
          return;
        }

        const { subscription_plan, subscription_expires_at } = data;
        isTeste = subscription_plan === "teste";

        if (!subscription_plan || subscription_plan === "free") {
          setStatus("blocked");
          initialCheckDone.current = true;
          return;
        }

        if (subscription_expires_at) {
          const expired = new Date(subscription_expires_at) < new Date();
          if (expired) {
            setStatus("blocked");
            initialCheckDone.current = true;
            return;
          }
        }

        setStatus("active");
        initialCheckDone.current = true;
      } catch {
        // Network error — keep current status if already checked
        if (!initialCheckDone.current) setStatus("blocked");
      }
    };

    check();

    // Only poll for "teste" plan (10min limit), otherwise no need
    const interval = setInterval(() => {
      if (isTeste) check();
    }, 30_000);
    return () => clearInterval(interval);
  }, [userId, authLoading]);

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

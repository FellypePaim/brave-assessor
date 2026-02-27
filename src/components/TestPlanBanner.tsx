import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Clock } from "lucide-react";

export default function TestPlanBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let interval: ReturnType<typeof setInterval>;

    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.subscription_plan === "teste" && data.subscription_expires_at) {
        const update = () => {
          const diff = new Date(data.subscription_expires_at!).getTime() - Date.now();
          const val = Math.max(0, diff);
          setRemaining(val);
          if (val <= 0) {
            clearInterval(interval);
            navigate("/planos");
          }
        };
        update();
        interval = setInterval(update, 1000);
      }
    };
    fetch();
    return () => clearInterval(interval);
  }, [user]);

  if (remaining === null || remaining <= 0) return null;

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="bg-primary text-primary-foreground text-center text-sm py-1.5 px-4 flex items-center justify-center gap-2 shrink-0">
      <Clock className="h-3.5 w-3.5" />
      <span className="font-medium">
        Plano Teste · {mins}:{secs.toString().padStart(2, "0")} restantes
      </span>
    </div>
  );
}

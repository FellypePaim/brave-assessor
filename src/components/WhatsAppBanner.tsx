import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { MessageSquare, X, Mic, ImageIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WhatsAppBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const { data: linked } = useQuery({
    queryKey: ["whatsapp-banner-link", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_links")
        .select("verified")
        .eq("user_id", user!.id)
        .eq("verified", true)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: linkedCount } = useQuery({
    queryKey: ["whatsapp-linked-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("whatsapp_links")
        .select("*", { count: "exact", head: true })
        .eq("verified", true);
      return count || 0;
    },
    staleTime: 60_000,
  });

  if (dismissed || linked?.verified) return null;

  // Format count: 12 → "12", 123 → "100+", etc.
  const formatCount = (n: number) => {
    if (n >= 1000) return `${Math.floor(n / 100) * 100}+`;
    if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
    if (n >= 10) return `${Math.floor(n / 5) * 5}+`;
    return `${n}`;
  };

  return (
    <div className="mx-4 md:mx-6 mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3 relative">
      {/* Icon */}
      <div className="h-9 w-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
        <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Registre gastos pelo WhatsApp
          </p>
          {linkedCount && linkedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium border border-emerald-500/20">
              <Users className="h-2.5 w-2.5" />
              {formatCount(linkedCount)} usuários conectados
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
          Envie texto, áudio ou imagem para o Brave registrar automaticamente
        </p>
        {/* Feature pills */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium">
            <MessageSquare className="h-2.5 w-2.5" /> Texto
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium">
            <Mic className="h-2.5 w-2.5" /> Áudio
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium">
            <ImageIcon className="h-2.5 w-2.5" /> Imagem
          </span>
        </div>
      </div>

      {/* CTA */}
      <Button
        size="sm"
        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs px-3 hidden sm:flex"
        onClick={() => navigate("/dashboard/settings")}
      >
        Conectar Meu WhatsApp
      </Button>
      <button
        onClick={() => navigate("/dashboard/settings")}
        className="sm:hidden shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400"
      >
        Conectar
      </button>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Rocket, Copy, RefreshCw, CheckCircle2, Unlink } from "lucide-react";

// Número oficial do assessor Nox
const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

interface WhatsAppLinkCardProps {
  userId?: string;
}

export default function WhatsAppLinkCard({ userId }: WhatsAppLinkCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<{
    verification_code: string;
    verified: boolean;
    phone_number: string | null;
    expires_at: string;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchLink();

    // Poll every 5s to detect when WhatsApp verifies the code
    const interval = setInterval(fetchLink, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const fetchLink = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("whatsapp_links")
      .select("verification_code, verified, phone_number, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    setLink(data);
  };

  const generateCode = async () => {
    if (!userId) return;
    setLoading(true);

    const code = `BRAVE-${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase.from("whatsapp_links").delete().eq("user_id", userId);
    const { error } = await supabase.from("whatsapp_links").insert({
      user_id: userId,
      verification_code: code,
      expires_at: expiresAt,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    await fetchLink();

    // Open WhatsApp with pre-filled message
    const message = encodeURIComponent(`Quero vincular meu WhatsApp ao assessor, esse é o meu código: ${code}`);
    window.open(`https://wa.me/${NOX_PHONE}?text=${message}`, "_blank");

    toast({ title: "Código gerado!", description: "Abrindo WhatsApp do Nox para vinculação..." });
    setLoading(false);
  };

  const unlinkWhatsApp = async () => {
    if (!userId) return;
    setLoading(true);
    await supabase.from("whatsapp_links").delete().eq("user_id", userId);
    setLink(null);
    setLoading(false);
    toast({ title: "WhatsApp desvinculado" });
  };

  const copyCode = () => {
    if (link?.verification_code) {
      navigator.clipboard.writeText(link.verification_code);
      toast({ title: "Código copiado!" });
    }
  };

  const openWhatsApp = () => {
    if (!link?.verification_code) return;
    const message = encodeURIComponent(`Quero vincular meu WhatsApp ao assessor, esse é o meu código: ${link.verification_code}`);
    window.open(`https://wa.me/${NOX_PHONE}?text=${message}`, "_blank");
  };

  const isExpired = link && !link.verified && new Date(link.expires_at) < new Date();
  const isLinked = link?.verified;
  const hasPendingCode = link && !link.verified && !isExpired;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">WhatsApp</h2>
            <p className="text-xs text-muted-foreground">Registre transações pelo WhatsApp</p>
          </div>
        </div>
        {isLinked && (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Número Vinculado
          </Badge>
        )}
      </div>

      {isLinked ? (
        <div className="space-y-4">
          {/* Success state — green */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Número Vinculado</p>
            </div>
            <p className="text-lg font-mono text-foreground mt-1">
              +{link.phone_number?.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "$1 ($2) $3-$4")}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Envie mensagens como "Gastei 50 com almoço" para registrar transações automaticamente.
            </p>
          </div>
          <Button
            className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
          >
            <MessageSquare className="h-4 w-4" />
            Falar no WhatsApp · {NOX_PHONE_DISPLAY}
          </Button>
          <Button variant="outline" onClick={unlinkWhatsApp} disabled={loading} className="w-full">
            <Unlink className="h-4 w-4 mr-2" />
            Desvincular WhatsApp
          </Button>
        </div>
      ) : hasPendingCode ? (
        <div className="space-y-4">
          <div className="bg-accent/50 border border-border rounded-xl p-6 text-center">
            <p className="text-xs text-muted-foreground mb-2">Envie este código no WhatsApp do Nox:</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl font-mono font-bold text-foreground tracking-widest">
                {link.verification_code}
              </p>
              <Button variant="ghost" size="icon" onClick={copyCode} className="h-8 w-8">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              ⏱️ Expira em 15 minutos
            </p>
            {/* CTA to open WhatsApp */}
            <Button onClick={openWhatsApp} className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white">
              <MessageSquare className="h-4 w-4" />
              Enviar código no WhatsApp · {NOX_PHONE_DISPLAY}
            </Button>
          </div>
          <Button variant="outline" onClick={generateCode} disabled={loading} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Gerar novo código
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-accent/50 border border-border rounded-xl p-6 text-center">
            <Rocket className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">Vincular é super fácil!</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Clique em vincular para gerar o código e ser redirecionado diretamente para o WhatsApp do Nox.
            </p>
            <Button onClick={generateCode} disabled={loading} className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white">
              <MessageSquare className="h-4 w-4" />
              {loading ? "Gerando..." : `Vincular · ${NOX_PHONE_DISPLAY}`}
            </Button>
          </div>
          {isExpired && (
            <p className="text-xs text-destructive text-center">
              Código anterior expirou. Gere um novo código.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

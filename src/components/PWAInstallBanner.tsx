import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "pwa-banner-dismissed";

function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsPWA(standalone);
  }, []);
  return isPWA;
}

export default function PWAInstallBanner() {
  const navigate = useNavigate();
  const isPWA = useIsPWA();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  // Don't show if already PWA or dismissed
  if (isPWA || dismissed) return null;

  return (
    <div className="mx-4 md:mx-6 mt-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-center gap-3 relative">
      {/* Icon */}
      <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <Smartphone className="h-4 w-4 text-primary" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">
          Instale o Brave no seu celular
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
          Acesse mais rápido, funciona offline e sem precisar abrir o navegador
        </p>
      </div>

      {/* CTA */}
      <Button
        size="sm"
        className="shrink-0 rounded-full text-xs px-3 hidden sm:flex gap-1.5"
        onClick={() => navigate("/install")}
      >
        <Download className="h-3.5 w-3.5" />
        Instalar App
      </Button>
      <button
        onClick={() => navigate("/install")}
        className="sm:hidden shrink-0 text-xs font-medium text-primary"
      >
        Instalar
      </button>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

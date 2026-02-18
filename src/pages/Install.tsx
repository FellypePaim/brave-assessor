import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Share,
  PlusSquare,
  MoreVertical,
  Download,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  Chrome,
  Globe,
} from "lucide-react";
import { Link } from "react-router-dom";

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeOut as unknown as [number, number, number, number] },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function StepBadge({ number }: { number: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
      {number}
    </div>
  );
}

function IphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" stroke="currentColor" strokeWidth={1.5}>
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M9 6h6M12 17h.01" strokeLinecap="round" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path d="M6.18 15.64a2.18 2.18 0 0 1-2.18-2.18V9.19a2.18 2.18 0 1 1 4.36 0v4.27a2.18 2.18 0 0 1-2.18 2.18zm11.64 0a2.18 2.18 0 0 1-2.18-2.18V9.19a2.18 2.18 0 1 1 4.36 0v4.27a2.18 2.18 0 0 1-2.18 2.18zM12 2a7 7 0 0 0-6.93 6h13.86A7 7 0 0 0 12 2zm-2 3.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm4 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zM5.07 9v9a2 2 0 0 0 2 2h9.86a2 2 0 0 0 2-2V9H5.07z" />
    </svg>
  );
}

const iphoneSteps = [
  {
    icon: <Globe className="w-5 h-5 text-primary" />,
    title: "Abra no Safari",
    description: "Acesse brave.app no navegador Safari do seu iPhone. O PWA só pode ser instalado pelo Safari no iOS.",
  },
  {
    icon: <Share className="w-5 h-5 text-primary" />,
    title: 'Toque em "Compartilhar"',
    description: 'Toque no ícone de compartilhar (quadrado com seta para cima) na barra inferior do Safari.',
    highlight: "⬆",
  },
  {
    icon: <PlusSquare className="w-5 h-5 text-primary" />,
    title: '"Adicionar à Tela de Início"',
    description: 'Role a lista de opções para baixo e toque em "Adicionar à Tela de Início".',
  },
  {
    icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
    title: "Confirme e pronto!",
    description: 'Toque em "Adicionar" no canto superior direito. O Brave aparecerá na sua tela inicial como um app.',
  },
];

const androidSteps = [
  {
    icon: <Chrome className="w-5 h-5 text-primary" />,
    title: "Abra no Chrome",
    description: "Acesse brave.app no Google Chrome. O Chrome é o navegador recomendado para instalar PWAs no Android.",
  },
  {
    icon: <MoreVertical className="w-5 h-5 text-primary" />,
    title: "Menu do navegador",
    description: 'Toque nos 3 pontinhos (⋮) no canto superior direito do Chrome para abrir o menu de opções.',
    highlight: "⋮",
  },
  {
    icon: <Download className="w-5 h-5 text-primary" />,
    title: '"Adicionar à tela inicial"',
    description: 'Toque em "Adicionar à tela inicial" ou "Instalar aplicativo" quando a opção aparecer.',
  },
  {
    icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
    title: "Instale e pronto!",
    description: 'Confirme tocando em "Adicionar". O Brave será instalado como um app nativo no seu Android.',
  },
];

const benefits = [
  "Funciona offline e carrega mais rápido",
  "Ocupa muito menos espaço que um app nativo",
  "Sem precisar ir à App Store ou Google Play",
  "Receba notificações de gastos e alertas",
  "Experiência de app completa na tela inicial",
];

export default function Install() {
  const [activeTab, setActiveTab] = useState<"iphone" | "android">("iphone");
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    (deferredPrompt as any).prompt();
    const { outcome } = await (deferredPrompt as any).userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const steps = activeTab === "iphone" ? iphoneSteps : androidSteps;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">B</span>
            </div>
            <span className="font-bold text-foreground text-lg">Brave</span>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="sm">Entrar</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Smartphone className="w-10 h-10 text-primary" />
            </div>
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Instale o Brave no seu celular
          </motion.h1>
          <motion.p variants={fadeUp} className="text-muted-foreground text-lg max-w-xl mx-auto">
            Tenha o seu assessor financeiro sempre à mão, como um app nativo — sem precisar da App Store ou Google Play.
          </motion.p>

          {isInstallable && (
            <motion.div variants={fadeUp} className="mt-6">
              <Button size="lg" onClick={handleInstallClick} className="gap-2">
                <Download className="w-5 h-5" />
                Instalar agora (detectado automaticamente)
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Benefits */}
        <motion.div
          className="mb-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {benefits.map((b) => (
              <div key={b} className="flex items-center gap-3 bg-accent/50 rounded-xl px-4 py-3 border border-accent">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-foreground font-medium">{b}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Tab selector */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="flex gap-3 mb-8 bg-muted rounded-2xl p-1.5"
        >
          <button
            onClick={() => setActiveTab("iphone")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
              activeTab === "iphone"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IphoneIcon />
            iPhone (iOS)
          </button>
          <button
            onClick={() => setActiveTab("android")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
              activeTab === "android"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AndroidIcon />
            Android
          </button>
        </motion.div>

        {/* Steps */}
        <motion.div
          key={activeTab}
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="grid gap-4 mb-12"
        >
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Card className="border-border hover:border-primary/30 transition-colors duration-200">
                <CardContent className="p-5 flex items-start gap-4">
                  <StepBadge number={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {step.icon}
                      <h3 className="font-semibold text-foreground">{step.title}</h3>
                      {step.highlight && (
                        <span className="ml-auto text-xl text-muted-foreground font-mono">{step.highlight}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Visual mockup hint */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-card border border-border rounded-2xl p-8 text-center mb-12"
        >
          <div className="flex justify-center mb-4">
            {activeTab === "iphone" ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="w-16 h-28 border-2 border-muted-foreground rounded-2xl relative flex flex-col items-center justify-end pb-2">
                  <div className="absolute top-2 w-8 h-1 bg-muted-foreground rounded-full" />
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center mb-1">
                    <span className="text-primary-foreground font-bold text-xs">B</span>
                  </div>
                  <span className="text-xs">Brave</span>
                </div>
                <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                  <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 bg-muted rounded-xl" />
                    <span>App</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 bg-muted rounded-xl" />
                    <span>App</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 ring-2 ring-primary rounded-xl p-0.5">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-xs">B</span>
                    </div>
                    <span className="text-primary font-medium">Brave</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 opacity-50">
                    <div className="w-8 h-8 bg-muted rounded-xl" />
                    <span>App</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="w-16 h-28 border-2 border-muted-foreground rounded-2xl relative flex flex-col items-center justify-end pb-2">
                  <div className="absolute top-3 w-3 h-3 border border-muted-foreground rounded-full" />
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center mb-1">
                    <span className="text-primary-foreground font-bold text-xs">B</span>
                  </div>
                  <span className="text-xs">Brave</span>
                </div>
                <p className="text-xs max-w-48 leading-relaxed">
                  O ícone do Brave aparece na sua tela inicial do Android como um app instalado.
                </p>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {activeTab === "iphone"
              ? "Após instalar, o Brave aparece na tela inicial igual a qualquer app do iPhone."
              : "Após instalar, o Brave aparece na gaveta de apps e na tela inicial do Android."}
          </p>
        </motion.div>

        {/* CTA bottom */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <p className="text-muted-foreground mb-4">Já tem uma conta? Acesse direto pelo app instalado.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/login">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Entrar na conta
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto">
                Criar conta grátis
              </Button>
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Brave Assessor · Todos os direitos reservados
      </footer>
    </div>
  );
}

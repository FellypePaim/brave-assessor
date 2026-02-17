import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Wallet,
  MessageSquare,
  Target,
  BarChart3,
  Check,
  ArrowRight,
  ChevronRight,
  User,
  DollarSign,
  CreditCard,
  Star,
} from "lucide-react";
import onboarding1 from "@/assets/onboarding-1.png";
import onboarding2 from "@/assets/onboarding-2.png";
import onboarding3 from "@/assets/onboarding-3.png";
import onboarding4 from "@/assets/onboarding-4.png";
import onboarding5 from "@/assets/onboarding-5.png";

// Setup sub-steps for the first screen
const setupSteps = [
  { key: "name", icon: User, label: "Seu nome", points: 10, title: "Como podemos te chamar?", subtitle: "Seu nome aparecerá no app", fieldLabel: "Nome completo", placeholder: "Digite seu nome" },
  { key: "income", icon: DollarSign, label: "Sua renda mensal", points: 15, title: "Qual sua renda mensal?", subtitle: "Isso nos ajuda a criar orçamentos personalizados", fieldLabel: "Renda mensal", placeholder: "Ex: 5000", prefix: "R$" },
  { key: "balance", icon: Wallet, label: "Saldo em conta", points: 15, title: "Qual seu saldo atual?", subtitle: "Vamos criar sua primeira carteira com esse valor", fieldLabel: "Saldo atual", placeholder: "Ex: 1200", prefix: "R$" },
  { key: "card", icon: CreditCard, label: "Primeiro cartão", points: 20, title: "Tem um cartão de crédito?", subtitle: "Opcional — você pode adicionar depois", fieldLabel: "Nome do cartão", placeholder: "Ex: Nubank, Inter..." },
];

const tourSteps = [
  { icon: Wallet, title: "Carteiras e Cartões", description: "Cadastre suas contas bancárias, carteiras digitais e cartões de crédito para controle total.", color: "bg-emerald-500", image: onboarding2 },
  { icon: MessageSquare, title: "Registre pelo Chat IA", description: 'Envie uma mensagem simples como "gastei 45 no mercado" e a IA entende automaticamente.', color: "bg-violet-500", image: onboarding3 },
  { icon: Target, title: "Metas Financeiras", description: "Defina objetivos como viagens, reserva de emergência e acompanhe seu progresso.", color: "bg-orange-500", image: onboarding4 },
  { icon: BarChart3, title: "Relatórios Inteligentes", description: "Visualize para onde vai seu dinheiro com gráficos e insights personalizados.", color: "bg-blue-500", image: onboarding5 },
];

const TOTAL_STEPS = 1 + tourSteps.length; // setup + tour steps
const MAX_POINTS = setupSteps.reduce((s, st) => s + st.points, 0);

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const { user } = useAuth();
  const [mainStep, setMainStep] = useState(0); // 0 = setup, 1..4 = tour
  const [setupIndex, setSetupIndex] = useState(0);
  const [formData, setFormData] = useState({ name: "", income: "", balance: "", card: "" });
  const [completedSetup, setCompletedSetup] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const totalSteps = TOTAL_STEPS;
  const progress = ((mainStep + 1) / totalSteps) * 100;
  const points = Array.from(completedSetup).reduce((s, i) => s + setupSteps[i].points, 0);

  const currentSetup = setupSteps[setupIndex];
  const fieldValue = formData[currentSetup.key as keyof typeof formData];

  const handleSetupNext = () => {
    if (fieldValue.trim()) {
      setCompletedSetup((prev) => new Set(prev).add(setupIndex));
    }
    if (setupIndex < setupSteps.length - 1) {
      setSetupIndex(setupIndex + 1);
    } else {
      // Save all setup data and move to tour
      saveSetupData();
    }
  };

  const saveSetupData = async () => {
    if (!user) return;
    setSaving(true);

    // Save profile data
    const updates: Record<string, unknown> = {};
    if (formData.name.trim()) updates.display_name = formData.name.trim();
    if (formData.income.trim()) updates.monthly_income = parseFloat(formData.income) || 0;

    if (Object.keys(updates).length > 0) {
      await supabase.from("profiles").update(updates).eq("id", user.id);
    }

    // Create wallet if balance provided
    if (formData.balance.trim()) {
      await supabase.from("wallets").insert({
        user_id: user.id,
        name: "Conta Principal",
        type: "checking",
        balance: parseFloat(formData.balance) || 0,
      });
    }

    // Create card if provided
    if (formData.card.trim()) {
      await supabase.from("cards").insert({
        user_id: user.id,
        name: formData.card.trim(),
      });
    }

    setSaving(false);
    setMainStep(1);
  };

  const isLast = mainStep === totalSteps - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
      >
        {/* Progress bar */}
        <div className="px-6 pt-6">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  i < mainStep
                    ? "bg-primary text-primary-foreground"
                    : i === mainStep
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < mainStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-2 min-h-[420px] flex flex-col">
          <AnimatePresence mode="wait">
            {mainStep === 0 ? (
              <motion.div
                key={`setup-${setupIndex}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col flex-1"
              >
                {/* Points */}
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-bold text-foreground">{points}</span>
                  <span className="text-xs text-muted-foreground">/ {MAX_POINTS} pontos</span>
                </div>

                {/* Setup label */}
                <p className="text-center text-xs text-muted-foreground mb-3">
                  🎯 Vamos configurar sua conta!
                </p>

                {/* Sub-step pills */}
                <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
                  {setupSteps.map((ss, i) => {
                    const isDone = completedSetup.has(i);
                    const isActive = i === setupIndex;
                    return (
                      <button
                        key={ss.key}
                        onClick={() => setSetupIndex(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                          isActive
                            ? "bg-primary/10 text-primary ring-2 ring-primary/20"
                            : isDone
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <ss.icon className="h-3.5 w-3.5" />
                        {ss.label}
                        <span className="text-[10px] opacity-70">+{ss.points}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Form card */}
                <div className="bg-muted/30 border border-border rounded-2xl p-6 flex-1 flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <currentSetup.icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground text-center">{currentSetup.title}</h2>
                  <p className="text-xs text-muted-foreground text-center mt-1 mb-5">{currentSetup.subtitle}</p>

                  <div className="w-full max-w-xs">
                    <label className="text-xs font-medium text-muted-foreground">{currentSetup.fieldLabel}</label>
                    {currentSetup.prefix ? (
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currentSetup.prefix}</span>
                        <Input
                          value={fieldValue}
                          onChange={(e) => setFormData({ ...formData, [currentSetup.key]: e.target.value })}
                          placeholder={currentSetup.placeholder}
                          className="pl-10"
                          type="number"
                        />
                      </div>
                    ) : (
                      <Input
                        value={fieldValue}
                        onChange={(e) => setFormData({ ...formData, [currentSetup.key]: e.target.value })}
                        placeholder={currentSetup.placeholder}
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`tour-${mainStep}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center justify-center text-center flex-1"
              >
                {(() => {
                  const ts = tourSteps[mainStep - 1];
                  return (
                    <>
                      <div className={`h-14 w-14 rounded-2xl ${ts.color} text-white flex items-center justify-center mb-4`}>
                        <ts.icon className="h-7 w-7" />
                      </div>
                      <h2 className="text-xl font-bold text-foreground">{ts.title}</h2>
                      <p className="mt-2 text-muted-foreground text-sm leading-relaxed max-w-xs">{ts.description}</p>
                      <div className="mt-4 w-48 h-48 rounded-2xl overflow-hidden bg-muted/30 flex items-center justify-center">
                        <img src={ts.image} alt={ts.title} className="w-full h-full object-contain" />
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 pb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === mainStep ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              if (mainStep === 0 && setupIndex > 0) {
                setSetupIndex(setupIndex - 1);
              } else if (mainStep > 0) {
                setMainStep((c) => c - 1);
                if (mainStep === 1) {
                  setSetupIndex(setupSteps.length - 1);
                }
              } else {
                onComplete();
              }
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {mainStep === 0 && setupIndex === 0 ? "Pular Tour" : "Voltar"}
          </Button>
          <Button
            onClick={() => {
              if (mainStep === 0) {
                handleSetupNext();
              } else if (isLast) {
                onComplete();
              } else {
                setMainStep((c) => c + 1);
              }
            }}
            disabled={saving}
            className="rounded-full px-6 gap-2"
          >
            {saving ? (
              "Salvando..."
            ) : mainStep === 0 ? (
              <>
                Continuar <ArrowRight className="h-4 w-4" />
              </>
            ) : isLast ? (
              <>
                Começar <ChevronRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Próximo <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Wallet,
  MessageSquare,
  Target,
  BarChart3,
  Check,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

const steps = [
  {
    icon: LayoutDashboard,
    title: "Seu Painel Financeiro",
    description:
      "Acompanhe receitas, despesas e saldo em tempo real. Tudo organizado em um único lugar.",
    color: "bg-primary",
  },
  {
    icon: Wallet,
    title: "Carteiras e Cartões",
    description:
      "Cadastre suas contas bancárias, carteiras digitais e cartões de crédito para controle total.",
    color: "bg-emerald-500",
  },
  {
    icon: MessageSquare,
    title: "Registre pelo Chat IA",
    description:
      'Envie uma mensagem simples como "gastei 45 no mercado" e a IA entende automaticamente.',
    color: "bg-violet-500",
  },
  {
    icon: Target,
    title: "Metas Financeiras",
    description:
      "Defina objetivos como viagens, reserva de emergência e acompanhe seu progresso.",
    color: "bg-orange-500",
  },
  {
    icon: BarChart3,
    title: "Relatórios Inteligentes",
    description:
      "Visualize para onde vai seu dinheiro com gráficos e insights personalizados.",
    color: "bg-blue-500",
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const isLast = current === steps.length - 1;
  const progress = ((current + 1) / steps.length) * 100;

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
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  i < current
                    ? "bg-primary text-primary-foreground"
                    : i === current
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < current ? <Check className="h-4 w-4" /> : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 pt-6 pb-2 min-h-[280px] flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center text-center"
            >
              <div
                className={`h-16 w-16 rounded-2xl ${step.color} text-white flex items-center justify-center mb-5`}
              >
                <step.icon className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
              <p className="mt-3 text-muted-foreground text-sm leading-relaxed max-w-xs">
                {step.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          <Button
            variant="ghost"
            onClick={onComplete}
            className="text-muted-foreground hover:text-foreground"
          >
            Pular Tour
          </Button>
          <Button
            onClick={() => {
              if (isLast) {
                onComplete();
              } else {
                setCurrent((c) => c + 1);
              }
            }}
            className="rounded-full px-6 gap-2"
          >
            {isLast ? (
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

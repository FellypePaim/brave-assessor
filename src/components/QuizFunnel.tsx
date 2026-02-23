import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, User, DollarSign, TrendingDown,
  Target, CheckCircle2, MessageSquare, Sparkles, AlertTriangle,
  PiggyBank, CreditCard, Brain, Star, Shield, Users, Sun, Moon,
  Flame, Lock, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import braveLogoImg from "@/assets/brave-logo.png";

/* ─── TYPES ─── */
interface QuizAnswers {
  name: string;
  salary: string;
  biggestPain: string;
  controlLevel: string;
  goal: string;
}

const SALARY_OPTIONS = [
  { label: "Até R$ 2.000", value: "ate-2k", icon: "💰" },
  { label: "R$ 2.000 a R$ 5.000", value: "2k-5k", icon: "💵" },
  { label: "R$ 5.000 a R$ 10.000", value: "5k-10k", icon: "💎" },
  { label: "Acima de R$ 10.000", value: "acima-10k", icon: "🏆" },
];

const PAIN_OPTIONS = [
  { label: "Não sei pra onde meu dinheiro vai", value: "sem-controle", icon: AlertTriangle, color: "text-amber-500" },
  { label: "Gasto mais do que ganho", value: "gasto-demais", icon: TrendingDown, color: "text-destructive" },
  { label: "Não consigo economizar", value: "sem-economia", icon: PiggyBank, color: "text-blue-500" },
  { label: "Contas atrasadas sempre", value: "contas-atrasadas", icon: CreditCard, color: "text-violet-500" },
];

const CONTROL_OPTIONS = [
  { label: "Zero controle, tô no caos", value: "zero", emoji: "😰", desc: "Não sei nem meu saldo" },
  { label: "Tento, mas desisto rápido", value: "tentando", emoji: "😅", desc: "Já tentei planilhas e apps" },
  { label: "Tenho algum controle", value: "algum", emoji: "🤔", desc: "Mas quero melhorar" },
  { label: "Sou organizado, quero otimizar", value: "organizado", emoji: "😎", desc: "Quero ir além" },
];

const GOAL_OPTIONS = [
  { label: "Sair das dívidas", value: "dividas", icon: "🚀" },
  { label: "Montar reserva de emergência", value: "reserva", icon: "🛡️" },
  { label: "Realizar um sonho (viagem, carro…)", value: "sonho", icon: "✨" },
  { label: "Ter paz financeira", value: "paz", icon: "🧘" },
];

/* ─── HOOK MESSAGES between steps ─── */
const HOOKS: Record<number, { emoji: string; text: string; sub: string }> = {
  1: { emoji: "🔥", text: "Ótimo começo!", sub: "Vamos personalizar tudo pra você" },
  2: { emoji: "💡", text: "Sabia que 78% dos brasileiros não sabem pra onde vai o dinheiro?", sub: "Você está no caminho certo" },
  3: { emoji: "📊", text: "Quase lá! Faltam só 2 perguntas", sub: "Sua análise personalizada está sendo preparada" },
  4: { emoji: "🎯", text: "Última pergunta!", sub: "Depois disso, seu plano personalizado estará pronto" },
};

/* ─── ANIMATIONS ─── */
const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: easeOut },
  },
  exit: (dir: number) => ({
    x: dir < 0 ? 80 : -80,
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.3, ease: easeOut },
  }),
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: easeOut },
  }),
};

/* ─── FLOATING PARTICLES ─── */
function FloatingParticles() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary/10"
          style={{
            width: 4 + Math.random() * 8,
            height: 4 + Math.random() * 8,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30 - Math.random() * 40, 0],
            x: [0, (Math.random() - 0.5) * 20, 0],
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 3,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ─── THEME PICKER MODAL ─── */
function ThemePicker({ onChoose }: { onChoose: (theme: "light" | "dark") => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      <FloatingParticles />
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: easeOut }}
        className="relative z-10 text-center px-6 max-w-md"
      >
        {/* Logo with pulse */}
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="inline-block mb-6"
        >
          <div className="relative">
            <img
              src={braveLogoImg}
              alt="Brave"
              className="w-20 h-20 rounded-3xl object-cover shadow-xl shadow-primary/20"
            />
            <motion.div
              className="absolute -inset-2 rounded-[1.75rem] border-2 border-primary/30"
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-3xl md:text-4xl font-extrabold text-foreground"
        >
          Bem-vindo ao <span className="text-primary">Brave</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-3 text-muted-foreground text-lg"
        >
          Antes de começar, como prefere visualizar?
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-8 grid grid-cols-2 gap-4"
        >
          {/* Light */}
          <motion.button
            onClick={() => onChoose("light")}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="group relative flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
          >
            <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <Sun className="h-8 w-8 text-amber-500" />
            </div>
            <span className="font-semibold text-foreground">Modo Claro</span>
            <span className="text-xs text-muted-foreground">Leve e arejado</span>
          </motion.button>

          {/* Dark */}
          <motion.button
            onClick={() => onChoose("dark")}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="group relative flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
          >
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
              <Moon className="h-8 w-8 text-indigo-500" />
            </div>
            <span className="font-semibold text-foreground">Modo Escuro</span>
            <span className="text-xs text-muted-foreground">Confortável à noite</span>
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-xs text-muted-foreground"
        >
          Você pode mudar isso depois nas configurações
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

/* ─── HOOK TOAST (between steps) ─── */
function HookToast({ hook }: { hook: { emoji: string; text: string; sub: string } }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%]"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl shadow-primary/5">
        <motion.span
          className="text-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {hook.emoji}
        </motion.span>
        <div>
          <p className="text-sm font-semibold text-foreground">{hook.text}</p>
          <p className="text-xs text-muted-foreground">{hook.sub}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── PROGRESS BAR ─── */
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <Flame className="h-3 w-3 text-primary" />
          Passo {current + 1} de {total}
        </span>
        <motion.span
          key={pct}
          initial={{ scale: 1.3, color: "hsl(var(--primary))" }}
          animate={{ scale: 1, color: "hsl(var(--muted-foreground))" }}
          transition={{ duration: 0.4 }}
        >
          {Math.round(pct)}%
        </motion.span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: easeOut }}
        />
      </div>
      {/* Streak indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-2 flex items-center justify-center gap-1"
      >
        {Array.from({ length: total }).map((_, i) => (
          <motion.div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i <= current ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/20"
            }`}
            animate={i === current ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.5, repeat: i === current ? Infinity : 0, repeatDelay: 1 }}
          />
        ))}
      </motion.div>
    </div>
  );
}

/* ─── OPTION CARD ─── */
function OptionCard({
  children,
  selected,
  onClick,
  index,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
        selected
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
      }`}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      {children}
    </motion.button>
  );
}

/* ─── RESULT COMPONENT ─── */
function QuizResult({ answers, onOpenAuth }: { answers: QuizAnswers; onOpenAuth: () => void }) {
  const painLabel = PAIN_OPTIONS.find(p => p.value === answers.biggestPain)?.label || "";
  const goalLabel = GOAL_OPTIONS.find(g => g.value === answers.goal)?.label || "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easeOut }}
      className="text-center max-w-lg mx-auto"
    >
      {/* Sparkle icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 0.6, type: "spring" }}
        className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-primary/10 text-primary mb-6"
      >
        <Sparkles className="h-10 w-10" />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-3xl md:text-4xl font-extrabold text-foreground"
      >
        {answers.name}, o Brave foi feito pra você!
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-4 text-muted-foreground text-lg leading-relaxed"
      >
        Você disse que seu maior desafio é <strong className="text-foreground">"{painLabel}"</strong> e
        quer <strong className="text-foreground">"{goalLabel}"</strong>.
        O Brave te ajuda com isso — direto no WhatsApp, em menos de 2 minutos por dia.
      </motion.p>

      {/* Personalized insights */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-8 space-y-3 text-left"
      >
        {[
          { icon: Brain, text: "IA vai analisar seus padrões e dar dicas personalizadas" },
          { icon: MessageSquare, text: "Registre gastos por texto, áudio ou foto no WhatsApp" },
          { icon: Target, text: `Vamos te ajudar a ${goalLabel.toLowerCase()}` },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
          >
            <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <item.icon className="h-4 w-4" />
            </div>
            <span className="text-sm text-foreground">{item.text}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Social proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="mt-6 flex flex-wrap justify-center gap-3"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">+2.000 usuários</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          <span className="font-semibold text-foreground">4.9 estrelas</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">100% seguro</span>
        </div>
      </motion.div>

      {/* CTA with pulsing glow */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="mt-8"
      >
        <motion.div
          animate={{ boxShadow: ["0 0 0 0 hsl(var(--primary) / 0)", "0 0 0 12px hsl(var(--primary) / 0.1)", "0 0 0 0 hsl(var(--primary) / 0)"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="inline-block rounded-full"
        >
          <Button
            size="lg"
            onClick={onOpenAuth}
            className="rounded-full bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 text-base px-8 py-6"
          >
            <span className="flex items-center gap-2">
              <Zap className="h-5 w-5" /> Quero organizar minhas finanças
            </span>
          </Button>
        </motion.div>
        <p className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Lock className="h-3 w-3" /> Teste grátis • Sem cartão • Cancele quando quiser
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ─── MAIN QUIZ ─── */
export default function QuizFunnel({ onOpenAuth }: { onOpenAuth: () => void }) {
  const [showThemePicker, setShowThemePicker] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<QuizAnswers>({
    name: "",
    salary: "",
    biggestPain: "",
    controlLevel: "",
    goal: "",
  });
  const [done, setDone] = useState(false);
  const [showHook, setShowHook] = useState(false);
  const [currentHook, setCurrentHook] = useState<{ emoji: string; text: string; sub: string } | null>(null);

  const TOTAL_STEPS = 5;

  const handleThemeChoice = (theme: "light" | "dark") => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setShowThemePicker(false);
  };

  // Show hook toast when step changes
  useEffect(() => {
    const hook = HOOKS[step];
    if (hook && step > 0) {
      setCurrentHook(hook);
      setShowHook(true);
      const timer = setTimeout(() => setShowHook(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const goNext = useCallback(() => {
    setDirection(1);
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else {
      setDone(true);
    }
  }, [step]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep(s => Math.max(0, s - 1));
  }, []);

  const selectAndAdvance = useCallback((field: keyof QuizAnswers, value: string) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
    setTimeout(() => {
      setDirection(1);
      if (step < TOTAL_STEPS - 1) {
        setStep(s => s + 1);
      } else {
        setDone(true);
      }
    }, 350);
  }, [step]);

  const canAdvance = () => {
    switch (step) {
      case 0: return answers.name.trim().length >= 2;
      case 1: return !!answers.salary;
      case 2: return !!answers.biggestPain;
      case 3: return !!answers.controlLevel;
      case 4: return !!answers.goal;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Theme picker overlay */}
      <AnimatePresence>
        {showThemePicker && <ThemePicker onChoose={handleThemeChoice} />}
      </AnimatePresence>

      {/* Floating particles (only when quiz is active) */}
      {!showThemePicker && <FloatingParticles />}

      {/* Hook toast */}
      <AnimatePresence>
        {showHook && currentHook && <HookToast hook={currentHook} />}
      </AnimatePresence>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <a href="#" className="flex items-center gap-2 font-bold text-lg text-foreground">
            <img src={braveLogoImg} alt="Brave" className="w-7 h-7 rounded-lg object-cover" />
            Brave
          </a>
          <button
            onClick={onOpenAuth}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Já tenho conta
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-20 pb-8 relative z-10">
        {!showThemePicker && (
          <>
            {done ? (
              <QuizResult answers={answers} onOpenAuth={onOpenAuth} />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: easeOut }}
                className="w-full max-w-lg"
              >
                <ProgressBar current={step} total={TOTAL_STEPS} />

                <div className="mt-8 min-h-[420px] relative">
                  <AnimatePresence mode="wait" custom={direction}>
                    {/* Step 0: Name */}
                    {step === 0 && (
                      <motion.div
                        key="step-0"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-6"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-4"
                          >
                            <User className="h-8 w-8" />
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            Vamos começar! 👋
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            Como podemos te chamar?
                          </p>
                        </div>
                        <div className="max-w-sm mx-auto">
                          <Input
                            placeholder="Seu primeiro nome"
                            value={answers.name}
                            onChange={e => setAnswers(prev => ({ ...prev, name: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && canAdvance() && goNext()}
                            className="text-center text-lg h-14 rounded-2xl border-2 focus:border-primary"
                            autoFocus
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Step 1: Salary */}
                    {step === 1 && (
                      <motion.div
                        key="step-1"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-6"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-4"
                          >
                            <DollarSign className="h-8 w-8" />
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            Qual sua faixa de renda, {answers.name}?
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            Isso nos ajuda a personalizar sua experiência
                          </p>
                        </div>
                        <div className="space-y-3">
                          {SALARY_OPTIONS.map((opt, i) => (
                            <OptionCard
                              key={opt.value}
                              selected={answers.salary === opt.value}
                              onClick={() => selectAndAdvance("salary", opt.value)}
                              index={i}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{opt.icon}</span>
                                <span className="font-medium text-foreground">{opt.label}</span>
                                {answers.salary === opt.value && (
                                  <CheckCircle2 className="h-5 w-5 text-primary ml-auto" />
                                )}
                              </div>
                            </OptionCard>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Biggest Pain */}
                    {step === 2 && (
                      <motion.div
                        key="step-2"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-6"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 mb-4"
                          >
                            <AlertTriangle className="h-8 w-8" />
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            Qual seu maior desafio financeiro?
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            Seja sincero(a), sem julgamentos aqui 😉
                          </p>
                        </div>
                        <div className="space-y-3">
                          {PAIN_OPTIONS.map((opt, i) => (
                            <OptionCard
                              key={opt.value}
                              selected={answers.biggestPain === opt.value}
                              onClick={() => selectAndAdvance("biggestPain", opt.value)}
                              index={i}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`flex-shrink-0 h-10 w-10 rounded-xl bg-muted flex items-center justify-center ${opt.color}`}>
                                  <opt.icon className="h-5 w-5" />
                                </div>
                                <span className="font-medium text-foreground">{opt.label}</span>
                                {answers.biggestPain === opt.value && (
                                  <CheckCircle2 className="h-5 w-5 text-primary ml-auto" />
                                )}
                              </div>
                            </OptionCard>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3: Control Level */}
                    {step === 3 && (
                      <motion.div
                        key="step-3"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-6"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-blue-500/10 text-blue-500 mb-4"
                          >
                            <Target className="h-8 w-8" />
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            Como está seu controle financeiro hoje?
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            Não existe resposta certa ou errada
                          </p>
                        </div>
                        <div className="space-y-3">
                          {CONTROL_OPTIONS.map((opt, i) => (
                            <OptionCard
                              key={opt.value}
                              selected={answers.controlLevel === opt.value}
                              onClick={() => selectAndAdvance("controlLevel", opt.value)}
                              index={i}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{opt.emoji}</span>
                                <div>
                                  <span className="font-medium text-foreground block">{opt.label}</span>
                                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                                </div>
                                {answers.controlLevel === opt.value && (
                                  <CheckCircle2 className="h-5 w-5 text-primary ml-auto flex-shrink-0" />
                                )}
                              </div>
                            </OptionCard>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Step 4: Goal */}
                    {step === 4 && (
                      <motion.div
                        key="step-4"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-6"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-4"
                          >
                            <Sparkles className="h-8 w-8" />
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            Qual seu principal objetivo, {answers.name}?
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            Último passo! O que te motivaria mais?
                          </p>
                        </div>
                        <div className="space-y-3">
                          {GOAL_OPTIONS.map((opt, i) => (
                            <OptionCard
                              key={opt.value}
                              selected={answers.goal === opt.value}
                              onClick={() => selectAndAdvance("goal", opt.value)}
                              index={i}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{opt.icon}</span>
                                <span className="font-medium text-foreground">{opt.label}</span>
                                {answers.goal === opt.value && (
                                  <CheckCircle2 className="h-5 w-5 text-primary ml-auto" />
                                )}
                              </div>
                            </OptionCard>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Navigation */}
                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goBack}
                    disabled={step === 0}
                    className="rounded-full text-muted-foreground"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  {step === 0 && (
                    <Button
                      onClick={goNext}
                      disabled={!canAdvance()}
                      className="rounded-full bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200"
                    >
                      Continuar <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!showThemePicker && (
        <footer className="py-4 text-center border-t border-border relative z-10">
          <p className="text-xs text-muted-foreground">
            © 2026 Brave Assessor · Hubflows Tecnologia Ltda
          </p>
        </footer>
      )}
    </div>
  );
}

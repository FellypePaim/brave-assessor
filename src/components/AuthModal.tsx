import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn, UserPlus, Eye, EyeOff, Check, ArrowLeft } from "lucide-react";

type Tab = "login" | "signup";
type SignupStep = "plans" | "form";

const plans = [
  {
    id: "mensal" as const,
    name: "Mensal",
    price: "R$ 19,90",
    period: "/mês",
    features: ["Todas as funcionalidades", "Cancelamento sem burocracia"],
    popular: false,
  },
  {
    id: "anual" as const,
    name: "Anual",
    price: "R$ 14,90",
    period: "/mês",
    features: [
      "Todas as funcionalidades",
      "12x de R$ 14,90",
      "Economia de 25%",
      "Cancelamento sem burocracia",
    ],
    popular: true,
  },
];

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [signupStep, setSignupStep] = useState<SignupStep>("plans");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup fields
  const [displayName, setDisplayName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  const resetState = () => {
    setTab("login");
    setSignupStep("plans");
    setSelectedPlan(null);
    setLoginEmail("");
    setLoginPassword("");
    setSignupEmail("");
    setSignupPassword("");
    setConfirmPassword("");
    setDisplayName("");
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      toast.success("Login realizado com sucesso!");
      handleOpenChange(false);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setSignupLoading(true);
    try {
      await signUp(signupEmail, signupPassword, displayName);
      toast.success("Conta criada com sucesso!");
      handleOpenChange(false);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setSignupLoading(false);
    }
  };

  const switchToSignup = () => {
    setTab("signup");
    setSignupStep("plans");
  };

  const selectPlan = (planId: string) => {
    setSelectedPlan(planId);
    setSignupStep("form");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Tab switcher */}
        <div className="flex border-b border-border">
          <button
            onClick={() => { setTab("login"); setSignupStep("plans"); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "login"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            onClick={switchToSignup}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "signup"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Criar conta
          </button>
        </div>

        <div className="p-6">
          {/* ─── LOGIN ─── */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-center text-xl">Bem-vindo de volta</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="modal-login-email">Email</Label>
                <Input
                  id="modal-login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-login-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="modal-login-password"
                    type={showLoginPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Entrando…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" /> Entrar
                  </span>
                )}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Não tem conta?{" "}
                <button type="button" onClick={switchToSignup} className="text-primary hover:underline font-medium">
                  Criar conta
                </button>
              </p>
            </form>
          )}

          {/* ─── SIGNUP: PLANS ─── */}
          {tab === "signup" && signupStep === "plans" && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-center text-xl">Escolha seu plano</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => selectPlan(plan.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                      plan.popular
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{plan.name}</span>
                          {plan.popular && (
                            <span className="text-[10px] font-bold uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                          <span className="text-sm text-muted-foreground">{plan.period}</span>
                        </div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Já tem conta?{" "}
                <button type="button" onClick={() => setTab("login")} className="text-primary hover:underline font-medium">
                  Entrar
                </button>
              </p>
            </div>
          )}

          {/* ─── SIGNUP: FORM ─── */}
          {tab === "signup" && signupStep === "form" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSignupStep("plans")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <DialogTitle className="text-xl">Criar conta</DialogTitle>
                </div>
                {selectedPlan && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Plano selecionado:{" "}
                    <span className="font-medium text-primary">
                      {plans.find((p) => p.id === selectedPlan)?.name}
                    </span>
                  </p>
                )}
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="modal-signup-name">Nome</Label>
                <Input
                  id="modal-signup-name"
                  type="text"
                  placeholder="Seu nome"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-signup-email">Email</Label>
                <Input
                  id="modal-signup-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-signup-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="modal-signup-password"
                    type={showSignupPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-signup-confirm">Confirmar senha</Label>
                <Input
                  id="modal-signup-confirm"
                  type={showSignupPassword ? "text" : "password"}
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={signupLoading}>
                {signupLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Criando…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Criar conta
                  </span>
                )}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

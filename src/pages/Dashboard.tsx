import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  X, ChevronLeft, ChevronRight, Plus, MessageSquare,
  TrendingDown, TrendingUp, Clock, DollarSign, FileText, Smile
} from "lucide-react";

type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hoje",
  week: "Essa semana",
  month: "Esse mês",
};

export default function Dashboard() {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.display_name || "Usuário";
  const [showWelcome, setShowWelcome] = useState(true);
  const [period, setPeriod] = useState<Period>("month");

  // Current month/year
  const now = new Date();
  const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const getDateRange = () => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${fmt(start)} até ${fmt(end)}`;
  };

  const summaryCards = [
    {
      label: "Valores Pagos",
      value: "R$ 0,00",
      subtitle: "Período selecionado",
      icon: TrendingDown,
      iconBg: "bg-destructive",
      iconColor: "text-destructive-foreground",
      borderColor: "border-destructive/30",
    },
    {
      label: "Valores Recebidos",
      value: "R$ 0,00",
      subtitle: "Período selecionado",
      icon: TrendingUp,
      iconBg: "bg-emerald-500",
      iconColor: "text-white",
      borderColor: "border-emerald-500/30",
    },
    {
      label: "Total a Pagar",
      value: "R$ 0,00",
      subtitle: "Pendentes",
      icon: Clock,
      iconBg: "bg-orange-500",
      iconColor: "text-white",
      borderColor: "border-orange-500/30",
    },
    {
      label: "Total a Receber",
      value: "R$ 0,00",
      subtitle: "Pendentes",
      icon: DollarSign,
      iconBg: "bg-blue-500",
      iconColor: "text-white",
      borderColor: "border-blue-500/30",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Welcome Banner */}
      {showWelcome && (
        <Card className="border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-800/40 relative overflow-hidden">
          <button
            onClick={() => setShowWelcome(false)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">👋</span>
              <div>
                <h3 className="font-semibold text-foreground">Bem-vindo ao Nylo!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Veja como aproveitar ao máximo seu assessor financeiro
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-emerald-100/60 dark:bg-emerald-900/20 p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Conecte seu WhatsApp</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Registre gastos enviando mensagens como "gastei 50 no mercado" direto pelo WhatsApp
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-3 rounded-full border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Conectar nas Configurações
              </Button>
            </div>

            {/* Dots + Next */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex gap-1.5">
                <div className="h-1.5 w-6 rounded-full bg-primary" />
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              </div>
              <Button size="sm" className="rounded-full">
                Próximo <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Greeting + New Transaction */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Olá, {displayName}! 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aqui está seu resumo financeiro de hoje
          </p>
        </div>
        <Button className="rounded-full gap-2">
          <Plus className="h-4 w-4" /> Nova Transação
        </Button>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <p className="font-semibold text-foreground">{monthCapitalized}</p>
              <div className="flex items-center gap-2 mt-2 justify-center">
                {(["today", "week", "month"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      period === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{getDateRange()}</p>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`border-l-4 ${card.borderColor}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold text-primary mt-1">{card.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{card.subtitle}</p>
              </div>
              <div className={`h-10 w-10 rounded-full ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0`}>
                <card.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Balance + Humor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-l-4 border-emerald-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balanço Previsto</p>
              <p className="text-xl font-bold text-primary">R$ 0,00</p>
              <p className="text-[11px] text-muted-foreground">(Recebido + A Receber) - (Pago + A Pagar)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-end gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Humor</p>
              <p className="text-sm font-semibold text-foreground">Neutro</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Smile className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

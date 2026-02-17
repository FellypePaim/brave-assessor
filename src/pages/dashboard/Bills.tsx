import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus, ChevronLeft, ChevronRight, FileText,
  CheckCircle2, AlertTriangle, CalendarClock, DollarSign,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "today" | "week" | "month";

export default function Bills() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [period, setPeriod] = useState<Period>("month");

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const getDateRange = () => {
    if (period === "today") {
      const d = format(currentDate, "dd/MM/yyyy");
      return d;
    }
    if (period === "week") {
      const s = format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy");
      const e = format(endOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy");
      return `${s} até ${e}`;
    }
    const s = format(startOfMonth(currentDate), "dd/MM/yyyy");
    const e = format(endOfMonth(currentDate), "dd/MM/yyyy");
    return `${s} até ${e}`;
  };

  const summaryCards = [
    { label: "A Pagar", value: "R$ 0,00", icon: FileText, bg: "bg-gradient-to-br from-rose-100 to-red-200", text: "text-rose-600", valueColor: "text-rose-500" },
    { label: "A Receber", value: "R$ 0,00", icon: CheckCircle2, bg: "bg-gradient-to-br from-emerald-100 to-green-200", text: "text-emerald-600", valueColor: "text-emerald-500" },
    { label: "Vencidas", value: "R$ 0,00", icon: AlertTriangle, bg: "bg-gradient-to-br from-amber-100 to-yellow-200", text: "text-amber-600", valueColor: "text-amber-500" },
    { label: "Pagas", value: "R$ 0,00", icon: CheckCircle2, bg: "bg-gradient-to-br from-sky-100 to-blue-200", text: "text-sky-600", valueColor: "text-sky-500" },
    { label: "Próximos 7 dias", value: "0 contas", icon: CalendarClock, bg: "bg-gradient-to-br from-pink-100 to-rose-200", text: "text-pink-600", valueColor: "text-pink-500" },
  ];

  const periodButtons: { label: string; value: Period }[] = [
    { label: "Hoje", value: "today" },
    { label: "Essa semana", value: "week" },
    { label: "Esse mês", value: "month" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Contas</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas contas a pagar e receber</p>
        </div>
        <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
          <Plus className="h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* Period Selector */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9"
            onClick={() => setCurrentDate((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-bold text-foreground text-lg">{monthCapitalized}</p>
            <div className="flex items-center gap-2 mt-2 justify-center">
              {periodButtons.map((p) => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "outline"}
                  size="sm"
                  className={`rounded-full text-xs px-4 h-7 ${
                    period === p.value
                      ? "bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{getDateRange()}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9"
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((item) => (
          <Card key={item.label} className="p-4 flex items-center gap-3">
            <div className={`h-11 w-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
              <item.icon className={`h-5 w-5 ${item.text}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`font-bold text-sm ${item.valueColor}`}>{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Bills List */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="font-bold text-foreground">Contas do Período</h2>
          <p className="text-sm text-muted-foreground">0 contas no período selecionado</p>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="h-8 w-8 text-primary" />
          </div>
          <p className="font-semibold text-foreground">Nenhuma conta neste período</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Adicione suas contas a pagar e receber ou crie uma automação para gerar contas automaticamente.
          </p>
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 mt-5">
            <Plus className="h-4 w-4" />
            Adicionar Conta
          </Button>
        </div>
      </Card>
    </div>
  );
}

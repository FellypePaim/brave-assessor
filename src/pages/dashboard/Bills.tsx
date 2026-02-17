import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, ChevronLeft, ChevronRight, FileText,
  CheckCircle2, AlertTriangle, CalendarClock, DollarSign,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";

type Period = "today" | "week" | "month";

export default function Bills() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [period, setPeriod] = useState<Period>("month");

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const getRange = () => {
    if (period === "today") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { start: d, end: d };
    }
    if (period === "week") {
      return { start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    }
    return { start: format(startOfMonth(currentDate), "yyyy-MM-dd"), end: format(endOfMonth(currentDate), "yyyy-MM-dd") };
  };

  const range = getRange();

  const getDateRangeLabel = () => {
    if (period === "today") return format(currentDate, "dd/MM/yyyy");
    if (period === "week") return `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")} até ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")}`;
    return `${format(startOfMonth(currentDate), "dd/MM/yyyy")} até ${format(endOfMonth(currentDate), "dd/MM/yyyy")}`;
  };

  const { data: transactions = [] } = useQuery({
    queryKey: ["bills-transactions", user?.id, range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const expenses = transactions.filter(t => t.type === "expense");
  const incomes = transactions.filter(t => t.type === "income");
  const totalExpense = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome = incomes.reduce((s, t) => s + Number(t.amount), 0);

  const summaryCards = [
    { label: "Despesas", value: fmt(totalExpense), icon: FileText, bg: "bg-gradient-to-br from-rose-100 to-red-200", text: "text-rose-600", valueColor: "text-rose-500" },
    { label: "Receitas", value: fmt(totalIncome), icon: CheckCircle2, bg: "bg-gradient-to-br from-emerald-100 to-green-200", text: "text-emerald-600", valueColor: "text-emerald-500" },
    { label: "Balanço", value: fmt(totalIncome - totalExpense), icon: DollarSign, bg: "bg-gradient-to-br from-sky-100 to-blue-200", text: "text-sky-600", valueColor: totalIncome - totalExpense >= 0 ? "text-emerald-500" : "text-rose-500" },
    { label: "Transações", value: `${transactions.length}`, icon: CalendarClock, bg: "bg-gradient-to-br from-pink-100 to-rose-200", text: "text-pink-600", valueColor: "text-pink-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Compromissos</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas transações e compromissos financeiros</p>
        </div>
        <AddTransactionDialog />
      </div>

      {/* Period Selector */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9" onClick={() => setCurrentDate((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-bold text-foreground text-lg">{monthCapitalized}</p>
            <div className="flex items-center gap-2 mt-2 justify-center">
              {(["today", "week", "month"] as Period[]).map((p) => (
                <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className={`rounded-full text-xs px-4 h-7 ${period === p ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`} onClick={() => setPeriod(p)}>
                  {p === "today" ? "Hoje" : p === "week" ? "Essa semana" : "Esse mês"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{getDateRangeLabel()}</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9" onClick={() => setCurrentDate((d) => addMonths(d, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Transaction list */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="font-bold text-foreground">Transações do Período</h2>
          <p className="text-sm text-muted-foreground">{transactions.length} transações</p>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Nenhuma transação neste período</p>
            <p className="text-sm mt-1">Adicione transações para acompanhar seus gastos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.date).toLocaleDateString("pt-BR")} • {(t as any).categories?.name || "Sem categoria"}
                  </p>
                </div>
                <p className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                  {t.type === "income" ? "+" : "-"} {fmt(Number(t.amount))}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

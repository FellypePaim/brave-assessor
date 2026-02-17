import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, ChevronLeft, ChevronRight, FileText, CheckCircle2,
  AlertTriangle, CalendarClock, DollarSign, Pencil, Clock,
  Repeat, ChevronDown, ChevronUp, Check, RefreshCw,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek, addDays, isBefore, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Period = "today" | "week" | "month";

export default function Bills() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [period, setPeriod] = useState<Period>("month");
  const [editTx, setEditTx] = useState<any>(null);
  const [automationsOpen, setAutomationsOpen] = useState(false);

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const getRange = () => {
    if (period === "today") { const d = format(currentDate, "yyyy-MM-dd"); return { start: d, end: d }; }
    if (period === "week") return { start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd") };
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

  const { data: recurringTransactions = [] } = useQuery({
    queryKey: ["recurring-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("recurring_transactions")
        .select("*, categories(name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const today = format(new Date(), "yyyy-MM-dd");
  const next7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const computed = useMemo(() => {
    const unpaidExpenses = transactions.filter(t => t.type === "expense" && !t.is_paid);
    const unpaidIncome = transactions.filter(t => t.type === "income" && !t.is_paid);
    const overdue = transactions.filter(t => !t.is_paid && t.due_date && isBefore(parseISO(t.due_date), parseISO(today)));
    const paid = transactions.filter(t => t.is_paid);
    const upcoming = transactions.filter(t => !t.is_paid && t.due_date && t.due_date >= today && t.due_date <= next7);
    const recurring = transactions.filter(t => t.recurring_id);

    const pending = transactions.filter(t => !t.is_paid && (!t.due_date || !isBefore(parseISO(t.due_date), parseISO(today))));

    return {
      toPay: unpaidExpenses.reduce((s, t) => s + Number(t.amount), 0),
      toReceive: unpaidIncome.reduce((s, t) => s + Number(t.amount), 0),
      overdueTotal: overdue.reduce((s, t) => s + Number(t.amount), 0),
      paidTotal: paid.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      upcomingCount: upcoming.length,
      recurring,
      overdue,
      pending,
      paid,
    };
  }, [transactions, today, next7]);

  const summaryCards = [
    { label: "A Pagar", value: fmt(computed.toPay), icon: FileText, bg: "bg-gradient-to-br from-rose-100 to-red-200 dark:from-rose-950/40 dark:to-red-950/30", text: "text-rose-600 dark:text-rose-400", valueColor: "text-rose-500" },
    { label: "A Receber", value: fmt(computed.toReceive), icon: CheckCircle2, bg: "bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-950/40 dark:to-green-950/30", text: "text-emerald-600 dark:text-emerald-400", valueColor: "text-emerald-500" },
    { label: "Vencidas", value: fmt(computed.overdueTotal), icon: AlertTriangle, bg: "bg-gradient-to-br from-amber-100 to-yellow-200 dark:from-amber-950/40 dark:to-yellow-950/30", text: "text-amber-600 dark:text-amber-400", valueColor: "text-amber-500" },
    { label: "Pagas", value: fmt(computed.paidTotal), icon: CheckCircle2, bg: "bg-gradient-to-br from-cyan-100 to-sky-200 dark:from-cyan-950/40 dark:to-sky-950/30", text: "text-cyan-600 dark:text-cyan-400", valueColor: "text-cyan-500" },
    { label: "Próximos 7 dias", value: `${computed.upcomingCount} contas`, icon: CalendarClock, bg: "bg-gradient-to-br from-pink-100 to-rose-200 dark:from-pink-950/40 dark:to-rose-950/30", text: "text-pink-600 dark:text-pink-400", valueColor: "text-primary" },
  ];

  const handleMarkPaid = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    await supabase.from("transactions").update({ is_paid: true }).eq("id", txId);

    // Update wallet balance if linked
    if (tx.wallet_id) {
      const { data: wallet } = await supabase.from("wallets").select("balance").eq("id", tx.wallet_id).single();
      if (wallet) {
        const delta = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
        await supabase.from("wallets").update({ balance: Number(wallet.balance) + delta }).eq("id", tx.wallet_id);
      }
    }

    toast({ title: "Conta marcada como paga!" });
    queryClient.invalidateQueries({ queryKey: ["bills-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
  };

  const handleDeleteRecurring = async (recId: string) => {
    await supabase.from("recurring_transactions").update({ is_active: false }).eq("id", recId);
    toast({ title: "Automação desativada" });
    queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
  };

  const handleGenerateNow = async () => {
    try {
      const { error } = await supabase.functions.invoke("generate-recurring-bills");
      if (error) throw error;
      toast({ title: "Contas geradas com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["bills-transactions"] });
    } catch {
      toast({ title: "Erro ao gerar contas", variant: "destructive" });
    }
  };

  const renderTransactionItem = (t: any, showPayButton = false) => (
    <div
      key={t.id}
      className="flex items-center justify-between py-3 border-b border-border last:border-0 group"
    >
      <div className="flex items-center gap-3" onClick={() => setEditTx(t)}>
        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
          t.is_paid
            ? "bg-emerald-100 dark:bg-emerald-900/30"
            : t.due_date && isBefore(parseISO(t.due_date), parseISO(today))
              ? "bg-destructive/10"
              : "bg-muted"
        }`}>
          {t.is_paid ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : t.due_date && isBefore(parseISO(t.due_date), parseISO(today)) ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="cursor-pointer">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            {t.description}
            {t.recurring_id && <Repeat className="h-3 w-3 text-muted-foreground" />}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.due_date ? format(parseISO(t.due_date), "dd MMM", { locale: ptBR }) : format(parseISO(t.date), "dd MMM", { locale: ptBR })}
            {(t as any).categories?.name ? ` • ${(t as any).categories.name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
          R$ {Number(t.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        {showPayButton && !t.is_paid && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
            onClick={(e) => { e.stopPropagation(); handleMarkPaid(t.id); }}
            title="Marcar como paga"
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Contas</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas contas a pagar e receber</p>
        </div>
        <AddTransactionDialog
          trigger={
            <Button className="rounded-full gap-2 bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Nova Conta
            </Button>
          }
        />
      </div>

      {/* Period selector */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9" onClick={() => setCurrentDate((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-bold text-foreground text-lg">{monthCapitalized}</p>
            <div className="flex items-center gap-2 mt-2 justify-center">
              {(["today", "week", "month"] as Period[]).map((p) => (
                <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className={`rounded-full text-xs px-4 h-7 ${period === p ? "" : "border-border text-muted-foreground hover:text-foreground"}`} onClick={() => setPeriod(p)}>
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

      {/* Summary cards */}
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

      {/* Bills list */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="font-bold text-foreground">Contas do Período</h2>
          <p className="text-sm text-muted-foreground">{transactions.length} contas no período selecionado</p>
          {computed.recurring.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {computed.recurring.length} conta(s) recorrente(s) neste período
            </p>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 dark:from-rose-950/40 dark:to-pink-950/30 flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Nenhuma conta neste período</p>
            <p className="text-sm mt-1">Adicione contas ou ative automações recorrentes.</p>
          </div>
        ) : (
          <div>
            {/* Overdue */}
            {computed.overdue.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-destructive mb-2">Vencidas ({computed.overdue.length})</p>
                {computed.overdue.map(t => renderTransactionItem(t, true))}
              </div>
            )}

            {/* Pending */}
            {computed.pending.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-primary mb-2">Pendentes ({computed.pending.length})</p>
                {computed.pending.map(t => renderTransactionItem(t, true))}
              </div>
            )}

            {/* Paid */}
            {computed.paid.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-emerald-500 mb-2">Pagas ({computed.paid.length})</p>
                {computed.paid.map(t => renderTransactionItem(t, false))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Automations / Recurring */}
      <Collapsible open={automationsOpen} onOpenChange={setAutomationsOpen}>
        <Card className="p-5">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-primary" />
              <div className="text-left">
                <h3 className="font-bold text-foreground">Automações ({recurringTransactions.length})</h3>
                <p className="text-xs text-muted-foreground">Contas que são geradas automaticamente todo mês</p>
              </div>
            </div>
            {automationsOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 space-y-3">
              {recurringTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma automação ativa. Marque "Transação Recorrente" ao criar uma conta.</p>
              ) : (
                <>
                  {recurringTransactions.map((rec: any) => (
                    <div key={rec.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <Repeat className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{rec.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Todo dia {rec.day_of_month} • {rec.categories?.name || "Sem categoria"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          R$ {Number(rec.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteRecurring(rec.id)}
                          title="Desativar"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full mt-2 rounded-full" onClick={handleGenerateNow}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Gerar contas agora
                  </Button>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <EditTransactionDialog transaction={editTx} open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)} />
    </div>
  );
}

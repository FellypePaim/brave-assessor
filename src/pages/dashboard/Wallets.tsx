import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, Plus,
  CalendarDays, ArrowRight, LayoutGrid, ArrowDownUp, Building2,
  Download, Search, Filter, ChevronLeft, ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Tab = "overview" | "transactions" | "accounts";
type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hoje",
  week: "Essa semana",
  month: "Esse mês",
};

export default function Wallets() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["wallet-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dateRange = `${new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("pt-BR")} até ${monthEnd.toLocaleDateString("pt-BR")}`;

  const monthIncome = transactions
    .filter((t) => t.type === "income" && t.date >= monthStart)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const monthExpense = transactions
    .filter((t) => t.type === "expense" && t.date >= monthStart)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: "overview", label: "Visão Geral", icon: LayoutGrid },
    { id: "transactions", label: "Transações", icon: ArrowDownUp },
    { id: "accounts", label: "Contas", icon: Building2 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Carteira</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seu dinheiro, contas e transações em um só lugar
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 rounded-xl border border-border bg-card overflow-hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── VISÃO GERAL ─── */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Total</p>
                  <p className="text-2xl font-bold text-foreground">{fmt(totalBalance)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {wallets.length} {wallets.length === 1 ? "conta" : "contas"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary/[0.03]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receitas do Mês</p>
                  <p className="text-2xl font-bold text-primary">{fmt(monthIncome)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary/[0.03]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Despesas do Mês</p>
                  <p className="text-2xl font-bold text-primary">{fmt(monthExpense)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Minhas Contas</h3>
                </div>
                <button className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  Ver todas <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                {wallets.map((w) => (
                  <div key={w.id} className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 text-white p-4 min-w-[160px] flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{w.name}</p>
                      <p className="text-sm font-bold">{fmt(Number(w.balance))}</p>
                    </div>
                  </div>
                ))}
                <button className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground p-4 min-w-[160px] flex items-center justify-center gap-2 transition-colors">
                  <Plus className="h-4 w-4" /> Nova Conta
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Últimas Transações</h3>
                </div>
                <button className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  Ver todas <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {transactions.length === 0 ? (
                <div className="mt-8 flex flex-col items-center text-center pb-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <CalendarDays className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">Nenhuma transação encontrada</p>
                  <p className="text-xs text-muted-foreground">Comece registrando sua primeira transação</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {transactions.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <p className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"} {fmt(Number(t.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── TRANSAÇÕES ─── */}
      {tab === "transactions" && (
        <>
          {/* Sub-header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">
              Todas as transações (Pix, débito, dinheiro e cartão)
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-full gap-2">
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
              <Button size="sm" className="rounded-full gap-2">
                <Plus className="h-3.5 w-3.5" /> Nova Transação
              </Button>
            </div>
          </div>

          {/* Period selector */}
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
                  <p className="text-xs text-muted-foreground mt-1.5">{dateRange}</p>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10">
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Income / Expense summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receitas</p>
                  <p className="text-xl font-bold text-primary">{fmt(monthIncome)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Despesas</p>
                  <p className="text-xl font-bold text-primary">{fmt(monthExpense)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filters */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar transações..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground min-w-[140px]">
                  <Filter className="h-4 w-4 shrink-0" />
                  <span>Todas</span>
                </div>
                <div className="flex items-center rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground min-w-[140px]">
                  <span>Todos</span>
                </div>
                <div className="flex items-center rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground min-w-[160px]">
                  <span>Todas as contas</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transaction list */}
          <Card>
            <CardContent className="p-5">
              {transactions.length === 0 ? (
                <div className="py-10 flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <CalendarDays className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">Nenhuma transação encontrada</p>
                  <p className="text-xs text-muted-foreground">Comece registrando sua primeira transação</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <p className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                        {t.type === "income" ? "+" : "-"} {fmt(Number(t.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── CONTAS ─── */}
      {tab === "accounts" && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Todas as Contas</h3>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              {wallets.map((w) => (
                <div key={w.id} className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 text-white p-4 min-w-[160px] flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{w.name}</p>
                    <p className="text-sm font-bold">{fmt(Number(w.balance))}</p>
                  </div>
                </div>
              ))}
              <button className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground p-4 min-w-[160px] flex items-center justify-center gap-2 transition-colors">
                <Plus className="h-4 w-4" /> Nova Conta
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

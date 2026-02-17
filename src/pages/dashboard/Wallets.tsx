import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, Plus,
  CalendarDays, ArrowRight, LayoutGrid, ArrowDownUp, Building2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Tab = "overview" | "transactions" | "accounts";

export default function Wallets() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

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
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const monthIncome = transactions
    .filter((t) => t.type === "income" && t.date >= monthStart)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthExpense = transactions
    .filter((t) => t.type === "expense" && t.date >= monthStart)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

      {/* Summary Cards */}
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

      {/* Minhas Contas */}
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
              <div
                key={w.id}
                className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 text-white p-4 min-w-[160px] flex items-center gap-3"
              >
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{w.name}</p>
                  <p className="text-sm font-bold">{fmt(Number(w.balance))}</p>
                </div>
              </div>
            ))}

            {/* Add new */}
            <button className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground p-4 min-w-[160px] flex items-center justify-center gap-2 transition-colors">
              <Plus className="h-4 w-4" /> Nova Conta
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Últimas Transações */}
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
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Nenhuma transação encontrada
              </p>
              <p className="text-xs text-muted-foreground">
                Comece registrando sua primeira transação
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("pt-BR")}
                    </p>
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
    </div>
  );
}

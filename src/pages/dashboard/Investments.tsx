import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, DollarSign, BarChart3, RefreshCw } from "lucide-react";

interface MarketItem {
  label: string;
  value: string;
  change: string | null;
  positive: boolean;
}

export default function Investments() {
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["market-data"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("market-data");
      if (error) throw error;
      return data as { market: MarketItem[]; updatedAt: string };
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // Timer for "seconds ago" display
  useEffect(() => {
    setSecondsAgo(0);
    const interval = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [data?.updatedAt]);

  const marketData = data?.market ?? [];

  const timeLabel = secondsAgo < 5
    ? "agora mesmo"
    : secondsAgo < 60
      ? `há ${secondsAgo}s`
      : `há ${Math.floor(secondsAgo / 60)}min`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Investimentos</h1>
          </div>
          <p className="text-muted-foreground text-sm">Acompanhe seu patrimônio e o mercado em tempo real</p>
        </div>
        <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
          <Plus className="h-4 w-4" />
          Novo Investimento
        </Button>
      </div>

      {/* Market Ticker */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">Mercado Hoje</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{timeLabel}</span>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {marketData.map((item) => (
            <div
              key={item.label}
              className="flex-shrink-0 bg-card border border-border rounded-xl px-4 py-3 min-w-[130px]"
            >
              <p className="text-xs font-semibold text-muted-foreground mb-1">{item.label}</p>
              <p className="font-bold text-foreground text-sm">{item.value}</p>
              {item.change && (
                <p className={`text-xs mt-0.5 ${item.positive ? "text-emerald-500" : "text-rose-500"}`}>
                  {item.positive ? "↗" : "↘"} {item.change}
                </p>
              )}
            </div>
          ))}
          {marketData.length === 0 && !isFetching && (
            <p className="text-sm text-muted-foreground py-4">Dados indisponíveis no momento</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Patrimônio Total</p>
            <p className="font-bold text-foreground text-lg">R$ 0,00</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rendimento Total</p>
            <p className="font-bold text-emerald-500 text-lg">+R$ 0,00</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rentabilidade</p>
            <p className="font-bold text-emerald-500 text-lg">+0.00%</p>
          </div>
        </Card>
      </div>

      {/* Investments List */}
      <Card className="p-6">
        <h2 className="font-bold text-foreground mb-6">Seus Investimentos</h2>
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">Nenhum investimento cadastrado</p>
          <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 mt-4">
            Adicionar primeiro investimento
          </Button>
        </div>
      </Card>
    </div>
  );
}

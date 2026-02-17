import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, DollarSign, BarChart3, RefreshCw } from "lucide-react";

const marketData = [
  { label: "DÓLAR", value: "R$ 5,22", change: "+0.30%", positive: true },
  { label: "EURO", value: "R$ 6,18", change: "-0.18%", positive: false },
  { label: "LIBRA", value: "R$ 7,07", change: "-0.70%", positive: false },
  { label: "BITCOIN", value: "R$ 375.887,98", change: "-0.84%", positive: false },
  { label: "IBOVESPA", value: "186.464 pts", change: "-0.69%", positive: false },
  { label: "IFIX", value: "3.853 pts", change: "+0.51%", positive: true },
  { label: "NASDAQ", value: "22.643 pts", change: "+0.43%", positive: true },
  { label: "DOW JONES", value: "49.617 pts", change: "+0.23%", positive: true },
  { label: "CDI", value: "0.00%", change: null, positive: true },
  { label: "SELIC", value: "0.00%", change: null, positive: true },
];

export default function Investments() {
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
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>em menos de um minuto</span>
            <RefreshCw className="h-3.5 w-3.5" />
          </div>
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

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Calendar, FileText, BarChart3, TrendingUp, ChevronDown,
  PieChart, ArrowUpDown, CreditCard, Target, Scissors, LineChart,
  Filter, Send, FileSpreadsheet,
} from "lucide-react";

type PeriodType = "mensal" | "semanal" | "personalizado" | "comparativo";
type AnalysisType = "categoria" | "fluxo" | "cartoes" | "metas" | "fixas" | "investimentos" | null;

const periodOptions: { value: PeriodType; label: string; desc: string; icon: React.ElementType }[] = [
  { value: "mensal", label: "Mensal", desc: "Relatório do mês", icon: Calendar },
  { value: "semanal", label: "Semanal", desc: "Últimos 7 dias", icon: FileText },
  { value: "personalizado", label: "Personalizado", desc: "Período customizado", icon: BarChart3 },
  { value: "comparativo", label: "Comparativo", desc: "Compare meses", icon: TrendingUp },
];

const analysisOptions: { value: AnalysisType; label: string; desc: string; icon: React.ElementType }[] = [
  { value: "categoria", label: "Por Categoria", desc: "Análise por categoria", icon: PieChart },
  { value: "fluxo", label: "Fluxo de Caixa", desc: "Entradas vs saídas", icon: ArrowUpDown },
  { value: "cartoes", label: "Cartões", desc: "Gastos por cartão", icon: CreditCard },
  { value: "metas", label: "Metas", desc: "Progresso das metas", icon: Target },
  { value: "fixas", label: "Fixas vs Variáveis", desc: "Tipo de despesa", icon: Scissors },
  { value: "investimentos", label: "Investimentos", desc: "Patrimônio e rendimentos", icon: LineChart },
];

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function Reports() {
  const [periodType, setPeriodType] = useState<PeriodType>("mensal");
  const [analysisType, setAnalysisType] = useState<AnalysisType>(null);
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground text-sm">Gere relatórios detalhados das suas finanças</p>
      </div>

      {/* Report Type */}
      <Card className="p-5 space-y-5">
        <h2 className="font-bold text-foreground">Tipo de Relatório</h2>

        {/* By Period */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-3">Por Período</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {periodOptions.map((opt) => {
              const active = periodType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPeriodType(opt.value)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <opt.icon className={`h-5 w-5 mb-2 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <p className={`font-semibold text-sm ${active ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Specific Analysis */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-3">Análises Específicas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {analysisOptions.map((opt) => {
              const active = analysisType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAnalysisType(active ? null : opt.value)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <opt.icon className={`h-5 w-5 mb-2 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <p className={`font-semibold text-xs ${active ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Period Selection */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-foreground" />
          <h2 className="font-bold text-foreground text-sm">Selecione o Período</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Mês</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Ano</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Advanced Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filtros Avançados</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground">Filtros em breve...</p>
          </CollapsibleContent>
        </Collapsible>

        {/* WhatsApp toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Send className="h-4 w-4" />
            <span>Enviar ao WhatsApp após gerar</span>
          </div>
          <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <FileText className="h-4 w-4" />
            Gerar Relatório
          </Button>
          <Button variant="outline" className="rounded-full gap-1.5 border-border text-foreground">
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </Card>
    </div>
  );
}

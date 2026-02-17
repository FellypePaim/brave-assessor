import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Clock, TrendingUp, RefreshCw, Sparkles, Target, Calendar, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Behavior() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastWeekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);

  const { data: transactions = [] } = useQuery({
    queryKey: ["behavior-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", monthStart)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("monthly_income").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("financial_goals").select("*");
      return data || [];
    },
    enabled: !!user,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const expenses = transactions.filter(t => t.type === "expense");
  const totalExpense = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const income = profile?.monthly_income ? Number(profile.monthly_income) : 0;

  // Category breakdown
  const catSpending: Record<string, number> = {};
  expenses.forEach(t => {
    const cat = (t as any).categories?.name || "Sem categoria";
    catSpending[cat] = (catSpending[cat] || 0) + Number(t.amount);
  });
  const catEntries = Object.entries(catSpending).sort((a, b) => b[1] - a[1]);
  const catColors = ["bg-rose-500", "bg-orange-500", "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-slate-500"];

  // Day of week spending
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const daySpending = Array(7).fill(0);
  expenses.forEach(t => {
    const day = new Date(t.date).getDay();
    daySpending[day] += Number(t.amount);
  });
  const maxDay = Math.max(...daySpending, 1);

  // Weekly comparison
  const thisWeekExpenses = expenses.filter(t => t.date >= lastWeekStart).reduce((s, t) => s + Number(t.amount), 0);
  const prevWeekExpenses = expenses.filter(t => t.date >= prevWeekStart && t.date < lastWeekStart).reduce((s, t) => s + Number(t.amount), 0);
  const weeklyChange = prevWeekExpenses > 0 ? ((thisWeekExpenses - prevWeekExpenses) / prevWeekExpenses * 100) : 0;

  // Impulsivity: % of small transactions (<R$20)
  const smallTx = expenses.filter(t => Number(t.amount) < 20).length;
  const impulsivity = expenses.length > 0 ? Math.round((smallTx / expenses.length) * 100) : 0;

  // Peak hour (from created_at)
  const hourCounts: Record<number, number> = {};
  expenses.forEach(t => {
    const h = new Date(t.created_at).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  // Health score
  const controlScore = income > 0 ? Math.max(0, Math.min(100, 100 - (totalExpense / income * 100))) : 50;
  const consistencyScore = expenses.length > 0 ? Math.min(100, expenses.length * 5) : 0;
  const planningScore = goals.length > 0 ? Math.min(100, goals.length * 25) : 0;
  const healthScore = Math.round((controlScore + consistencyScore + planningScore) / 3);

  const getStatus = () => {
    if (healthScore >= 70) return { label: "Saudável", desc: "Finanças sob controle" };
    if (healthScore >= 40) return { label: "Equilibrado", desc: "Bom equilíbrio" };
    return { label: "Atenção", desc: "Revise seus gastos" };
  };
  const status = getStatus();

  // Radar data
  const radarLabels = ["Controle", "Consistência", "Planejamento", "Economia", "Disciplina"];
  const economyScore = income > 0 ? Math.max(0, Math.min(100, ((income - totalExpense) / income) * 100)) : 50;
  const disciplineScore = 100 - impulsivity;
  const radarValues = [controlScore, consistencyScore, planningScore, economyScore, disciplineScore];

  function RadarChart() {
    const size = 200, cx = size / 2, cy = size / 2, r = 70, levels = 5;
    const angleStep = (2 * Math.PI) / radarLabels.length;
    const startAngle = -Math.PI / 2;
    const getPoint = (index: number, value: number) => {
      const angle = startAngle + index * angleStep;
      return { x: cx + r * (value / 100) * Math.cos(angle), y: cy + r * (value / 100) * Math.sin(angle) };
    };
    const gridLines = Array.from({ length: levels }, (_, i) => {
      const lr = (r / levels) * (i + 1);
      return radarLabels.map((_, j) => `${cx + lr * Math.cos(startAngle + j * angleStep)},${cy + lr * Math.sin(startAngle + j * angleStep)}`).join(" ");
    });
    const dataPoints = radarValues.map((v, i) => getPoint(i, v));
    const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(" ");

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto">
        {gridLines.map((points, i) => <polygon key={i} points={points} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.5} />)}
        {radarLabels.map((_, i) => <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(startAngle + i * angleStep)} y2={cy + r * Math.sin(startAngle + i * angleStep)} stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.3} />)}
        <polygon points={dataPolygon} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary))" />)}
        {radarLabels.map((label, i) => {
          const angle = startAngle + i * angleStep;
          return <text key={i} x={cx + (r + 20) * Math.cos(angle)} y={cy + (r + 20) * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize="8">{label}</text>;
        })}
      </svg>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Comportamento</h1>
          </div>
          <p className="text-primary text-sm">Entenda seus padrões financeiros</p>
        </div>
        <div className="border border-border rounded-full px-3 py-1.5 text-sm font-medium text-foreground flex items-center gap-1.5">
          <span>🩺</span> Saúde: {healthScore}%
        </div>
      </div>

      {/* Status Banner */}
      <Card className="p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">{status.label}</p>
            <p className="text-xs text-muted-foreground">{status.desc}</p>
          </div>
        </div>
        <Button size="sm" className="rounded-full bg-primary text-primary-foreground gap-1.5 text-xs" onClick={() => navigate("/dashboard/nylo-ia")}>
          <Sparkles className="h-3.5 w-3.5" /> Nox IA
        </Button>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <p className="font-bold text-foreground text-lg">{impulsivity}%</p>
          <p className="text-xs text-muted-foreground">Impulsividade</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="font-bold text-foreground text-lg">{peakHour ? `${peakHour[0]}h` : "--"}</p>
          <p className="text-xs text-muted-foreground">Horário Pico</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <p className={`font-bold text-foreground text-lg`}>{weeklyChange >= 0 ? "+" : ""}{weeklyChange.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Semanal</p>
        </Card>
      </div>

      {/* Perfil + Categorias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">Perfil Comportamental</h2>
          </div>
          <RadarChart />
          <div className="space-y-2.5 mt-4">
            {radarLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${radarValues[i]}%` }} />
                </div>
                <span className="text-xs font-bold text-foreground w-10 text-right">{Math.round(radarValues[i])}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">Gastos por Categoria</h2>
          </div>
          {catEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Registre transações para ver os dados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {catEntries.map(([cat, total], i) => (
                <div key={cat} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${catColors[i % catColors.length]} shrink-0`} />
                  <span className="text-sm text-foreground flex-1">{cat}</span>
                  <span className="text-sm font-semibold text-foreground">{fmt(total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Gastos por Dia */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-bold text-foreground text-sm">Gastos por Dia da Semana</h2>
            <p className="text-xs text-muted-foreground">Descubra seus dias de maior consumo</p>
          </div>
        </div>
        {expenses.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Registre transações para ver o padrão</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-32 mt-4">
            {dayNames.map((name, i) => (
              <div key={name} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/20 rounded-t-md relative" style={{ height: `${(daySpending[i] / maxDay) * 100}%`, minHeight: daySpending[i] > 0 ? "8px" : "2px" }}>
                  <div className="absolute inset-0 bg-primary rounded-t-md" style={{ opacity: daySpending[i] / maxDay }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{name}</span>
                <span className="text-[10px] font-medium text-foreground">{daySpending[i] > 0 ? fmt(daySpending[i]) : "-"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

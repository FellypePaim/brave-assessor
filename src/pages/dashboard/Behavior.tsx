import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Clock, TrendingUp, TrendingDown, Sparkles, Target, Calendar, Tag, Lightbulb, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CAT_COLORS = ["bg-rose-500", "bg-orange-500", "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-slate-500"];

export default function Behavior() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const now = new Date();
  // Last 3 months of data
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["behavior-all-tx", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name, color)")
        .gte("date", threeMonthsAgo)
        .order("date", { ascending: true });
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

  const expenses = allTransactions.filter(t => t.type === "expense");
  const currentMonthExpenses = expenses.filter(t => t.date >= currentMonthStart);
  const prevMonthExpenses = expenses.filter(t => t.date >= prevMonthStart && t.date <= prevMonthEnd);

  const totalExpense = currentMonthExpenses.reduce((s, t) => s + Number(t.amount), 0);
  const prevTotalExpense = prevMonthExpenses.reduce((s, t) => s + Number(t.amount), 0);
  const income = profile?.monthly_income ? Number(profile.monthly_income) : 0;

  // --- Day of week spending (all data) ---
  const daySpending = useMemo(() => {
    const arr = Array(7).fill(0);
    expenses.forEach(t => {
      const d = new Date(t.date + "T12:00:00").getDay();
      arr[d] += Number(t.amount);
    });
    return arr;
  }, [expenses]);
  const maxDay = Math.max(...daySpending, 1);
  const peakDayIndex = daySpending.indexOf(Math.max(...daySpending));

  // --- Category spending current month ---
  const catSpending = useMemo(() => {
    const map: Record<string, { name: string; total: number; color: string }> = {};
    currentMonthExpenses.forEach(t => {
      const name = (t as any).categories?.name || "Sem categoria";
      const color = (t as any).categories?.color || "#6b7280";
      if (!map[name]) map[name] = { name, total: 0, color };
      map[name].total += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [currentMonthExpenses]);

  // --- Category trending (month over month) ---
  const catTrend = useMemo(() => {
    const curr: Record<string, number> = {};
    const prev: Record<string, number> = {};
    currentMonthExpenses.forEach(t => {
      const n = (t as any).categories?.name || "Sem categoria";
      curr[n] = (curr[n] || 0) + Number(t.amount);
    });
    prevMonthExpenses.forEach(t => {
      const n = (t as any).categories?.name || "Sem categoria";
      prev[n] = (prev[n] || 0) + Number(t.amount);
    });
    return Object.keys(curr).map(name => {
      const change = prev[name] ? ((curr[name] - prev[name]) / prev[name]) * 100 : null;
      return { name, curr: curr[name], prev: prev[name] || 0, change };
    }).filter(c => c.change !== null && Math.abs(c.change) > 5)
      .sort((a, b) => (b.change || 0) - (a.change || 0))
      .slice(0, 5);
  }, [currentMonthExpenses, prevMonthExpenses]);

  // --- Weekly change ---
  const lastWeekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const thisWeekTotal = expenses.filter(t => t.date >= lastWeekStart).reduce((s, t) => s + Number(t.amount), 0);
  const prevWeekTotal = expenses.filter(t => t.date >= prevWeekStart && t.date < lastWeekStart).reduce((s, t) => s + Number(t.amount), 0);
  const weeklyChange = prevWeekTotal > 0 ? ((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100 : 0;

  // --- Impulsivity ---
  const smallTx = currentMonthExpenses.filter(t => Number(t.amount) < 20).length;
  const impulsivity = currentMonthExpenses.length > 0 ? Math.round((smallTx / currentMonthExpenses.length) * 100) : 0;

  // --- Peak hour ---
  const hourCounts: Record<number, number> = {};
  expenses.forEach(t => {
    const h = new Date(t.created_at).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  // --- Health scores ---
  const controlScore = income > 0 ? Math.max(0, Math.min(100, 100 - (totalExpense / income * 100))) : 50;
  const consistencyScore = expenses.length > 0 ? Math.min(100, expenses.length * 5) : 0;
  const planningScore = goals.length > 0 ? Math.min(100, goals.length * 25) : 0;
  const economyScore = income > 0 ? Math.max(0, Math.min(100, ((income - totalExpense) / income) * 100)) : 50;
  const disciplineScore = 100 - impulsivity;
  const healthScore = Math.round((controlScore + consistencyScore + planningScore + economyScore + disciplineScore) / 5);

  const radarLabels = ["Controle", "Consistência", "Planejamento", "Economia", "Disciplina"];
  const radarValues = [controlScore, consistencyScore, planningScore, economyScore, disciplineScore];

  // --- AI-like suggestions ---
  const suggestions = useMemo(() => {
    const list: { icon: React.ElementType; text: string; type: "warn" | "ok" | "tip" }[] = [];

    if (income > 0 && totalExpense > income * 0.9)
      list.push({ icon: AlertCircle, text: `Seus gastos estão em ${((totalExpense / income) * 100).toFixed(0)}% da renda. Considere reduzir despesas variáveis.`, type: "warn" });
    if (impulsivity > 40)
      list.push({ icon: Zap, text: `${impulsivity}% das suas compras são de pequenos valores (< R$ 20). Esses gastos somam mais do que parecem.`, type: "warn" });
    if (catSpending[0])
      list.push({ icon: Tag, text: `Sua maior categoria de gasto é "${catSpending[0].name}" com ${fmt(catSpending[0].total)}. Avalie se há como reduzir.`, type: "tip" });
    const risingCat = catTrend.find(c => (c.change || 0) > 20);
    if (risingCat)
      list.push({ icon: TrendingUp, text: `Gastos com "${risingCat.name}" cresceram ${risingCat.change?.toFixed(0)}% vs mês passado.`, type: "warn" });
    if (weeklyChange < -10)
      list.push({ icon: CheckCircle2, text: `Parabéns! Você gastou ${Math.abs(weeklyChange).toFixed(0)}% menos esta semana comparado à anterior.`, type: "ok" });
    if (goals.length === 0)
      list.push({ icon: Target, text: `Você ainda não tem metas financeiras. Defina objetivos para manter o foco.`, type: "tip" });
    if (peakDayIndex >= 0 && daySpending[peakDayIndex] > 0)
      list.push({ icon: Calendar, text: `Você gasta mais às ${DAY_NAMES[peakDayIndex]}as. Planeje-se antes desse dia da semana.`, type: "tip" });
    if (controlScore > 70)
      list.push({ icon: CheckCircle2, text: `Ótimo controle! Você gastou ${fmt(totalExpense)} de ${fmt(income)} disponíveis este mês.`, type: "ok" });

    return list.slice(0, 5);
  }, [totalExpense, income, impulsivity, catSpending, catTrend, weeklyChange, goals, peakDayIndex, daySpending, controlScore]);

  // Radar SVG
  function RadarChart() {
    const size = 200, cx = size / 2, cy = size / 2, r = 70, levels = 5;
    const angleStep = (2 * Math.PI) / radarLabels.length;
    const startAngle = -Math.PI / 2;
    const gridLines = Array.from({ length: levels }, (_, i) => {
      const lr = (r / levels) * (i + 1);
      return radarLabels.map((_, j) => `${cx + lr * Math.cos(startAngle + j * angleStep)},${cy + lr * Math.sin(startAngle + j * angleStep)}`).join(" ");
    });
    const dataPoints = radarValues.map((v, i) => {
      const angle = startAngle + i * angleStep;
      return { x: cx + r * (v / 100) * Math.cos(angle), y: cy + r * (v / 100) * Math.sin(angle) };
    });
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

  const getStatus = () => {
    if (healthScore >= 70) return { label: "Saudável", desc: "Finanças sob controle", color: "text-emerald-600" };
    if (healthScore >= 40) return { label: "Equilibrado", desc: "Bom equilíbrio", color: "text-amber-600" };
    return { label: "Atenção", desc: "Revise seus gastos", color: "text-destructive" };
  };
  const status = getStatus();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Comportamento</h1>
          </div>
          <p className="text-muted-foreground text-sm">Análise inteligente dos seus padrões financeiros</p>
        </div>
        <div className="border border-border rounded-full px-3 py-1.5 text-sm font-medium text-foreground flex items-center gap-1.5">
          🩺 Saúde: <span className={status.color}>{healthScore}%</span>
        </div>
      </div>

      {/* Status Banner */}
      <Card className="p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className={`font-bold text-sm ${status.color}`}>{status.label}</p>
            <p className="text-xs text-muted-foreground">{status.desc}</p>
          </div>
        </div>
        <Button size="sm" className="rounded-full bg-primary text-primary-foreground gap-1.5 text-xs" onClick={() => navigate("/dashboard/nylo-ia")}>
          <Sparkles className="h-3.5 w-3.5" /> Nox IA
        </Button>
      </Card>

      {/* KPI Row */}
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
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center mx-auto mb-2 ${weeklyChange >= 0 ? "bg-rose-100" : "bg-emerald-100"}`}>
            {weeklyChange >= 0 ? <TrendingUp className="h-4 w-4 text-rose-600" /> : <TrendingDown className="h-4 w-4 text-emerald-600" />}
          </div>
          <p className={`font-bold text-lg ${weeklyChange >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {weeklyChange >= 0 ? "+" : ""}{weeklyChange.toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">Semanal</p>
        </Card>
      </div>

      {/* Radar + Category breakdown */}
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
            <h2 className="font-bold text-foreground text-sm">Gastos por Categoria (mês atual)</h2>
          </div>
          {catSpending.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum gasto registrado este mês</p>
            </div>
          ) : (
            <div className="space-y-3">
              {catSpending.map((cat, i) => {
                const maxCat = catSpending[0].total;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${CAT_COLORS[i % CAT_COLORS.length]} shrink-0`} />
                        <span className="text-sm text-foreground">{cat.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{fmt(cat.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${CAT_COLORS[i % CAT_COLORS.length]} rounded-full`} style={{ width: `${(cat.total / maxCat) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Day of week chart */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-bold text-foreground text-sm">Gastos por Dia da Semana</h2>
            <p className="text-xs text-muted-foreground">Baseado nos últimos 3 meses · Pico: <span className="text-primary font-medium">{DAY_NAMES[peakDayIndex]}s</span></p>
          </div>
        </div>
        {expenses.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Registre transações para ver o padrão</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-36 mt-2">
            {DAY_NAMES.map((name, i) => {
              const heightPct = (daySpending[i] / maxDay) * 100;
              const isPeak = i === peakDayIndex;
              return (
                <div key={name} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative flex flex-col justify-end" style={{ height: "100px" }}>
                    <div
                      className={`w-full rounded-t-md transition-all duration-700 ${isPeak ? "bg-primary" : "bg-primary/30"}`}
                      style={{ height: `${Math.max(heightPct, daySpending[i] > 0 ? 5 : 1)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${isPeak ? "text-primary" : "text-muted-foreground"}`}>{name}</span>
                  {daySpending[i] > 0 && (
                    <span className="text-[9px] text-muted-foreground">{fmt(daySpending[i])}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Trending categories */}
      {catTrend.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <h2 className="font-bold text-foreground text-sm">Tendências de Gastos</h2>
              <p className="text-xs text-muted-foreground">Variação vs mês anterior</p>
            </div>
          </div>
          <div className="space-y-3">
            {catTrend.map(cat => {
              const isUp = (cat.change || 0) > 0;
              return (
                <div key={cat.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    {isUp
                      ? <TrendingUp className="h-4 w-4 text-destructive shrink-0" />
                      : <TrendingDown className="h-4 w-4 text-emerald-600 shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-foreground">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(cat.prev)} → {fmt(cat.curr)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${isUp ? "text-destructive" : "text-emerald-600"}`}>
                    {isUp ? "+" : ""}{cat.change?.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Suggestions */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h2 className="font-bold text-foreground text-sm">Sugestões Personalizadas</h2>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Registre mais transações para receber sugestões personalizadas.</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${s.type === "warn" ? "bg-destructive/5 border border-destructive/10" : s.type === "ok" ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-muted/50"}`}>
                <s.icon className={`h-4 w-4 mt-0.5 shrink-0 ${s.type === "warn" ? "text-destructive" : s.type === "ok" ? "text-emerald-600" : "text-primary"}`} />
                <p className="text-sm text-foreground leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="mt-4 rounded-full gap-1.5 w-full" onClick={() => navigate("/dashboard/nylo-ia")}>
          <Sparkles className="h-3.5 w-3.5" /> Conversar com o Nox IA para mais insights
        </Button>
      </Card>
    </div>
  );
}

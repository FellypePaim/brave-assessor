import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Clock, TrendingUp, RefreshCw, Sparkles, Target, Calendar, Tag } from "lucide-react";

const radarLabels = ["Controle", "Consistência", "Planejamento", "Economia", "Disciplina"];
const radarValues = [100, 100, 100, 80, 90]; // placeholder

function RadarChart() {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const levels = 5;

  const angleStep = (2 * Math.PI) / radarLabels.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const ratio = value / 100;
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    };
  };

  const gridLines = Array.from({ length: levels }, (_, i) => {
    const levelR = (r / levels) * (i + 1);
    const points = radarLabels.map((_, j) => {
      const angle = startAngle + j * angleStep;
      return `${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`;
    });
    return points.join(" ");
  });

  const dataPoints = radarValues.map((v, i) => getPoint(i, v));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto">
      {/* Grid */}
      {gridLines.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
          opacity={0.5}
        />
      ))}
      {/* Axes */}
      {radarLabels.map((_, i) => {
        const angle = startAngle + i * angleStep;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(angle)}
            y2={cy + r * Math.sin(angle)}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            opacity={0.3}
          />
        );
      })}
      {/* Data */}
      <polygon points={dataPolygon} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="hsl(var(--primary))" />
      ))}
      {/* Labels */}
      {radarLabels.map((label, i) => {
        const angle = startAngle + i * angleStep;
        const lx = cx + (r + 20) * Math.cos(angle);
        const ly = cy + (r + 20) * Math.sin(angle);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize="8"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

const behaviorBars = [
  { label: "Controle", value: 100 },
  { label: "Consistência", value: 100 },
  { label: "Planejamento", value: 100 },
];

export default function Behavior() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Comportamento</h1>
          </div>
          <p className="text-primary text-sm">Entenda seus padrões financeiros</p>
        </div>
        <div className="border border-border rounded-full px-3 py-1.5 text-sm font-medium text-foreground flex items-center gap-1.5">
          <span>🩺</span> Saúde: 50%
        </div>
      </div>

      {/* Status Banner */}
      <Card className="p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">Equilibrado</p>
            <p className="text-xs text-muted-foreground">Você mantém um bom equilíbrio</p>
          </div>
        </div>
        <Button size="sm" className="rounded-full bg-primary text-primary-foreground gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          Nox IA
        </Button>
      </Card>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <p className="font-bold text-foreground text-lg">0%</p>
          <p className="text-xs text-muted-foreground">Impulsividade</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="font-bold text-foreground text-lg">--</p>
          <p className="text-xs text-muted-foreground">Horário Pico</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <p className="font-bold text-foreground text-lg">+0%</p>
          <p className="text-xs text-muted-foreground">Semanal</p>
        </Card>
      </div>

      {/* Nox IA Analysis */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">Nox IA ✨</p>
              <p className="text-xs text-muted-foreground">Análise personalizada</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Registre transações para receber análises</p>
        </div>
      </Card>

      {/* Perfil Comportamental + Gastos por Categoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">Perfil Comportamental</h2>
          </div>
          <RadarChart />
          {/* Bars */}
          <div className="space-y-2.5 mt-4">
            {behaviorBars.map((bar) => (
              <div key={bar.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{bar.label}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${bar.value}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground w-10 text-right">{bar.value}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-foreground text-sm">Gastos por Categoria</h2>
          </div>
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Categorize suas transações</p>
          </div>
        </Card>
      </div>

      {/* Gastos por Dia da Semana */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-bold text-foreground text-sm">Gastos por Dia da Semana</h2>
            <p className="text-xs text-muted-foreground">Descubra seus dias de maior consumo</p>
          </div>
        </div>
        <div className="text-center py-10 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Registre transações para ver o padrão</p>
        </div>
      </Card>
    </div>
  );
}

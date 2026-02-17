import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Target, Calculator, AlertCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addMonths, format } from "date-fns";
import { EditGoalDialog } from "@/components/EditGoalDialog";

export default function Goals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCalc, setShowCalc] = useState(false);
  const [amount, setAmount] = useState(0);
  const [months, setMonths] = useState(0);
  const [goalName, setGoalName] = useState("");
  const [editGoal, setEditGoal] = useState<any>(null);

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_goals")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      const deadline = format(addMonths(new Date(), months), "yyyy-MM-dd");
      const { error } = await supabase.from("financial_goals").insert({
        user_id: user!.id,
        name: goalName || `Meta de R$ ${amount.toLocaleString("pt-BR")}`,
        target_amount: amount,
        current_amount: 0,
        deadline,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast({ title: "Meta criada com sucesso!" });
      setGoalName("");
      setShowCalc(false);
    },
  });

  const perMonth = months > 0 ? amount / months : 0;
  const perWeek = months > 0 ? amount / (months * 4.33) : 0;
  const perDay = months > 0 ? amount / (months * 30) : 0;
  const incomeEstimate = 3000;
  const pctIncome = incomeEstimate > 0 ? (perMonth / incomeEstimate) * 100 : 0;

  const getDifficultyLabel = () => {
    if (pctIncome > 50) return { text: "Muito difícil - considere aumentar o prazo", color: "text-rose-500" };
    if (pctIncome > 30) return { text: "Desafiador - mas possível com disciplina", color: "text-amber-500" };
    return { text: "Tranquilo - meta bem planejada!", color: "text-emerald-500" };
  };
  const difficulty = getDifficultyLabel();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas Financeiras</h1>
          <p className="text-muted-foreground text-sm">Acompanhe e alcance seus objetivos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showCalc ? "default" : "outline"} className={`rounded-full gap-1.5 ${showCalc ? "bg-primary text-primary-foreground" : "border-border text-foreground"}`} onClick={() => setShowCalc(!showCalc)}>
            <Calculator className="h-4 w-4" /> Calculadora
          </Button>
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => setShowCalc(true)}>
            <Plus className="h-4 w-4" /> Nova Meta
          </Button>
        </div>
      </div>

      {showCalc && (
        <Card className="p-6 space-y-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-foreground">Calculadora de Metas</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Quanto juntar? (R$)</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="rounded-lg" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Em quantos meses?</label>
              <Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-lg" min={1} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 p-4 text-center">
              <p className="text-xs text-muted-foreground">Por mês</p>
              <p className="font-bold text-primary text-lg">R$ {fmt(perMonth)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Por semana</p>
              <p className="font-bold text-foreground text-lg">R$ {fmt(perWeek)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">Por dia</p>
              <p className="font-bold text-foreground text-lg">R$ {fmt(perDay)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-muted-foreground">Da sua renda mensal</span>
              <span className="text-sm font-bold text-foreground">{pctIncome.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-pink-400 transition-all duration-500" style={{ width: `${Math.min(pctIncome, 100)}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className={`h-4 w-4 ${difficulty.color}`} />
            <span className={`text-sm font-medium ${difficulty.color}`}>{difficulty.text}</span>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nome da meta (opcional)</label>
            <Input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Ex: Reserva de emergência" className="rounded-lg" />
          </div>
          <Button className="w-full rounded-xl bg-gradient-to-r from-primary to-pink-400 hover:brightness-110 text-primary-foreground gap-2 h-12" onClick={() => createGoal.mutate()} disabled={createGoal.isPending || amount <= 0 || months <= 0}>
            <Target className="h-4 w-4" /> Criar esta Meta
          </Button>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground text-sm">Metas Ativas ({goals.length})</span>
      </div>

      <Card className="p-6">
        {goals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">Nenhuma meta ativa</p>
            <p className="text-sm mt-1">Crie sua primeira meta para começar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => {
              const pct = goal.target_amount > 0 ? Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100) : 0;
              return (
                <Card key={goal.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer group relative" onClick={() => setEditGoal(goal)}>
                  <button className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-foreground">{goal.name}</p>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>R$ {Number(goal.current_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span>R$ {Number(goal.target_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <EditGoalDialog goal={editGoal} open={!!editGoal} onOpenChange={(o) => !o && setEditGoal(null)} />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Target, Calculator } from "lucide-react";

export default function Goals() {
  const { user } = useAuth();

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas Financeiras</h1>
          <p className="text-muted-foreground text-sm">Acompanhe e alcance seus objetivos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full gap-1.5 border-border text-foreground">
            <Calculator className="h-4 w-4" />
            Calculadora
          </Button>
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <Plus className="h-4 w-4" />
            Nova Meta
          </Button>
        </div>
      </div>

      {/* Active Goals Label */}
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground text-sm">Metas Ativas ({goals.length})</span>
      </div>

      {/* Goals List */}
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
              const pct = goal.target_amount > 0
                ? Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100)
                : 0;
              return (
                <Card key={goal.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-foreground">{goal.name}</p>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
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
    </div>
  );
}

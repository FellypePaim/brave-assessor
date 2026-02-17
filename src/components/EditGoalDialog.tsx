import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
}

interface Props {
  goal: Goal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditGoalDialog({ goal, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTarget(String(goal.target_amount));
      setCurrent(String(goal.current_amount));
      setDeadline(goal.deadline || "");
    }
  }, [goal]);

  const handleSave = async () => {
    if (!goal) return;
    setSaving(true);
    const { error } = await supabase.from("financial_goals").update({
      name: name.trim(),
      target_amount: parseFloat(target) || 0,
      current_amount: parseFloat(current) || 0,
      deadline: deadline || null,
    }).eq("id", goal.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Meta atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!goal) return;
    if (!window.confirm("Excluir esta meta?")) return;
    const { error } = await supabase.from("financial_goals").delete().eq("id", goal.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Meta excluída!" });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      onOpenChange(false);
    }
  };

  const pct = parseFloat(target) > 0 ? Math.min((parseFloat(current) / parseFloat(target)) * 100, 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Meta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome da meta</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Valor alvo (R$)</label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} type="number" step="0.01" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Valor atual (R$)</label>
            <Input value={current} onChange={(e) => setCurrent(e.target.value)} type="number" step="0.01" className="mt-1" />
          </div>
          {/* Progress preview */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Prazo</label>
            <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="destructive" size="icon" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

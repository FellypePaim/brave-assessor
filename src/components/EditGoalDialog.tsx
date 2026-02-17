import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Target } from "lucide-react";
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
      setName(goal.name); setTarget(String(goal.target_amount));
      setCurrent(String(goal.current_amount)); setDeadline(goal.deadline || "");
    }
  }, [goal]);

  const handleSave = async () => {
    if (!goal) return;
    setSaving(true);
    const { error } = await supabase.from("financial_goals").update({ name: name.trim(), target_amount: parseFloat(target) || 0, current_amount: parseFloat(current) || 0, deadline: deadline || null }).eq("id", goal.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Meta atualizada!" }); queryClient.invalidateQueries({ queryKey: ["goals"] }); onOpenChange(false); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!goal || !window.confirm("Excluir esta meta?")) return;
    const { error } = await supabase.from("financial_goals").delete().eq("id", goal.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Meta excluída!" }); queryClient.invalidateQueries({ queryKey: ["goals"] }); onOpenChange(false); }
  };

  const pct = parseFloat(target) > 0 ? Math.min((parseFloat(current) / parseFloat(target)) * 100, 100) : 0;
  const fmtBRL = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? "R$ 0,00" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Editar Meta</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Ajuste sua meta financeira</DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6 space-y-5">
          {/* Progress card */}
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground text-sm">{name || "Sua meta"}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{fmtBRL(current)}</span>
              <span className="font-bold text-primary">{pct.toFixed(0)}%</span>
              <span>{fmtBRL(target)}</span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-pink-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Nome da meta</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Valor alvo (R$)</label>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} type="number" step="0.01" className="h-12 rounded-xl border-border" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Valor atual (R$)</label>
              <Input value={current} onChange={(e) => setCurrent(e.target.value)} type="number" step="0.01" className="h-12 rounded-xl border-border" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Prazo</label>
            <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="h-12 rounded-xl border-border" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" size="icon" onClick={handleDelete} className="h-12 w-12 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

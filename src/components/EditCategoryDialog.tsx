import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Category {
  id: string;
  name: string;
  budget_limit: number | null;
  color: string | null;
  icon: string | null;
}

interface Props {
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const colorOptions = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
  "#14b8a6", "#f43f5e",
];

export function EditCategoryDialog({ category, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [color, setColor] = useState("#ef4444");
  const [saving, setSaving] = useState(false);
  const isNew = !category;

  useEffect(() => {
    if (category) {
      setName(category.name);
      setBudgetLimit(category.budget_limit ? String(category.budget_limit) : "");
      setColor(category.color || "#ef4444");
    } else {
      setName(""); setBudgetLimit(""); setColor("#ef4444");
    }
  }, [category, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("categories").insert({
        user_id: user.id, name: name.trim(),
        budget_limit: parseFloat(budgetLimit) || null, color,
      });
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else { toast({ title: "Categoria criada!" }); queryClient.invalidateQueries({ queryKey: ["categories"] }); onOpenChange(false); }
    } else {
      const { error } = await supabase.from("categories").update({
        name: name.trim(), budget_limit: parseFloat(budgetLimit) || null, color,
      }).eq("id", category!.id);
      if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
      else { toast({ title: "Categoria atualizada!" }); queryClient.invalidateQueries({ queryKey: ["categories"] }); onOpenChange(false); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!category || !window.confirm("Excluir esta categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", category.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Categoria excluída!" }); queryClient.invalidateQueries({ queryKey: ["categories"] }); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-2">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">
              {isNew ? "Nova Categoria" : "Editar Categoria"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {isNew ? "Crie uma categoria para organizar seus gastos" : "Altere os dados da categoria"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Nome <span className="text-destructive">*</span>
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" className="h-11 rounded-xl border-border" />
          </div>

          {/* Limite */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Limite de orçamento</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R$</span>
              <Input value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} type="number" step="0.01" placeholder="Opcional" className="h-11 rounded-xl border-border pl-10" />
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Cor</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-full transition-all ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {!isNew && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleDelete}
                className="h-11 w-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 rounded-2xl font-semibold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-2xl font-semibold shadow-lg shadow-primary/20"
            >
              {saving ? "Salvando..." : isNew ? "Criar" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

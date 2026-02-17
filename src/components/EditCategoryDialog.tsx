import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  { value: "#ef4444", label: "Vermelho" },
  { value: "#f97316", label: "Laranja" },
  { value: "#f59e0b", label: "Amarelo" },
  { value: "#10b981", label: "Verde" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#6b7280", label: "Cinza" },
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
      setName("");
      setBudgetLimit("");
      setColor("#ef4444");
    }
  }, [category, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: name.trim(),
        budget_limit: parseFloat(budgetLimit) || null,
        color,
      });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Categoria criada!" });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        onOpenChange(false);
      }
    } else {
      const { error } = await supabase.from("categories").update({
        name: name.trim(),
        budget_limit: parseFloat(budgetLimit) || null,
        color,
      }).eq("id", category!.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Categoria atualizada!" });
        queryClient.invalidateQueries({ queryKey: ["categories"] });
        onOpenChange(false);
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!category) return;
    if (!window.confirm("Excluir esta categoria? Transações vinculadas perderão a categoria.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", category.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria excluída!" });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova Categoria" : "Editar Categoria"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Limite de orçamento (R$)</label>
            <Input value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} type="number" step="0.01" placeholder="Opcional" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${color === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
              {saving ? "Salvando..." : isNew ? "Criar" : "Salvar"}
            </Button>
            {!isNew && (
              <Button variant="destructive" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CardData {
  id: string;
  name: string;
  brand: string | null;
  last_4_digits: string | null;
  credit_limit: number | null;
  due_day: number | null;
}

interface Props {
  card: CardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCardDialog({ card, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setBrand(card.brand || "");
      setLast4(card.last_4_digits || "");
      setLimit(card.credit_limit ? String(card.credit_limit) : "");
      setDueDay(card.due_day ? String(card.due_day) : "");
    }
  }, [card]);

  const handleSave = async () => {
    if (!card) return;
    setSaving(true);
    const { error } = await supabase.from("cards").update({
      name: name.trim(),
      brand: brand || null,
      last_4_digits: last4 || null,
      credit_limit: parseFloat(limit) || null,
      due_day: parseInt(dueDay) || null,
    }).eq("id", card.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cartão atualizado!" });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!card) return;
    if (!window.confirm("Excluir este cartão?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cartão excluído!" });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Cartão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome do cartão</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Bandeira</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Últimos 4 dígitos</label>
              <Input value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))} maxLength={4} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Dia de vencimento</label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Limite (R$)</label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" className="mt-1" />
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

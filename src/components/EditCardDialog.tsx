import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const cardColors = [
  "hsl(240, 10%, 15%)",
  "hsl(210, 70%, 55%)",
  "hsl(340, 75%, 55%)",
  "hsl(145, 65%, 45%)",
  "hsl(170, 60%, 45%)",
  "hsl(270, 60%, 55%)",
  "hsl(45, 85%, 55%)",
  "hsl(25, 85%, 55%)",
  "hsl(300, 60%, 50%)",
  "hsl(195, 55%, 50%)",
];

export function EditCardDialog({ card, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [selectedColor, setSelectedColor] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setBrand(card.brand || "Visa");
      setLast4(card.last_4_digits || "");
      setLimit(card.credit_limit ? String(card.credit_limit) : "");
      setDueDay(card.due_day ? String(card.due_day) : "");
      setSelectedColor(0);
    }
  }, [card]);

  const handleSave = async () => {
    if (!card || !name.trim()) return;
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
    if (!card || !window.confirm("Excluir este cartão?")) return;
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
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-3">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Editar Cartão</DialogTitle>
            <DialogDescription className="sr-only">Altere os dados do cartão</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Nome do Cartão</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank, Itaú Gold" className="h-11 rounded-xl border-border" />
          </div>

          {/* Tipo + Bandeira */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Tipo</label>
              <Select defaultValue="credito">
                <SelectTrigger className="h-11 rounded-xl border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Bandeira</label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="h-11 rounded-xl border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Visa">Visa</SelectItem>
                  <SelectItem value="Mastercard">Mastercard</SelectItem>
                  <SelectItem value="Elo">Elo</SelectItem>
                  <SelectItem value="Amex">Amex</SelectItem>
                  <SelectItem value="Hipercard">Hipercard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Últimos 4 dígitos */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Últimos 4 dígitos</label>
            <Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" maxLength={4} className="h-11 rounded-xl border-border font-mono" />
          </div>

          {/* Limite + Vencimento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Limite de Crédito</label>
              <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" placeholder="5000" className="h-11 rounded-xl border-border" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Dia do Vencimento</label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} placeholder="10" className="h-11 rounded-xl border-border" />
            </div>
          </div>

          {/* Cor do Cartão */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Cor do Cartão</label>
            <div className="flex items-center gap-2 flex-wrap">
              {cardColors.map((color, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedColor(i)}
                  className={`h-9 w-9 rounded-full transition-all ${
                    selectedColor === i
                      ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handleDelete}
              className="h-11 w-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

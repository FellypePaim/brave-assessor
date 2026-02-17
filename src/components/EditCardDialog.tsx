import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, CreditCard } from "lucide-react";
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

const brands = ["Visa", "Mastercard", "Elo", "Amex"];

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
      setName(card.name); setBrand(card.brand || ""); setLast4(card.last_4_digits || "");
      setLimit(card.credit_limit ? String(card.credit_limit) : ""); setDueDay(card.due_day ? String(card.due_day) : "");
    }
  }, [card]);

  const handleSave = async () => {
    if (!card) return;
    setSaving(true);
    const { error } = await supabase.from("cards").update({ name: name.trim(), brand: brand || null, last_4_digits: last4 || null, credit_limit: parseFloat(limit) || null, due_day: parseInt(dueDay) || null }).eq("id", card.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cartão atualizado!" }); queryClient.invalidateQueries({ queryKey: ["cards"] }); onOpenChange(false); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!card || !window.confirm("Excluir este cartão?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cartão excluído!" }); queryClient.invalidateQueries({ queryKey: ["cards"] }); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Editar Cartão</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Altere os dados do cartão</DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6 space-y-5">
          {/* Card preview */}
          <div className="rounded-2xl bg-gradient-to-br from-foreground/90 to-foreground/70 text-background p-5 space-y-4">
            <div className="flex items-center justify-between">
              <CreditCard className="h-6 w-6 opacity-70" />
              <span className="text-xs opacity-70">{brand || "Bandeira"}</span>
            </div>
            <p className="font-mono tracking-[0.2em] text-lg">•••• •••• •••• {last4 || "0000"}</p>
            <p className="text-sm opacity-80">{name || "Nome do cartão"}</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Nome do cartão</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border-border" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Bandeira</label>
            <div className="flex gap-2">
              {brands.map((b) => (
                <button key={b} onClick={() => setBrand(b)} className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${brand === b ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Últimos 4 dígitos</label>
              <Input value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))} maxLength={4} className="h-12 rounded-xl border-border font-mono" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Vencimento</label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} className="h-12 rounded-xl border-border" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Limite (R$)</label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" className="h-12 rounded-xl border-border text-lg font-medium" />
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

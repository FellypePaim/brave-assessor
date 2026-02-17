import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  trigger?: React.ReactNode;
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

export function AddCardDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [selectedColor, setSelectedColor] = useState(0);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName(""); setBrand("Visa"); setLast4(""); setLimit(""); setDueDay(""); setSelectedColor(0);
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("cards").insert({
      user_id: user.id,
      name: name.trim(),
      brand: brand || null,
      last_4_digits: last4 || null,
      credit_limit: parseFloat(limit) || null,
      due_day: parseInt(dueDay) || null,
      color: cardColors[selectedColor],
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cartão adicionado!" });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      setOpen(false);
      resetForm();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <Plus className="h-4 w-4" /> Novo Cartão
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-3">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Novo Cartão</DialogTitle>
            <DialogDescription className="sr-only">Cadastre seu cartão</DialogDescription>
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

          {/* Limite + Fatura */}
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
              onClick={() => { setOpen(false); resetForm(); }}
              className="flex-1 h-11 rounded-2xl font-semibold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-2xl font-semibold shadow-lg shadow-primary/20"
            >
              {saving ? "Salvando..." : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

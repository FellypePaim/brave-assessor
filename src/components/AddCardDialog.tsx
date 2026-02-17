import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  trigger?: React.ReactNode;
}

const brands = [
  { value: "Visa", color: "bg-blue-500" },
  { value: "Mastercard", color: "bg-orange-500" },
  { value: "Elo", color: "bg-emerald-500" },
  { value: "Amex", color: "bg-sky-500" },
];

export function AddCardDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("cards").insert({
      user_id: user.id, name: name.trim(), brand: brand || null,
      last_4_digits: last4 || null, credit_limit: parseFloat(limit) || null, due_day: parseInt(dueDay) || null,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Cartão adicionado!" });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      setOpen(false);
      setName(""); setBrand(""); setLast4(""); setLimit(""); setDueDay("");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <Plus className="h-4 w-4" /> Novo Cartão
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Novo Cartão</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Cadastre seu cartão de crédito</DialogDescription>
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank Ultravioleta" className="h-12 rounded-xl border-border" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Bandeira</label>
            <div className="flex gap-2">
              {brands.map((b) => (
                <button key={b.value} onClick={() => setBrand(b.value)} className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${brand === b.value ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {b.value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Últimos 4 dígitos</label>
              <Input value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))} placeholder="1234" maxLength={4} className="h-12 rounded-xl border-border font-mono" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block">Vencimento</label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} placeholder="Dia" className="h-12 rounded-xl border-border" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Limite (R$)</label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" placeholder="5.000,00" className="h-12 rounded-xl border-border text-lg font-medium" />
          </div>

          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20">
            {saving ? "Salvando..." : "Adicionar Cartão"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  trigger?: React.ReactNode;
}

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
      user_id: user.id,
      name: name.trim(),
      brand: brand || null,
      last_4_digits: last4 || null,
      credit_limit: parseFloat(limit) || null,
      due_day: parseInt(dueDay) || null,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cartão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome do cartão</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank Ultravioleta" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Bandeira</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex: Visa, Mastercard" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Últimos 4 dígitos</label>
              <Input value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))} placeholder="1234" maxLength={4} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Dia de vencimento</label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} placeholder="15" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Limite (R$)</label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" step="0.01" placeholder="5000,00" className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Salvando..." : "Adicionar Cartão"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

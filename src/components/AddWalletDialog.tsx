import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export function AddWalletDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("wallets").insert({
      user_id: user.id,
      name: name.trim(),
      type,
      balance: parseFloat(balance) || 0,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Carteira criada!" });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setOpen(false);
      setName("");
      setType("checking");
      setBalance("");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-foreground p-4 min-w-[160px] flex items-center justify-center gap-2 transition-colors">
            <Plus className="h-4 w-4" /> Nova Conta
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Carteira</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Tipo</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Conta Corrente</SelectItem>
                <SelectItem value="savings">Poupança</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="investment">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Saldo Inicial (R$)</label>
            <Input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" placeholder="0,00" className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? "Salvando..." : "Criar Carteira"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

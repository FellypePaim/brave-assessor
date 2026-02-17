import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  name: string;
  type: string;
  balance: number;
}

interface Props {
  wallet: Wallet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWalletDialog({ wallet, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wallet) {
      setName(wallet.name);
      setType(wallet.type);
      setBalance(String(wallet.balance));
    }
  }, [wallet]);

  const handleSave = async () => {
    if (!wallet) return;
    setSaving(true);
    const { error } = await supabase.from("wallets").update({
      name: name.trim(),
      type,
      balance: parseFloat(balance) || 0,
    }).eq("id", wallet.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Carteira atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!wallet) return;
    if (!window.confirm("Excluir esta carteira? Transações vinculadas não serão removidas.")) return;
    const { error } = await supabase.from("wallets").delete().eq("id", wallet.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Carteira excluída!" });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Carteira</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
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
            <label className="text-sm font-medium text-foreground">Saldo (R$)</label>
            <Input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" className="mt-1" />
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

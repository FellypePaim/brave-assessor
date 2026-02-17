import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Landmark, PiggyBank, Banknote, TrendingUp } from "lucide-react";
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

const walletTypes = [
  { value: "checking", label: "Conta Corrente", icon: Landmark, desc: "Banco digital" },
  { value: "savings", label: "Poupança", icon: PiggyBank, desc: "Reserva" },
  { value: "cash", label: "Dinheiro", icon: Banknote, desc: "Espécie" },
  { value: "investment", label: "Investimento", icon: TrendingUp, desc: "Renda fixa/variável" },
];

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
    const { error } = await supabase.from("wallets").update({ name: name.trim(), type, balance: parseFloat(balance) || 0 }).eq("id", wallet.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Carteira atualizada!" }); queryClient.invalidateQueries({ queryKey: ["wallets"] }); onOpenChange(false); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!wallet || !window.confirm("Excluir esta carteira?")) return;
    const { error } = await supabase.from("wallets").delete().eq("id", wallet.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Carteira excluída!" }); queryClient.invalidateQueries({ queryKey: ["wallets"] }); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Editar Carteira</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Altere os dados da sua conta</DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border-border" />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Tipo de conta</label>
            <div className="grid grid-cols-2 gap-3">
              {walletTypes.map((wt) => (
                <button key={wt.value} onClick={() => setType(wt.value)} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${type === wt.value ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"}`}>
                  <wt.icon className="h-5 w-5" /><span className="text-xs font-semibold">{wt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Saldo (R$)</label>
            <Input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" className="h-12 rounded-xl border-border text-lg font-medium" />
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

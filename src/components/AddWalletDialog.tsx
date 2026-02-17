import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Landmark, PiggyBank, Banknote, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  trigger?: React.ReactNode;
}

const walletTypes = [
  { value: "checking", label: "Conta Corrente", icon: Landmark, desc: "Banco digital ou tradicional" },
  { value: "savings", label: "Poupança", icon: PiggyBank, desc: "Reserva de emergência" },
  { value: "cash", label: "Dinheiro", icon: Banknote, desc: "Espécie em carteira" },
  { value: "investment", label: "Investimento", icon: TrendingUp, desc: "Renda fixa ou variável" },
];

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
      setName(""); setType("checking"); setBalance("");
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
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Nova Carteira</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Adicione uma conta para gerenciar seu dinheiro
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Nome da conta</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank" className="h-12 rounded-xl border-border" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Tipo de conta</label>
            <div className="grid grid-cols-2 gap-3">
              {walletTypes.map((wt) => (
                <button
                  key={wt.value}
                  onClick={() => setType(wt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                    type === wt.value
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <wt.icon className="h-5 w-5" />
                  <span className="text-xs font-semibold">{wt.label}</span>
                  <span className="text-[9px] opacity-70 leading-tight text-center">{wt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Saldo Inicial (R$)</label>
            <Input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" placeholder="0,00" className="h-12 rounded-xl border-border text-lg font-medium" />
          </div>

          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20">
            {saving ? "Salvando..." : "Criar Carteira"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

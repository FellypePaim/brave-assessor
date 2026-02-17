import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
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

const walletIcons = ["🏦", "💰", "🏧", "💳", "📱", "🪙", "🏛️"];

const walletColors = [
  "hsl(215, 80%, 60%)",
  "hsl(145, 65%, 45%)",
  "hsl(270, 60%, 55%)",
  "hsl(45, 85%, 55%)",
  "hsl(340, 75%, 55%)",
  "hsl(175, 65%, 45%)",
];

export function AddWalletDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [balance, setBalance] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("wallets").insert({
      user_id: user.id,
      name: name.trim(),
      type: "checking",
      balance: parseFloat(balance) || 0,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conta criada!" });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setOpen(false);
      setName(""); setBank(""); setBalance(""); setSelectedIcon(0); setSelectedColor(0);
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
        <div className="p-6 pb-2">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Nova Conta Bancária</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Cadastre sua conta-corrente para acompanhar seu saldo
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Nome da conta */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Nome da conta <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Conta Nubank, Itaú..."
              className="h-11 rounded-xl border-border"
            />
          </div>

          {/* Banco */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Banco (opcional)
            </label>
            <Input
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Ex: Nubank, Itaú, Bradesco..."
              className="h-11 rounded-xl border-border"
            />
          </div>

          {/* Saldo inicial */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Saldo inicial</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R$</span>
              <Input
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                type="number"
                step="0.01"
                placeholder="0,00"
                className="h-11 rounded-xl border-border pl-10"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Este é o valor que você tem disponível agora na conta
            </p>
          </div>

          {/* Ícone */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Ícone</label>
            <div className="flex items-center gap-2 flex-wrap">
              {walletIcons.map((icon, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIcon(i)}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg transition-all ${
                    selectedIcon === i
                      ? "bg-primary/15 ring-2 ring-primary shadow-sm"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Cor</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {walletColors.map((color, i) => (
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

          {/* Botão */}
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full h-12 rounded-2xl font-semibold text-base shadow-lg shadow-primary/20 mt-2"
          >
            {saving ? "Salvando..." : "Criar Conta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

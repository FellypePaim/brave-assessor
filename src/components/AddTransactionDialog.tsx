import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingDown, TrendingUp, Repeat, Wallet, CreditCard, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

interface Props {
  trigger?: React.ReactNode;
}

export function AddTransactionDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState<"wallet" | "card">("wallet");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").eq("user_id", user!.id).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("id, name, balance").order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const handleSave = async () => {
    if (!user || !amount) return;
    setSaving(true);

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: description.trim() || (type === "expense" ? "Despesa" : "Receita"),
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      wallet_id: walletId || null,
      date,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      if (walletId) {
        const delta = type === "income" ? parseFloat(amount) : -parseFloat(amount);
        const wallet = wallets.find(w => w.id === walletId);
        if (wallet) {
          await supabase.from("wallets").update({ balance: Number((wallet as any).balance || 0) + delta }).eq("id", walletId);
        }
      }
      toast({ title: "Transação adicionada!" });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["bills-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      setOpen(false);
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setType("expense");
    setCategoryId("");
    setWalletId("");
    setDate(new Date().toISOString().slice(0, 10));
    setPayMethod("wallet");
  };

  const selectedWallet = wallets.find(w => w.id === walletId);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> Nova Transação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Nova Transação</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Registre rapidamente uma receita ou despesa
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Type toggle */}
          <div className="grid grid-cols-2 rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setType("expense")}
              className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
                type === "expense"
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Despesa
            </button>
            <button
              onClick={() => setType("income")}
              className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
                type === "income"
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Receita
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Valor (R$)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="0.01"
              placeholder="0,00"
              className="h-12 rounded-xl border-border text-lg font-medium"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Categoria</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-12 rounded-xl border-border">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Como você vai pagar?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPayMethod("wallet")}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${
                  payMethod === "wallet"
                    ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Wallet className="h-5 w-5" />
                <span className="text-sm font-semibold">Conta Corrente</span>
                <span className="text-[10px] opacity-80">Pix / Débito</span>
              </button>
              <button
                onClick={() => setPayMethod("card")}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${
                  payMethod === "card"
                    ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                }`}
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-sm font-semibold">Cartão de Crédito</span>
                <span className="text-[10px] opacity-80">Fatura</span>
              </button>
            </div>
          </div>

          {/* Wallet selector */}
          {payMethod === "wallet" && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5" /> De qual conta sai?
              </label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="h-12 rounded-xl border-border">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{w.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedWallet && (
                <div className="mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 border border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Landmark className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{selectedWallet.name}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">
                    R$ {Number(selectedWallet.balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {selectedWallet && amount && (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  O saldo será deduzido automaticamente
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Descrição (opcional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Almoço no restaurante"
              className="h-12 rounded-xl border-border"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Data</label>
            <Input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
              className="h-12 rounded-xl border-border"
            />
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || !amount}
            className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20"
          >
            {saving ? "Salvando..." : "Salvar Transação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

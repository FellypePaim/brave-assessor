import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, TrendingDown, TrendingUp, Wallet, CreditCard, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  category_id: string | null;
  wallet_id: string | null;
  date: string;
}

interface Props {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTransactionDialog({ transaction, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState<"wallet" | "card">("wallet");

  useEffect(() => {
    if (transaction) {
      setDescription(transaction.description);
      setAmount(String(transaction.amount));
      setType(transaction.type);
      setCategoryId(transaction.category_id || "");
      setWalletId(transaction.wallet_id || "");
      setDate(transaction.date);
      setPayMethod(transaction.wallet_id ? "wallet" : "card");
    }
  }, [transaction]);

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

  const invalidateAll = () => {
    ["transactions", "wallet-transactions", "bills-transactions", "dashboard-transactions", "behavior-transactions", "wallets"].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  };

  const handleSave = async () => {
    if (!transaction || !user) return;
    setSaving(true);
    const { error } = await supabase.from("transactions").update({
      description: description.trim(),
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      wallet_id: payMethod === "wallet" ? (walletId || null) : null,
      date,
    }).eq("id", transaction.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Transação atualizada!" });
      invalidateAll();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!transaction) return;
    if (!window.confirm("Tem certeza que deseja excluir esta transação?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", transaction.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Transação excluída!" });
      invalidateAll();
      onOpenChange(false);
    }
  };

  const selectedWallet = wallets.find(w => w.id === walletId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Editar Transação</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Altere os dados da transação
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Type toggle */}
          <div className="grid grid-cols-2 rounded-xl border border-border overflow-hidden">
            <button onClick={() => setType("expense")} className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${type === "expense" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted/50"}`}>
              <TrendingDown className="h-4 w-4" /> Despesa
            </button>
            <button onClick={() => setType("income")} className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${type === "income" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted/50"}`}>
              <TrendingUp className="h-4 w-4" /> Receita
            </button>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Valor (R$)</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className="h-12 rounded-xl border-border text-lg font-medium" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Categoria</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-12 rounded-xl border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Método de pagamento</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPayMethod("wallet")} className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${payMethod === "wallet" ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"}`}>
                <Wallet className="h-5 w-5" /><span className="text-sm font-semibold">Conta</span><span className="text-[10px] opacity-80">Pix / Débito</span>
              </button>
              <button onClick={() => setPayMethod("card")} className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${payMethod === "card" ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"}`}>
                <CreditCard className="h-5 w-5" /><span className="text-sm font-semibold">Cartão</span><span className="text-[10px] opacity-80">Fatura</span>
              </button>
            </div>
          </div>

          {payMethod === "wallet" && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> De qual conta?</label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="h-12 rounded-xl border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{wallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
              {selectedWallet && (
                <div className="mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 border border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Landmark className="h-4 w-4 text-primary" /></div>
                    <span className="text-sm font-medium text-foreground">{selectedWallet.name}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">R$ {Number(selectedWallet.balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Almoço" className="h-12 rounded-xl border-border" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Data</label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="h-12 rounded-xl border-border" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !amount} className="flex-1 h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
            <Button variant="outline" size="icon" onClick={handleDelete} className="h-12 w-12 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

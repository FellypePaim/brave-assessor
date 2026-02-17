import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
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

  useEffect(() => {
    if (transaction) {
      setDescription(transaction.description);
      setAmount(String(transaction.amount));
      setType(transaction.type);
      setCategoryId(transaction.category_id || "");
      setWalletId(transaction.wallet_id || "");
      setDate(transaction.date);
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
      const { data } = await supabase.from("wallets").select("id, name").order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["bills-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["behavior-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
  };

  const handleSave = async () => {
    if (!transaction || !user) return;
    setSaving(true);
    const { error } = await supabase.from("transactions").update({
      description: description.trim(),
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      wallet_id: walletId || null,
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
    const confirmed = window.confirm("Tem certeza que deseja excluir esta transação?");
    if (!confirmed) return;
    const { error } = await supabase.from("transactions").delete().eq("id", transaction.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Transação excluída!" });
      invalidateAll();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Transação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType("expense")} className={`py-2 rounded-lg text-sm font-medium transition-colors ${type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>Despesa</button>
            <button onClick={() => setType("income")} className={`py-2 rounded-lg text-sm font-medium transition-colors ${type === "income" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>Receita</button>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Valor (R$)</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Data</label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Categoria</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Carteira</label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !description.trim() || !amount} className="flex-1">
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

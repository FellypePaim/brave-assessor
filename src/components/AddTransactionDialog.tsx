import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

  const handleSave = async () => {
    if (!user || !description.trim() || !amount) return;
    setSaving(true);

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: description.trim(),
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      wallet_id: walletId || null,
      date,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      // Update wallet balance
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
      setOpen(false);
      setDescription("");
      setAmount("");
      setType("expense");
      setCategoryId("");
      setWalletId("");
      setDate(new Date().toISOString().slice(0, 10));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> Nova Transação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType("expense")}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${type === "expense" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Despesa
            </button>
            <button
              onClick={() => setType("income")}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${type === "income" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
            >
              Receita
            </button>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Supermercado" className="mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Valor (R$)</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="0,00" className="mt-1" />
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

          <Button onClick={handleSave} disabled={saving || !description.trim() || !amount} className="w-full">
            {saving ? "Salvando..." : "Salvar Transação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

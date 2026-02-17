import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { CreditCard, Pencil } from "lucide-react";
import { AddCardDialog } from "@/components/AddCardDialog";
import { EditCardDialog } from "@/components/EditCardDialog";

export default function Cards() {
  const { user } = useAuth();
  const [editCard, setEditCard] = useState<any>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-muted-foreground text-sm">Gerencie seus cartões de crédito e controle de fatura</p>
        </div>
        <AddCardDialog />
      </div>

      <Card className="p-6">
        {cards.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum cartão cadastrado</p>
            <p className="text-sm mt-1">Cadastre seu primeiro cartão</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => {
              const cardColor = (card as any).color || "hsl(240, 10%, 15%)";
              return (
                <div
                  key={card.id}
                  className="rounded-2xl text-white p-5 hover:brightness-110 transition-all cursor-pointer group relative"
                  style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardColor}cc)` }}
                  onClick={() => setEditCard(card)}
                >
                  <button className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/20">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-8 w-8 opacity-80" />
                    <div>
                      <p className="font-semibold text-sm">{card.name}</p>
                      {card.last_4_digits && (
                        <p className="text-xs opacity-80 font-mono">•••• {card.last_4_digits}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                    {card.brand && <span>{card.brand}</span>}
                    {card.credit_limit && (
                      <span>Limite: R$ {Number(card.credit_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <EditCardDialog card={editCard} open={!!editCard} onOpenChange={(o) => !o && setEditCard(null)} />
    </div>
  );
}

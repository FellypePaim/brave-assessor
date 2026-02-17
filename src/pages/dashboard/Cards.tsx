import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, CreditCard } from "lucide-react";

export default function Cards() {
  const { user } = useAuth();

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
        <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
          <Plus className="h-4 w-4" />
          Novo Cartão
        </Button>
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
            {cards.map((card) => (
              <Card key={card.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground text-sm">{card.name}</p>
                    {card.last_4_digits && (
                      <p className="text-xs text-muted-foreground">•••• {card.last_4_digits}</p>
                    )}
                  </div>
                </div>
                {card.credit_limit && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Limite: R$ {Number(card.credit_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

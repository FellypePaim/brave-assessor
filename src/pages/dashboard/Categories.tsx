import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Lock, UtensilsCrossed, ShoppingCart, GraduationCap, Gamepad2, Home, Package, DollarSign, Heart, Car } from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  utensils: UtensilsCrossed,
  shopping: ShoppingCart,
  education: GraduationCap,
  gamepad: Gamepad2,
  home: Home,
  package: Package,
  dollar: DollarSign,
  heart: Heart,
  car: Car,
};

const colorMap: Record<string, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  pink: "bg-pink-400",
  green: "bg-green-500",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  gray: "bg-gray-400",
  yellow: "bg-yellow-400",
  emerald: "bg-emerald-500",
};

const iconBgMap: Record<string, string> = {
  utensils: "bg-orange-100",
  shopping: "bg-amber-100",
  education: "bg-pink-50",
  gamepad: "bg-gray-100",
  home: "bg-blue-50",
  package: "bg-amber-50",
  dollar: "bg-green-50",
  heart: "bg-red-50",
  car: "bg-cyan-50",
};

export default function Categories() {
  const { user } = useAuth();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
          <p className="text-muted-foreground text-sm">Organize suas transações</p>
        </div>
        <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const IconComp = iconMap[cat.icon || ""] || Package;
          const dotColor = colorMap[cat.color || ""] || "bg-gray-400";
          const iconBg = iconBgMap[cat.icon || ""] || "bg-gray-100";

          return (
            <Card key={cat.id} className="p-5 flex items-start gap-3 relative hover:shadow-md transition-shadow cursor-pointer">
              <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                <IconComp className="h-5 w-5 text-foreground/70" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm">{cat.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Lock className="h-3 w-3" />
                  <span>Padrão</span>
                </div>
              </div>
              <div className={`absolute top-4 right-4 h-3 w-3 rounded-full ${dotColor}`} />
            </Card>
          );
        })}

        {categories.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma categoria ainda</p>
            <p className="text-sm mt-1">Crie sua primeira categoria para organizar seus gastos</p>
          </div>
        )}
      </div>
    </div>
  );
}

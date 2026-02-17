import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Lock, Pencil, UtensilsCrossed, ShoppingCart, GraduationCap, Gamepad2, Home, Package, DollarSign, Heart, Car, BookOpen, Shirt, MoreHorizontal } from "lucide-react";
import { EditCategoryDialog } from "@/components/EditCategoryDialog";

const iconMap: Record<string, React.ElementType> = {
  utensils: UtensilsCrossed, shopping: ShoppingCart, education: GraduationCap, gamepad: Gamepad2,
  home: Home, package: Package, dollar: DollarSign, heart: Heart, car: Car, book: BookOpen,
  shirt: Shirt, "more-horizontal": MoreHorizontal,
};

const styleMap: Record<string, { dot: string; bg: string; text: string }> = {
  "#ef4444": { dot: "bg-rose-500", bg: "bg-gradient-to-br from-rose-100 to-red-200", text: "text-rose-600" },
  "#f97316": { dot: "bg-orange-500", bg: "bg-gradient-to-br from-orange-100 to-amber-200", text: "text-orange-600" },
  "#ec4899": { dot: "bg-pink-500", bg: "bg-gradient-to-br from-pink-100 to-fuchsia-200", text: "text-pink-600" },
  "#10b981": { dot: "bg-emerald-500", bg: "bg-gradient-to-br from-emerald-100 to-green-200", text: "text-emerald-600" },
  "#3b82f6": { dot: "bg-blue-500", bg: "bg-gradient-to-br from-blue-100 to-sky-200", text: "text-blue-600" },
  "#06b6d4": { dot: "bg-cyan-500", bg: "bg-gradient-to-br from-cyan-100 to-teal-200", text: "text-cyan-600" },
  "#6b7280": { dot: "bg-slate-500", bg: "bg-gradient-to-br from-slate-100 to-gray-200", text: "text-slate-600" },
  "#f59e0b": { dot: "bg-amber-500", bg: "bg-gradient-to-br from-amber-100 to-yellow-200", text: "text-amber-600" },
  "#8b5cf6": { dot: "bg-violet-500", bg: "bg-gradient-to-br from-violet-100 to-purple-200", text: "text-violet-600" },
};

export default function Categories() {
  const { user } = useAuth();
  const [editCategory, setEditCategory] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("user_id", user!.id).order("name");
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
        <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat, i) => {
          const IconComp = iconMap[cat.icon || ""] || Package;
          const style = styleMap[cat.color || ""] || styleMap["#6b7280"];
          return (
            <Card
              key={cat.id}
              className="p-5 flex items-start gap-3 relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer group animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              onClick={() => setEditCategory(cat)}
            >
              <button className="absolute top-3 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted z-10">
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className={`h-12 w-12 rounded-2xl ${style.bg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                <IconComp className={`h-6 w-6 ${style.text} drop-shadow-sm`} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm">{cat.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  {cat.budget_limit ? (
                    <span>Limite: R$ {Number(cat.budget_limit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  ) : (
                    <><Lock className="h-3 w-3" /><span>Padrão</span></>
                  )}
                </div>
              </div>
              <div className={`absolute top-4 right-4 h-3.5 w-3.5 rounded-full ${style.dot} shadow-md group-hover:scale-125 transition-transform duration-300`} />
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

      <EditCategoryDialog category={editCategory} open={!!editCategory || showNew} onOpenChange={(o) => { if (!o) { setEditCategory(null); setShowNew(false); } }} />
    </div>
  );
}

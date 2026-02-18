import { useState } from "react";
import {
  LayoutDashboard, Wallet, CalendarCheck, Sparkles, MoreHorizontal,
  CreditCard, Tag, Target, TrendingUp, Brain, FileText,
  HeadphonesIcon, Settings, X, Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

const tabs = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Início", end: true },
  { to: "/dashboard/wallets", icon: Wallet, label: "Carteira" },
  { to: "/dashboard/transactions", icon: CalendarCheck, label: "Contas" },
  { to: "/dashboard/brave-ia", icon: Sparkles, label: "Brave IA" },
];

const moreItems = [
  { to: "/dashboard/cards", icon: CreditCard, label: "Cartões" },
  { to: "/dashboard/budgets", icon: Tag, label: "Categorias" },
  { to: "/dashboard/goals", icon: Target, label: "Metas" },
  { to: "/dashboard/investments", icon: TrendingUp, label: "Investimentos" },
  { to: "/dashboard/family", icon: Users, label: "Família" },
  { to: "/dashboard/behavior", icon: Brain, label: "Comportamento" },
  { to: "/dashboard/reports", icon: FileText, label: "Relatórios" },
  { to: "/dashboard/chat", icon: HeadphonesIcon, label: "Suporte" },
  { to: "/dashboard/settings", icon: Settings, label: "Configurações" },
];

export function MobileBottomNav() {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[70] bg-background rounded-t-3xl border-t border-border p-4 pb-6"
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <span className="font-semibold text-foreground text-base">Mais opções</span>
                <button
                  onClick={() => setShowMore(false)}
                  className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {moreItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setShowMore(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all",
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] font-medium leading-tight text-center">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex items-center justify-center w-10 h-8 rounded-full transition-all",
                    isActive && "bg-primary/10 scale-110"
                  )}>
                    <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  </div>
                  <span className={cn(
                    "text-[10px] leading-tight font-medium",
                    isActive && "font-semibold"
                  )}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px] text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-center w-10 h-8 rounded-full">
              <MoreHorizontal className="h-5 w-5" />
            </div>
            <span className="text-[10px] leading-tight font-medium">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}

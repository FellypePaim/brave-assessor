import {
  LayoutDashboard, Wallet, CalendarCheck, Brain, Sparkles,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Início", end: true },
  { to: "/dashboard/wallets", icon: Wallet, label: "Carteira" },
  { to: "/dashboard/transactions", icon: CalendarCheck, label: "Contas" },
  { to: "/dashboard/nylo-ia", icon: Sparkles, label: "Nox IA" },
  { to: "/dashboard/behavior", icon: Brain, label: "Perfil" },
];

export function MobileBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
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
      </div>
    </nav>
  );
}

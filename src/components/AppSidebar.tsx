import {
  LayoutDashboard, Wallet, Tag, CreditCard, CalendarCheck,
  Target, TrendingUp, Brain, FileText, HeadphonesIcon,
  Settings, LogOut, Sparkles, User, ShieldCheck
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Carteira", url: "/dashboard/wallets", icon: Wallet },
  { title: "Categorias", url: "/dashboard/budgets", icon: Tag },
  { title: "Cartões", url: "/dashboard/cards", icon: CreditCard },
  { title: "Compromissos", url: "/dashboard/transactions", icon: CalendarCheck },
  { title: "Metas", url: "/dashboard/goals", icon: Target },
  { title: "Investimentos", url: "/dashboard/investments", icon: TrendingUp },
  { title: "Comportamento", url: "/dashboard/behavior", icon: Brain },
  { title: "Relatórios", url: "/dashboard/reports", icon: FileText },
  { title: "Suporte", url: "/dashboard/chat", icon: HeadphonesIcon },
  { title: "Configurações", url: "/dashboard/settings", icon: Settings },
];

const adminItems = [
  { title: "Atendimentos", url: "/dashboard/admin/support", icon: HeadphonesIcon },
];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {/* Logo */}
        <div className="px-4 pt-5 pb-2 group-data-[collapsible=icon]:px-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-extrabold shrink-0">
              N
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-base text-primary leading-none">Nox Assessor</span>
              <p className="text-[11px] text-muted-foreground leading-tight">Finanças inteligentes</p>
            </div>
          </div>
        </div>

        {/* Nylo IA Button */}
        <div className="px-3 py-2 group-data-[collapsible=icon]:px-1.5">
          <NavLink
            to="/dashboard/nylo-ia"
            className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground hover:brightness-110 transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
            activeClassName="ring-2 ring-primary/30"
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <div className="group-data-[collapsible=icon]:hidden">
              <span className="font-semibold text-sm leading-none">Nox IA</span>
              <p className="text-[11px] opacity-80 leading-tight">Seu assessor</p>
            </div>
          </NavLink>
        </div>

        {/* Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="text-primary font-medium bg-transparent"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Menu */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-3">
              <ShieldCheck className="h-3.5 w-3.5 inline mr-1.5" />
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
                        activeClassName="text-primary font-medium bg-transparent"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        {/* User profile */}
        <div className="flex items-center gap-3 px-3 py-3 group-data-[collapsible=icon]:justify-center">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="group-data-[collapsible=icon]:hidden min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground">Ver perfil</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Sair</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

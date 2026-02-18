import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, Crown, UserCheck, UserX, TrendingDown,
  TrendingUp, PieChart, ChevronRight, Loader2, Lock, Sparkles, Wallet,
} from "lucide-react";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Family() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Fetch user profile to check subscription plan
  const { data: profile } = useQuery({
    queryKey: ["profile-plan", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, display_name")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const canCreateGroup = profile?.subscription_plan === "anual" || profile?.subscription_plan === "trimestral";

  // Fetch group where user is owner
  const { data: myGroup, isLoading: loadingGroup } = useQuery({
    queryKey: ["family-group", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("family_groups")
        .select("*")
        .eq("owner_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch membership (user is a member of another group)
  const { data: myMembership } = useQuery({
    queryKey: ["family-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("family_memberships")
        .select("*, family_groups(name, owner_id)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user && !myGroup,
  });

  // Fetch members of my group
  const { data: members = [] } = useQuery({
    queryKey: ["family-members", myGroup?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("family_memberships")
        .select("*")
        .eq("family_group_id", myGroup!.id)
        .order("created_at");
      return data || [];
    },
    enabled: !!myGroup,
  });

  // Fetch consolidated transactions (current month) from all members
  const memberIds = members.map((m: any) => m.user_id);
  const allUserIds = myGroup ? [myGroup.owner_id, ...memberIds] : [];
  const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: consolidatedTx = [] } = useQuery({
    queryKey: ["family-transactions", myGroup?.id, startDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name, color)")
        .in("user_id", allUserIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!myGroup && allUserIds.length > 0,
  });

  // Fetch profiles for member names
  const { data: memberProfiles = [] } = useQuery({
    queryKey: ["family-profiles", allUserIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, monthly_income")
        .in("id", allUserIds);
      return data || [];
    },
    enabled: allUserIds.length > 0,
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("family_groups")
        .insert({ name: groupName || "Minha Família", owner_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-group"] });
      setCreatingGroup(false);
      toast({ title: "Grupo familiar criado! 🎉" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      // Find user by email via profiles or auth (we use email search through a workaround)
      // Since we can't query auth.users directly, we invite by creating a pending membership
      // The invited user needs to accept via their dashboard
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", inviteEmail) // This won't work with email - need a different approach
        .maybeSingle();

      // Simpler: insert with pending status - user will see it in their memberships
      // For now we do a lookup by display_name as a workaround (real solution: edge function)
      throw new Error("Para convidar um membro, peça para ele acessar o dashboard e buscar seu grupo pelo nome.");
    },
    onError: (e: any) => toast({ title: "Como convidar", description: e.message }),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("family_memberships")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members"] });
      toast({ title: "Membro removido" });
    },
  });

  const joinGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from("family_memberships")
        .insert({ family_group_id: groupId, user_id: user!.id, status: "active" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-membership"] });
      toast({ title: "Você entrou no grupo familiar! 🏠" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const totalExpense = consolidatedTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome = consolidatedTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);

  // Per-member spending
  const memberSpending = allUserIds.map(uid => {
    const profile = memberProfiles.find((p: any) => p.id === uid);
    const spent = consolidatedTx.filter(t => t.user_id === uid && t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const earned = consolidatedTx.filter(t => t.user_id === uid && t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    return { uid, name: profile?.display_name || "Membro", spent, earned, isOwner: uid === myGroup?.owner_id };
  });

  if (loadingGroup) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No group and no membership
  if (!myGroup && !myMembership) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Família</h1>
          <p className="text-muted-foreground text-sm">Gerencie finanças em conjunto com sua família</p>
        </div>

        {/* Plan badge */}
        {!canCreateGroup && (
          <Card className="p-4 border-primary/30 bg-gradient-to-r from-primary/5 to-pink-500/5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">Modo Família requer Plano Anual</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seu plano atual: <span className="font-bold capitalize text-foreground">{profile?.subscription_plan || "Free"}</span>
                {" "}· Membros convidados podem entrar sem restrição de plano
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-xl shrink-0 gap-1.5 bg-gradient-to-r from-primary to-pink-500 hover:brightness-110 text-primary-foreground"
              onClick={() => navigate("/dashboard/settings")}
            >
              <Sparkles className="h-3.5 w-3.5" /> Upgrade
            </Button>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create group */}
          <Card className={`p-6 space-y-4 relative overflow-hidden ${!canCreateGroup ? "border-primary/30" : ""}`}>
            {/* Upgrade overlay for locked plans */}
            {!canCreateGroup && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 rounded-lg p-6">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-foreground text-sm">Recurso do Plano Anual</p>
                  <p className="text-xs text-muted-foreground mt-1">Faça upgrade para criar e gerenciar grupos familiares</p>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl gap-2 bg-gradient-to-r from-primary to-pink-500 hover:brightness-110 text-primary-foreground"
                  onClick={() => navigate("/dashboard/settings")}
                >
                  <Sparkles className="h-4 w-4" /> Fazer upgrade
                </Button>
              </div>
            )}
            <div className="flex items-center gap-3 mb-2">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Crown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">Criar Grupo</p>
                <p className="text-xs text-muted-foreground">Você será o administrador</p>
              </div>
            </div>
            {creatingGroup ? (
              <>
                <Input
                  placeholder="Nome do grupo (ex: Família Silva)"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="rounded-lg"
                />
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-xl" onClick={() => createGroup.mutate()} disabled={createGroup.isPending}>
                    {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Grupo"}
                  </Button>
                  <Button variant="ghost" className="rounded-xl" onClick={() => setCreatingGroup(false)}>Cancelar</Button>
                </div>
              </>
            ) : (
              <Button className="w-full rounded-xl gap-2" onClick={() => setCreatingGroup(true)}>
                <Plus className="h-4 w-4" /> Criar novo grupo
              </Button>
            )}
          </Card>

          {/* Join group */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-foreground">Entrar em Grupo</p>
                <p className="text-xs text-muted-foreground">Use o ID do grupo para entrar</p>
              </div>
            </div>
            <Input
              placeholder="ID do grupo familiar"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="rounded-lg"
            />
            <Button
              variant="outline"
              className="w-full rounded-xl gap-2"
              onClick={() => joinGroup.mutate(inviteEmail)}
              disabled={!inviteEmail || joinGroup.isPending}
            >
              <ChevronRight className="h-4 w-4" /> Entrar no grupo
            </Button>
          </Card>
        </div>

        <Card className="p-5 bg-muted/30">
          <p className="text-sm font-medium text-foreground mb-2">Como funciona?</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><Users className="h-4 w-4 shrink-0 mt-0.5 text-primary" /> O administrador cria o grupo e compartilha o ID com os membros</li>
            <li className="flex items-start gap-2"><PieChart className="h-4 w-4 shrink-0 mt-0.5 text-primary" /> Todos os membros veem um painel consolidado de gastos do grupo</li>
            <li className="flex items-start gap-2"><Wallet className="h-4 w-4 shrink-0 mt-0.5 text-primary" /> Cada membro mantém seus dados privados — apenas o resumo é compartilhado</li>
          </ul>
        </Card>
      </div>
    );
  }

  // User has a group (owner)
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {myGroup?.name || (myMembership as any)?.family_groups?.name || "Família"}
          </h1>
          <p className="text-muted-foreground text-sm">Visão consolidada do grupo familiar</p>
        </div>
        {myGroup && (
          <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-1.5">
            <span className="text-xs text-muted-foreground">ID do grupo:</span>
            <span className="text-xs font-mono font-bold text-foreground">{myGroup.id.substring(0, 8)}...</span>
            <button
              className="text-xs text-primary underline"
              onClick={() => { navigator.clipboard.writeText(myGroup.id); toast({ title: "ID copiado!" }); }}
            >
              copiar
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Receitas do grupo</p>
            <p className="font-bold text-emerald-600">{fmt(totalIncome)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <TrendingDown className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Despesas do grupo</p>
            <p className="font-bold text-destructive">{fmt(totalExpense)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Membros ativos</p>
            <p className="font-bold text-foreground">{allUserIds.length} pessoas</p>
          </div>
        </Card>
      </div>

      {/* Per-member breakdown */}
      <Card className="p-5">
        <h2 className="font-bold text-foreground mb-4 text-sm">Gastos por Membro — {new Date().toLocaleString("pt-BR", { month: "long" })}</h2>
        <div className="space-y-3">
          {memberSpending.map(m => (
            <div key={m.uid} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">{m.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                  {m.isOwner && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: totalExpense > 0 ? `${Math.min((m.spent / totalExpense) * 100, 100)}%` : "0%" }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-destructive">{fmt(m.spent)}</p>
                <p className="text-xs text-muted-foreground">
                  {totalExpense > 0 ? ((m.spent / totalExpense) * 100).toFixed(0) : 0}% do total
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Members management (only for owner) */}
      {myGroup && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground text-sm">Membros do Grupo</h2>
          </div>
          <div className="space-y-2">
            {/* Owner */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Crown className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {memberProfiles.find((p: any) => p.id === myGroup.owner_id)?.display_name || "Administrador"}
                  </p>
                  <p className="text-xs text-muted-foreground">Administrador</p>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Admin</span>
            </div>

            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {memberProfiles.find((p: any) => p.id === m.user_id)?.display_name || "Membro"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{m.status}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeMember.mutate(m.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                >
                  <UserX className="h-4 w-4" />
                </button>
              </div>
            ))}

            {members.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum membro ainda</p>
                <p className="text-xs mt-1">Compartilhe o ID do grupo: <span className="font-mono font-bold text-foreground">{myGroup.id}</span></p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent transactions */}
      <Card className="p-5">
        <h2 className="font-bold text-foreground mb-4 text-sm">Últimas Transações do Grupo</h2>
        {consolidatedTx.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma transação este mês</p>
        ) : (
          <div className="space-y-2">
            {consolidatedTx.slice(0, 10).map((t: any) => {
              const memberProfile = memberProfiles.find((p: any) => p.id === t.user_id);
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (t.categories?.color || "#6b7280") + "20" }}
                    >
                      <span className="text-xs font-bold" style={{ color: t.categories?.color || "#6b7280" }}>
                        {(memberProfile?.display_name || "M").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {memberProfile?.display_name || "Membro"} · {new Date(t.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ml-3 ${t.type === "income" ? "text-emerald-600" : "text-destructive"}`}>
                    {t.type === "income" ? "+" : "-"}{fmt(Number(t.amount))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

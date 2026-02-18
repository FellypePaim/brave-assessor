import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Users, Pencil, Shield, Zap, Star, UserCircle2,
  Phone, Calendar, Crown, RefreshCw, ShieldCheck, ShieldOff,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserRow {
  id: string;
  display_name: string | null;
  monthly_income: number | null;
  subscription_plan: string;
  subscription_expires_at: string | null;
  created_at: string;
  phone_number: string | null;   // from whatsapp_links
  role: string;                   // from user_roles
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:       { label: "Gratuito",     color: "bg-muted text-muted-foreground" },
  mensal:     { label: "Mensal",       color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  trimestral: { label: "Trimestral",   color: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  anual:      { label: "Anual",        color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
};

const ROLE_LABELS: Record<string, { label: string; icon: typeof Shield }> = {
  admin: { label: "Admin", icon: ShieldCheck },
  user:  { label: "Usuário", icon: UserCircle2 },
};

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  // Edit modal
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editIncome, setEditIncome] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    // 1. profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, monthly_income, subscription_plan, created_at")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    // 2. whatsapp_links (verified phones)
    const { data: waLinks } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true);

    // 3. subscription_expires_at — fetch separately since types may not include it
    const { data: expiryData } = await supabase
      .from("profiles")
      .select("id, subscription_expires_at" as any);

    // 4. user_roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const waMap = new Map((waLinks || []).map(w => [w.user_id, w.phone_number]));
    const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
    const expiryMap = new Map(((expiryData as any[]) || []).map((e: any) => [e.id, e.subscription_expires_at]));

    const rows: UserRow[] = profiles.map(p => ({
      id: p.id,
      display_name: p.display_name,
      monthly_income: p.monthly_income,
      subscription_plan: p.subscription_plan || "free",
      subscription_expires_at: expiryMap.get(p.id) ?? null,
      created_at: p.created_at,
      phone_number: waMap.get(p.id) ?? null,
      role: roleMap.get(p.id) ?? "user",
    }));

    setUsers(rows);
    setFiltered(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Filter logic
  useEffect(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.phone_number || "").includes(q) ||
        u.id.includes(q)
      );
    }
    if (filterPlan !== "all") list = list.filter(u => u.subscription_plan === filterPlan);
    if (filterRole !== "all") list = list.filter(u => u.role === filterRole);
    setFiltered(list);
  }, [search, filterPlan, filterRole, users]);

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditName(u.display_name || "");
    setEditPlan(u.subscription_plan);
    setEditExpiry(u.subscription_expires_at ? u.subscription_expires_at.slice(0, 10) : "");
    setEditRole(u.role);
    setEditIncome(u.monthly_income?.toString() || "");
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);

    // Update profile
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        display_name: editName,
        subscription_plan: editPlan as any,
        monthly_income: parseFloat(editIncome) || 0,
        subscription_expires_at: editExpiry ? new Date(editExpiry).toISOString() : null,
      } as any)
      .eq("id", editUser.id);

    if (profileErr) {
      toast({ title: "Erro", description: profileErr.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Update role: delete old, insert new
    if (editRole !== editUser.role) {
      await supabase.from("user_roles").delete().eq("user_id", editUser.id);
      await supabase.from("user_roles").insert({ user_id: editUser.id, role: editRole as any });
    }

    toast({ title: "Usuário atualizado!", description: `${editName} foi salvo com sucesso.` });
    setSaving(false);
    setEditUser(null);
    fetchUsers();
  };

  const planStyle = (plan: string) => PLAN_LABELS[plan] || PLAN_LABELS.free;
  const isExpired = (u: UserRow) =>
    u.subscription_expires_at && new Date(u.subscription_expires_at) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {users.length} usuário(s)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome, telefone ou ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-full sm:w-44">
              <Crown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Plano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os planos</SelectItem>
              <SelectItem value="free">Gratuito</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="trimestral">Trimestral</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-full sm:w-40">
              <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Cargo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cargos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Usuário</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cargo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expiração</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cadastro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum usuário encontrado.</td></tr>
              ) : filtered.map((u, i) => {
                const RoleIcon = ROLE_LABELS[u.role]?.icon ?? UserCircle2;
                const ps = planStyle(u.subscription_plan);
                const expired = isExpired(u);
                return (
                  <tr key={u.id} className={`border-b border-border transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                          {(u.display_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.display_name || <span className="text-muted-foreground italic">Sem nome</span>}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-3">
                      {u.phone_number ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="font-mono text-xs">{u.phone_number}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <RoleIcon className={`h-3.5 w-3.5 shrink-0 ${u.role === "admin" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-xs font-medium ${u.role === "admin" ? "text-primary" : "text-foreground"}`}>
                          {ROLE_LABELS[u.role]?.label ?? u.role}
                        </span>
                      </div>
                    </td>
                    {/* Plan */}
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${ps.color}`}>
                        {u.subscription_plan === "anual" && <Star className="h-3 w-3 mr-1" />}
                        {u.subscription_plan === "mensal" && <Zap className="h-3 w-3 mr-1" />}
                        {ps.label}
                      </Badge>
                    </td>
                    {/* Expiry */}
                    <td className="px-4 py-3">
                      {u.subscription_expires_at ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`h-3.5 w-3.5 shrink-0 ${expired ? "text-destructive" : "text-muted-foreground"}`} />
                          <span className={`text-xs ${expired ? "text-destructive font-semibold" : "text-foreground"}`}>
                            {format(new Date(u.subscription_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                            {expired && " ⚠️"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    {/* Edit */}
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="h-8 px-2">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Usuário
            </DialogTitle>
          </DialogHeader>

          {editUser && (
            <div className="space-y-4 py-2">
              {/* User badge */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {(editUser.display_name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{editUser.display_name || "Sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{editUser.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="text-xs">Nome completo</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" />
                </div>

                <div>
                  <Label className="text-xs">Renda mensal (R$)</Label>
                  <Input type="number" value={editIncome} onChange={e => setEditIncome(e.target.value)} className="mt-1" placeholder="0.00" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Plano</Label>
                    <Select value={editPlan} onValueChange={setEditPlan}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Gratuito</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Cargo</Label>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <span className="flex items-center gap-2"><ShieldOff className="h-3.5 w-3.5" /> Usuário</span>
                        </SelectItem>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Admin</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Expiração do plano</Label>
                  <Input
                    type="date"
                    value={editExpiry}
                    onChange={e => setEditExpiry(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Deixe vazio para plano sem expiração.</p>
                </div>

                {/* WhatsApp info (read-only) */}
                {editUser.phone_number && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <Phone className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">WhatsApp vinculado</p>
                      <p className="text-xs font-mono text-muted-foreground">{editUser.phone_number}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

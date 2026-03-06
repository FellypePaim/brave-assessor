import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Database, Users, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExportItem {
  label: string;
  description: string;
  payload: Record<string, string>;
  icon: React.ReactNode;
  group: string;
}

const EXPORTS: ExportItem[] = [
  // Database tables
  { label: "Perfis (profiles)", description: "Dados de perfil de todos os usuários", payload: { table: "profiles" }, icon: <Users className="h-4 w-4" />, group: "Database" },
  { label: "Roles (user_roles)", description: "Papéis de acesso dos usuários", payload: { table: "user_roles" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Carteiras (wallets)", description: "Todas as carteiras", payload: { table: "wallets" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Cartões (cards)", description: "Todos os cartões de crédito", payload: { table: "cards" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Categorias (categories)", description: "Categorias e limites de orçamento", payload: { table: "categories" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Transações (transactions)", description: "Todas as transações", payload: { table: "transactions" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Recorrências (recurring_transactions)", description: "Transações recorrentes", payload: { table: "recurring_transactions" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Metas (financial_goals)", description: "Metas financeiras", payload: { table: "financial_goals" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Lembretes (reminders)", description: "Lembretes configurados", payload: { table: "reminders" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Chat IA (chat_messages)", description: "Histórico do chat com IA", payload: { table: "chat_messages" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Grupos Familiares", description: "Grupos de família", payload: { table: "family_groups" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Membros Familiares", description: "Membros dos grupos", payload: { table: "family_memberships" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Conversas de Suporte", description: "Tickets de suporte", payload: { table: "support_conversations" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "Mensagens de Suporte", description: "Mensagens dos tickets", payload: { table: "support_messages" }, icon: <Database className="h-4 w-4" />, group: "Database" },
  { label: "WhatsApp Links", description: "Vinculações de WhatsApp", payload: { table: "whatsapp_links" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Pendentes", description: "Transações pendentes do WhatsApp", payload: { table: "whatsapp_pending_transactions" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Sessões", description: "Sessões ativas do bot", payload: { table: "whatsapp_sessions" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },
  { label: "WhatsApp Rate Limits", description: "Limites de taxa por número", payload: { table: "whatsapp_rate_limits" }, icon: <Database className="h-4 w-4" />, group: "WhatsApp" },

  // Auth users
  { label: "Usuários Auth", description: "Todos os usuários registrados (email, data, etc)", payload: { type: "auth_users" }, icon: <Users className="h-4 w-4" />, group: "Usuários" },

  // Storage
  { label: "Storage Buckets", description: "Lista de buckets de armazenamento", payload: { type: "storage_buckets" }, icon: <HardDrive className="h-4 w-4" />, group: "Storage" },
  { label: "Arquivos (support-attachments)", description: "Arquivos no bucket de suporte", payload: { type: "storage_files", table: "support-attachments" }, icon: <HardDrive className="h-4 w-4" />, group: "Storage" },
];

function downloadCsv(csv: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminExport() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (item: ExportItem) => {
    const key = item.label;
    setLoading(key);
    try {
      const { data, error } = await supabase.functions.invoke("admin-export-data", {
        body: item.payload,
      });

      if (error) throw error;

      // data comes as text
      const csv = typeof data === "string" ? data : await (data as Blob).text?.() || JSON.stringify(data);
      
      if (!csv || csv.trim().length === 0) {
        toast.info("Nenhum dado encontrado para exportar.");
        return;
      }

      const filename = (item.payload.table || item.payload.type || "export").replace(/[^a-z0-9_-]/gi, "_");
      downloadCsv(csv, `${filename}_${new Date().toISOString().slice(0, 10)}`);
      toast.success(`${item.label} exportado com sucesso!`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao exportar");
    } finally {
      setLoading(null);
    }
  };

  const handleExportAll = async () => {
    setLoading("ALL");
    for (const item of EXPORTS) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-export-data", {
          body: item.payload,
        });
        if (error) continue;
        const csv = typeof data === "string" ? data : await (data as Blob).text?.() || "";
        if (csv && csv.trim().length > 0) {
          const filename = (item.payload.table || item.payload.type || "export").replace(/[^a-z0-9_-]/gi, "_");
          downloadCsv(csv, `${filename}_${new Date().toISOString().slice(0, 10)}`);
        }
      } catch {
        // continue
      }
    }
    toast.success("Exportação completa!");
    setLoading(null);
  };

  const groups = [...new Set(EXPORTS.map((e) => e.group))];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exportar Dados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exporte todos os dados do sistema em formato CSV
          </p>
        </div>
        <Button onClick={handleExportAll} disabled={!!loading} className="gap-2">
          {loading === "ALL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Tudo
        </Button>
      </div>

      {groups.map((group) => (
        <Card key={group}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{group}</CardTitle>
            <CardDescription>
              {group === "Database" && "Tabelas do banco de dados"}
              {group === "WhatsApp" && "Dados de integração WhatsApp"}
              {group === "Usuários" && "Dados de autenticação"}
              {group === "Storage" && "Arquivos e buckets de armazenamento"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {EXPORTS.filter((e) => e.group === group).map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground">{item.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport(item)}
                    disabled={!!loading}
                    className="gap-1.5 shrink-0"
                  >
                    {loading === item.label ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    CSV
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

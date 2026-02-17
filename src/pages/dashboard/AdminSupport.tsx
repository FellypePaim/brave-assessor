import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function AdminSupport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch all conversations
  useEffect(() => {
    const fetchConvs = async () => {
      const { data } = await supabase
        .from("support_conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      if (data) {
        setConversations(data);
        // Fetch profile names
        const userIds = [...new Set(data.map((c) => c.user_id))];
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", userIds);
          if (profs) {
            const map: Record<string, string> = {};
            profs.forEach((p) => { map[p.id] = p.display_name || "Usuário"; });
            setProfiles(map);
          }
        }
      }
    };
    fetchConvs();

    // Realtime for new conversations
    const channel = supabase
      .channel("admin-support-convs")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_conversations",
      }, () => { fetchConvs(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch messages for active conversation
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", activeConv)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`admin-msgs-${activeConv}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `conversation_id=eq.${activeConv}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeConvData = conversations.find((c) => c.id === activeConv);

  const sendMessage = async () => {
    if (!input.trim() || !activeConv || !user) return;
    setLoading(true);
    const { error } = await supabase
      .from("support_messages")
      .insert({ conversation_id: activeConv, sender_id: user.id, content: input.trim() });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setInput("");
    setLoading(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversations list */}
      <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm text-foreground">Atendimentos</h3>
          <p className="text-xs text-muted-foreground">{conversations.length} conversa(s)</p>
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConv(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${activeConv === c.id ? "bg-accent" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {profiles[c.user_id] || "Usuário"}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.subject}</p>
                  </div>
                </div>
                <Badge variant={c.status === "open" ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {c.status === "open" ? "Aberto" : "Fechado"}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecione um atendimento</p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-foreground">
                  {profiles[activeConvData?.user_id || ""] || "Usuário"}
                </h3>
                <p className="text-xs text-muted-foreground">{activeConvData?.subject}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {messages.map((m) => {
                const isAdmin = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {m.content}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Responder..."
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              />
              <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Plus, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Conversation {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function SupportChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  useEffect(() => {
    if (!user) return;
    const fetchConvs = async () => {
      const { data } = await supabase
        .from("support_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (data) setConversations(data);
    };
    fetchConvs();
  }, [user]);

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

    // Realtime subscription
    const channel = supabase
      .channel(`support-msgs-${activeConv}`)
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

  const createConversation = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ user_id: user.id, subject: "Novo atendimento" })
      .select()
      .single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setConversations((prev) => [data, ...prev]);
    setActiveConv(data.id);
  };

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
      <Card className="w-72 shrink-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Conversas</h3>
          <Button size="icon" variant="ghost" onClick={createConversation} className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">Nenhuma conversa ainda</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConv(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${activeConv === c.id ? "bg-accent" : ""}`}
            >
              <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
              <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecione ou crie uma conversa</p>
            <Button onClick={createConversation} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Nova conversa
            </Button>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground">Suporte Nylo</h3>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {messages.map((m) => {
                const isMe = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
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
                placeholder="Digite sua mensagem..."
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

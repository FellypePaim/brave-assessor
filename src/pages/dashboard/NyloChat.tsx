import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Wallet, TrendingDown, Utensils, Truck, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nylo-chat`;

const WELCOME_MSG: Msg = {
  role: "assistant",
  content: `Olá! 👋 Sou o Nox IA, seu assessor financeiro pessoal!

Estou aqui para te ajudar com qualquer dúvida sobre suas finanças:
• "Quanto gastei com delivery este mês?"
• "Como estão meus orçamentos?"
• "Quanto tenho investido?"
• "Comparar com mês passado"

Pergunte o que quiser! 👌`,
};

const quickActions = [
  { icon: Wallet, label: "Quanto posso gastar hoje?" },
  { icon: TrendingDown, label: "Estou no prejuízo esse mês?" },
  { icon: Utensils, label: "Quanto gastei com alimentação?" },
  { icon: Truck, label: "Quanto gastei com delivery?" },
  { icon: Car, label: "Quanto gastei com transporte?" },
];

export default function NyloChat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      // Only send non-welcome messages to API
      const apiMessages = newMessages
        .filter((_, i) => i > 0 || newMessages[0] !== WELCOME_MSG)
        .filter((m) => m !== WELCOME_MSG)
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        toast({ title: "Erro", description: err.error, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > 1 && last !== WELCOME_MSG) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Erro", description: "Não foi possível conectar ao Nox IA", variant: "destructive" });
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Nox IA</h1>
          <p className="text-sm text-muted-foreground">Pergunte qualquer coisa sobre suas finanças</p>
        </div>
      </div>

      {/* Messages */}
      <Card className="flex-1 overflow-auto p-4 space-y-4 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-3`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <div className="bg-muted px-4 py-3 rounded-2xl">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </Card>

      {/* Quick actions */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
        {quickActions.map((a, i) => (
          <button
            key={i}
            onClick={() => sendMessage(a.label)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card text-sm text-foreground whitespace-nowrap hover:bg-muted transition-colors shrink-0 disabled:opacity-50"
          >
            <a.icon className="h-4 w-4 text-primary" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/40" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre suas finanças..."
            className="pl-10"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            disabled={isLoading}
          />
        </div>
        <Button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          size="icon"
          className="bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

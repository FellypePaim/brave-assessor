import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Wallet, TrendingDown, Utensils, Truck, Car, Bot, ImagePlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

type Msg = { role: "user" | "assistant"; content: string; imagePreview?: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nylo-chat`;

const WELCOME_MSG: Msg = {
  role: "assistant",
  content: `Olá! 👋 Sou o **Nox IA**, seu assessor financeiro pessoal!

Estou aqui para te ajudar com qualquer dúvida sobre suas finanças:

💬 *"Quanto gastei com delivery este mês?"*
📊 *"Como estão meus orçamentos?"*
💰 *"Quanto tenho investido?"*
📸 *Envie a foto de um comprovante para registrar!*

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
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setSelectedImage({ base64, mimeType: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const sendMessage = async (text: string) => {
    if ((!text.trim() && !selectedImage) || isLoading) return;

    const displayText = text.trim() || (selectedImage ? "📸 Comprovante enviado" : "");
    const userMsg: Msg = {
      role: "user",
      content: displayText,
      imagePreview: selectedImage?.preview,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    const imageToSend = selectedImage;
    setSelectedImage(null);
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const apiMessages = newMessages
        .filter((m) => m !== WELCOME_MSG)
        .map((m) => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = { messages: apiMessages };
      if (imageToSend) {
        body.imageBase64 = imageToSend.base64;
        body.imageMimeType = imageToSend.mimeType;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
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

  const showQuickActions = messages.length <= 1;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
        <div className="relative">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border-2 border-background" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">Nox IA</h1>
          <p className="text-xs text-muted-foreground">Seu assessor financeiro pessoal</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1 mb-4 scrollbar-hide">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2.5`}
            >
              {m.role === "assistant" && (
                <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                    : "bg-card border border-border rounded-2xl rounded-bl-md shadow-sm"
                }`}
              >
                {/* Image preview in user message */}
                {m.imagePreview && (
                  <img
                    src={m.imagePreview}
                    alt="Comprovante"
                    className="rounded-xl mb-2 max-h-48 w-auto object-cover"
                  />
                )}
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5 items-center h-5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      {showQuickActions && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-2 overflow-x-auto pb-3 mb-2 scrollbar-hide"
        >
          {quickActions.map((a, i) => (
            <button
              key={i}
              onClick={() => sendMessage(a.label)}
              disabled={isLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground whitespace-nowrap hover:border-primary/40 hover:bg-accent/50 transition-all duration-200 shrink-0 disabled:opacity-50 shadow-sm"
            >
              <a.icon className="h-3.5 w-3.5 text-primary" />
              {a.label}
            </button>
          ))}
        </motion.div>
      )}

      {/* Image preview */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 mb-2 p-2 bg-card border border-border rounded-xl"
          >
            <img src={selectedImage.preview} alt="Preview" className="h-12 w-12 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">📸 Comprovante selecionado</p>
              <p className="text-xs text-muted-foreground">Adicione uma descrição ou envie direto</p>
            </div>
            <button
              onClick={() => setSelectedImage(null)}
              className="h-6 w-6 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/20 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex gap-2 pt-2 border-t border-border">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Image button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="h-11 w-11 rounded-xl border-border bg-card shrink-0 hover:border-primary/40 hover:bg-accent/50 transition-all"
          title="Enviar comprovante"
        >
          <ImagePlus className="h-4 w-4 text-muted-foreground" />
        </Button>

        <div className="flex-1 relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedImage ? "Adicione uma descrição (opcional)..." : "Pergunte sobre suas finanças..."}
            className="pl-10 rounded-xl border-border bg-card h-11 text-sm placeholder:text-muted-foreground/50"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            disabled={isLoading}
          />
        </div>

        <Button
          onClick={() => sendMessage(input)}
          disabled={isLoading || (!input.trim() && !selectedImage)}
          size="icon"
          className="h-11 w-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all duration-200 disabled:bg-muted disabled:text-muted-foreground"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

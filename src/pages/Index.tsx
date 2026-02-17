import { useState, useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  MessageSquare, Mic, Camera, Brain, CreditCard, Target, Wallet,
  Users, FileText, Bell, TrendingUp, ChevronRight, Star, Shield,
  Menu, X, CheckCircle2, Phone, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

const WHATSAPP_LINK = "https://wa.me/5511999999999?text=Quero%20começar%20a%20usar%20o%20Nylo%20Assessor";

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut as unknown as [number, number, number, number] } },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: easeOut as unknown as [number, number, number, number] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function WhatsAppCTA({ children = "Começar no WhatsApp", className = "", size = "default" }: { children?: string; className?: string; size?: "default" | "sm" | "lg" | "icon" }) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => {
      window.open(WHATSAPP_LINK, "_blank");
      setClicked(false);
    }, 600);
  };

  return (
    <Button
      size={size}
      onClick={handleClick}
      className={`rounded-full bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 ${className}`}
    >
      {clicked ? (
        <span className="flex items-center gap-2">
          <Phone className="h-4 w-4 animate-pulse" /> Abrindo WhatsApp…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> {children}
        </span>
      )}
    </Button>
  );
}

/* ─── HEADER ─── */
function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "O que é", href: "#o-que-e" },
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Funcionalidades", href: "#funcionalidades" },
    { label: "Planos", href: "#planos" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <a href="#" className="flex items-center gap-2 font-bold text-xl text-foreground">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-extrabold">N</div>
          Nylo
        </a>
        <nav className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <WhatsAppCTA size="sm" />
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-foreground" aria-label="Menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="md:hidden border-t border-border bg-background px-4 pb-4">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
          <WhatsAppCTA className="w-full mt-2" />
        </motion.div>
      )}
    </header>
  );
}

/* ─── HERO ─── */
function Hero() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const mockY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.3]);

  return (
    <section ref={heroRef} className="pt-28 pb-16 md:pt-36 md:pb-24 relative overflow-hidden">
      <div className="container mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial="hidden" animate="visible" variants={stagger} style={{ y: heroY, opacity: heroOpacity }}>
          <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-foreground">
            Assistente Financeiro no{" "}
            <span className="text-primary">WhatsApp</span> com Inteligência Artificial
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 text-lg text-muted-foreground max-w-lg">
            Controle suas finanças pessoais de forma automática pelo WhatsApp. Registre gastos por texto, áudio ou foto e receba insights personalizados da nossa IA.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-4">
            <WhatsAppCTA size="lg" />
            <Button variant="outline" size="lg" className="rounded-full" asChild>
              <a href="#como-funciona">
                Ver como funciona <ChevronRight className="h-4 w-4" />
              </a>
            </Button>
          </motion.div>
        </motion.div>

        {/* WhatsApp chat mock */}
        <motion.div initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: 0.3, duration: 0.7, ease: "easeOut" }} style={{ y: mockY }} className="relative mx-auto w-full max-w-sm">
          <div className="rounded-3xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
            <div className="bg-primary/10 px-5 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">N</div>
              <div>
                <p className="text-sm font-semibold text-foreground">Nylo Assessor</p>
                <p className="text-xs text-muted-foreground">online</p>
              </div>
            </div>
            <div className="p-4 space-y-3 min-h-[260px] bg-secondary/30">
              {/* user message */}
              <div className="flex justify-end">
                <div className="bg-primary/15 text-foreground text-sm rounded-2xl rounded-br-md px-4 py-2.5 max-w-[75%]">
                  gastei 45 no mercado
                </div>
              </div>
              {/* bot reply */}
              <div className="flex justify-start">
                <div className="bg-card border border-border text-foreground text-sm rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%] shadow-sm">
                  <p>✅ Registrado!</p>
                  <p className="mt-1"><strong>R$ 45,00</strong> — Mercado</p>
                  <p className="text-xs text-muted-foreground mt-1">📂 Categoria: Alimentação</p>
                  <p className="text-xs text-muted-foreground">💡 Você já gastou 78% do orçamento de alimentação este mês.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── O QUE É ─── */
function WhatIs() {
  return (
    <section id="o-que-e" className="py-16 md:py-24 bg-secondary/30">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="container mx-auto px-4 max-w-3xl text-center">
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground">
          O que é o Nylo Assessor?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-6 text-muted-foreground text-lg leading-relaxed">
          O Nylo combina a praticidade do WhatsApp com inteligência artificial para transformar a maneira como você cuida do seu dinheiro. Sem planilhas complicadas, sem apps que você esquece de abrir.
        </motion.p>
        <motion.p variants={fadeUp} className="mt-4 text-muted-foreground text-lg leading-relaxed">
          É como conversar com um amigo que entende de finanças: você manda uma mensagem e ele organiza tudo pra você, sem julgamento e com dicas práticas.
        </motion.p>
      </motion.div>
    </section>
  );
}

/* ─── COMO FUNCIONA ─── */
const steps = [
  { icon: MessageSquare, title: "Mande um zap", desc: "Envie seus gastos por texto, áudio ou foto de comprovante." },
  { icon: Brain, title: "A IA registra tudo", desc: "O Nylo categoriza, organiza e salva automaticamente." },
  { icon: FileText, title: "Veja seus relatórios", desc: "Relatórios organizados por categoria, semana e mês." },
  { icon: Bell, title: "Receba alertas", desc: "Alertas inteligentes antes de estourar o orçamento." },
];

function HowItWorks() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], [-30, 30]);

  return (
    <section id="como-funciona" className="py-16 md:py-24 relative overflow-hidden" ref={ref}>
      <motion.div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent pointer-events-none" style={{ y: bgY }} />
      <div className="container mx-auto px-4 relative">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Como Funciona o Controle Financeiro pelo WhatsApp
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div key={i} variants={fadeScale}>
              <Card className="h-full border-border bg-card hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300">
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-accent text-accent-foreground">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-bold text-primary">Passo {i + 1}</span>
                  <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FUNCIONALIDADES ─── */
const features = [
  { icon: MessageSquare, label: "Registro via WhatsApp (texto, áudio, foto)" },
  { icon: Brain, label: "IA comportamental com insights" },
  { icon: CreditCard, label: "Controle de cartões" },
  { icon: Target, label: "Metas financeiras" },
  { icon: Wallet, label: "Orçamentos por categoria" },
  { icon: Bell, label: "Contas a pagar" },
  { icon: Users, label: "Modo família (até 5 membros)" },
  { icon: FileText, label: "Relatórios (PDF e Excel)" },
  { icon: Bell, label: "Alertas proativos" },
  { icon: TrendingUp, label: "Análise de padrões de gasto" },
];

function Features() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const sectionY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section id="funcionalidades" className="py-16 md:py-24 bg-secondary/30 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-4">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Funcionalidades do App de Finanças com IA
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} style={{ y: sectionY }} className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div key={i} variants={fadeScale} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-foreground">{f.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── SOCIAL PROOF ─── */
function SocialProof() {
  const stats = [
    { icon: Users, value: "+2.000", label: "usuários ativos" },
    { icon: Star, value: "4.9", label: "estrelas" },
    { icon: Shield, value: "100%", label: "seguro com criptografia" },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} className="flex flex-wrap justify-center gap-6">
          {stats.map((s, i) => (
            <motion.div key={i} variants={fadeScale} className="flex items-center gap-3 rounded-full border border-border bg-card px-6 py-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <s.icon className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground">{s.value}</span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }} className="mt-12 max-w-lg mx-auto">
          <Card className="border-border hover:shadow-lg transition-shadow duration-300">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground italic leading-relaxed">
                "Eu nunca consegui manter uma planilha. Com o Nylo, eu só mando um zap e pronto. Já economizei mais de R$ 800 em 3 meses."
              </p>
              <p className="mt-4 text-sm font-semibold text-foreground">— Marina S., São Paulo</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── PLANOS ─── */
const plans = [
  {
    name: "Mensal",
    price: "39,90",
    period: "/mês",
    features: ["Todas as funcionalidades", "Suporte via WhatsApp", "Relatórios ilimitados"],
    highlight: false,
    badge: null,
  },
  {
    name: "Trimestral",
    price: "29,90",
    period: "/mês",
    sub: "R$ 89,70 a cada 3 meses",
    features: ["Tudo do Mensal", "Modo família (2 pessoas)", "Economia de 25%"],
    highlight: false,
    badge: null,
  },
  {
    name: "Anual",
    price: "19,90",
    period: "/mês",
    sub: "R$ 238,80/ano",
    features: ["Tudo do Trimestral", "Modo família (5 pessoas)", "Economia de 50%"],
    highlight: true,
    badge: "Melhor custo-benefício",
  },
];

function Pricing() {
  return (
    <section id="planos" className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Planos e Preços do Nylo Assessor
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mt-12 grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((p, i) => (
            <motion.div key={i} variants={fadeUp} className="relative">
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    {p.badge}
                  </span>
                </div>
              )}
              <Card className={`h-full ${p.highlight ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary" : "border-border"}`}>
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-4xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-muted-foreground">{p.period}</span>
                  </div>
                  {p.sub && <p className="text-xs text-muted-foreground mt-1">{p.sub}</p>}
                  <ul className="mt-6 space-y-3 text-left w-full">
                    {p.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 w-full">
                    <WhatsAppCTA className="w-full" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
        <p className="text-center text-sm text-muted-foreground mt-8">Cancele quando quiser, sem burocracia.</p>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
const faqs = [
  { q: "O Nylo é complicado de usar?", a: "Não! Se você sabe mandar um WhatsApp, já sabe usar o Nylo. Sem instalação, sem configuração complicada." },
  { q: "Preciso entender de finanças?", a: "De jeito nenhum. O Nylo traduz tudo em linguagem simples e te dá dicas práticas, sem jargão financeiro." },
  { q: "Meus dados estão seguros?", a: "Sim. Usamos criptografia de ponta a ponta e seguimos todas as normas da LGPD. Seus dados são só seus." },
  { q: "Posso registrar gastos por voz?", a: "Pode sim! Basta mandar um áudio no WhatsApp e a IA transcreve e registra automaticamente." },
  { q: "Posso usar com minha família?", a: "Claro! Nos planos Trimestral e Anual, você pode adicionar membros da família para controlar as finanças juntos." },
];

function FAQ() {
  return (
    <section id="faq" className="py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-2xl">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Perguntas Frequentes
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mt-10">
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-xl px-4 bg-card">
                <AccordionTrigger className="text-left text-foreground hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── WHY NYLO ─── */
function WhyNylo() {
  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground">
          Por que escolher o Nylo?
        </motion.h2>
        <motion.ul initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mt-8 space-y-4 text-left max-w-md mx-auto">
          {[
            "Suporte humanizado via WhatsApp",
            "Desenvolvido no Brasil, em São Paulo 🇧🇷",
            "+2.000 usuários já organizam suas finanças",
            "4.9 estrelas de avaliação",
          ].map((t, i) => (
            <motion.li key={i} variants={fadeUp} className="flex items-center gap-3 text-muted-foreground">
              <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
              {t}
            </motion.li>
          ))}
        </motion.ul>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mt-10">
          <WhatsAppCTA size="lg" />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FOOTER ─── */
function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="container mx-auto px-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Hubflows Tecnologia Ltda — CNPJ: 49.084.621/0001-90</p>
        <p className="text-sm text-muted-foreground">© 2026 Nylo Assessor. Todos os direitos reservados.</p>
        <div className="flex justify-center gap-4 text-sm">
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Termos de Uso</a>
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacidade</a>
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Exclusão de Dados</a>
        </div>
      </div>
    </footer>
  );
}

/* ─── MARQUEE CAROUSEL ─── */
const marqueeRow1 = [
  { label: "Registros pelo WhatsApp", color: "bg-primary" },
  { label: "IA que entende você", color: "bg-blue-500" },
  { label: "Veja para onde vai seu dinheiro", color: "bg-amber-500" },
  { label: "Receba alertas automáticos", color: "bg-rose-500" },
  { label: "Defina e alcance metas", color: "bg-violet-500" },
  { label: "Mande foto do recibo", color: "bg-emerald-500" },
  { label: "Fale seus gastos por áudio", color: "bg-orange-500" },
  { label: "Controle seus cartões", color: "bg-cyan-500" },
];

const marqueeRow2 = [
  { label: "Relatórios automáticos", color: "bg-rose-500" },
  { label: "Monte orçamentos inteligentes", color: "bg-amber-500" },
  { label: "Acompanhe investimentos", color: "bg-blue-500" },
  { label: "Compartilhe com a família", color: "bg-violet-500" },
  { label: "Controle seus cartões", color: "bg-emerald-500" },
  { label: "Fale seus gastos por áudio", color: "bg-orange-500" },
  { label: "Mande foto do recibo", color: "bg-cyan-500" },
];

function MarqueeChip({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 shadow-sm whitespace-nowrap flex-shrink-0">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

function MarqueeCarousel() {
  return (
    <section className="py-8 md:py-12 overflow-hidden">
      <div className="space-y-4">
        {/* Row 1 - scroll left */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <motion.div
            className="flex gap-4"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 30, ease: "linear", repeat: Infinity }}
          >
            {[...marqueeRow1, ...marqueeRow1].map((item, i) => (
              <MarqueeChip key={i} label={item.label} color={item.color} />
            ))}
          </motion.div>
        </div>
        {/* Row 2 - scroll right */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <motion.div
            className="flex gap-4"
            animate={{ x: ["-50%", "0%"] }}
            transition={{ duration: 35, ease: "linear", repeat: Infinity }}
          >
            {[...marqueeRow2, ...marqueeRow2].map((item, i) => (
              <MarqueeChip key={i} label={item.label} color={item.color} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── PAGE ─── */
const Index = () => (
  <main className="overflow-x-hidden">
    <Header />
    <Hero />
    <MarqueeCarousel />
    <WhatIs />
    <HowItWorks />
    <Features />
    <SocialProof />
    <Pricing />
    <FAQ />
    <WhyNylo />
    <Footer />
  </main>
);

export default Index;

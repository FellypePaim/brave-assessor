import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const NAMES = [
  "Ana Paula S.", "Carlos M.", "Fernanda R.", "João V.", "Mariana C.",
  "Rafael O.", "Beatriz L.", "Lucas A.", "Camila F.", "Diego N.",
  "Juliana P.", "Matheus G.", "Larissa T.", "Gabriel B.", "Priscila H.",
  "Thiago K.", "Amanda W.", "Rodrigo E.", "Natalia Y.", "Felipe Z.",
  "Isabela Q.", "Leandro U.", "Vanessa I.", "André J.", "Débora X.",
  "Bruno D.", "Tatiane V.", "Renato C.", "Adriana M.", "Gustavo S.",
];

const PLANS = ["Brave Mensal", "Brave Anual"];

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

export default function SocialProofToast() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState({ name: "", plan: "" });

  useEffect(() => {
    let showTimeout: ReturnType<typeof setTimeout>;
    let hideTimeout: ReturnType<typeof setTimeout>;

    function schedule() {
      const delay = getRandomInterval(8, 22); // 8–22 seconds
      showTimeout = setTimeout(() => {
        setCurrent({ name: getRandom(NAMES), plan: getRandom(PLANS) });
        setVisible(true);
        hideTimeout = setTimeout(() => {
          setVisible(false);
          schedule(); // Schedule next one
        }, 4500);
      }, delay);
    }

    // Start after initial delay
    const initial = setTimeout(schedule, 5000);

    return () => {
      clearTimeout(initial);
      clearTimeout(showTimeout);
      clearTimeout(hideTimeout);
    };
  }, []);

  return (
    <div className="fixed bottom-6 left-4 z-50 pointer-events-none">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={`${current.name}-${current.plan}`}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-sm shadow-lg shadow-black/10 px-4 py-3 max-w-[280px]"
          >
            {/* Avatar placeholder */}
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
              {current.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
                {current.name}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                Acabou de assinar o <span className="font-medium text-primary">{current.plan}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import braveLogoImg from "@/assets/brave-logo-cropped.png";

export function PWASplashScreen({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    return isStandalone;
  });

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(timer);
  }, [show]);

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            key="pwa-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
          >
            {/* Subtle radial glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle at 50% 40%, hsl(var(--primary) / 0.12) 0%, transparent 60%)",
              }}
            />

            {/* Logo with pulse animation */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10"
            >
              <motion.img
                src={braveLogoImg}
                alt="Brave Assessor"
                className="w-36 h-36 object-contain drop-shadow-lg"
                animate={{ scale: [1, 1.04, 1] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Loading text */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="relative z-10 mt-6 text-sm text-muted-foreground font-medium"
            >
              Preparando suas finanças...
            </motion.p>

            {/* Progress bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="relative z-10 mt-8 w-48 h-1 rounded-full bg-muted overflow-hidden"
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.6, delay: 0.4, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}

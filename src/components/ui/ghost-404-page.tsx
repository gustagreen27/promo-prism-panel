"use client";

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Ghost, X } from "lucide-react";
import { FlowButton } from "@/components/ui/flow-button";

const containerVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.43, 0.13, 0.23, 0.96] as const,
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.43, 0.13, 0.23, 0.96] as const },
  },
};

const numberVariants = {
  hidden: (direction: number) => ({
    opacity: 0,
    x: direction * 40,
    y: 15,
    rotate: direction * 5,
  }),
  visible: {
    opacity: 0.7,
    x: 0,
    y: 0,
    rotate: 0,
    transition: { duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] as const },
  },
};

const ghostVariants = {
  hidden: { scale: 0.8, opacity: 0, y: 15, rotate: -5 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: { duration: 0.6, ease: [0.43, 0.13, 0.23, 0.96] as const },
  },
};

export interface NotFoundProps {
  /** Headline under the 404 figure. */
  title?: string;
  /** Supporting paragraph. */
  description?: string;
  /** Where the primary button sends the user. Default "/". */
  homeHref?: string;
  /** Primary button label. Default "Voltar ao início". */
  homeLabel?: string;
}

export function NotFound({
  title = "Ops! Página não encontrada",
  description = "Esta página virou um fantasma — ela não existe, foi movida ou você não tem acesso a ela.",
  homeHref = "/",
  homeLabel = "Voltar ao início",
}: NotFoundProps) {
  const [showExplanation, setShowExplanation] = React.useState(false);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16"
    >
      {/* 4 — ghost — 4 */}
      <motion.div variants={itemVariants} className="flex items-center gap-2 sm:gap-4">
        <motion.span
          custom={-1}
          variants={numberVariants}
          className="text-[100px] font-bold leading-none text-muted-foreground sm:text-[160px]"
        >
          4
        </motion.span>

        <motion.div
          variants={ghostVariants}
          animate={{
            y: [-6, 6],
            transition: {
              y: { duration: 2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" },
            },
          }}
          whileHover={{
            scale: 1.1,
            rotate: [0, -6, 6, -6, 0],
            transition: { rotate: { duration: 0.9, ease: "easeInOut" } },
          }}
          className="grid h-28 w-28 cursor-pointer place-items-center rounded-full border border-border bg-card shadow-elegant sm:h-40 sm:w-40"
        >
          <Ghost className="h-14 w-14 text-primary sm:h-20 sm:w-20" strokeWidth={1.25} />
        </motion.div>

        <motion.span
          custom={1}
          variants={numberVariants}
          className="text-[100px] font-bold leading-none text-muted-foreground sm:text-[160px]"
        >
          4
        </motion.span>
      </motion.div>

      <motion.h1
        variants={itemVariants}
        className="mt-8 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {title}
      </motion.h1>

      <motion.p
        variants={itemVariants}
        className="mt-3 max-w-md text-center text-sm text-muted-foreground sm:text-base"
      >
        {description}
      </motion.p>

      <motion.div variants={itemVariants} className="mt-8">
        <Link to={homeHref}>
          <FlowButton text={homeLabel} />
        </Link>
      </motion.div>

      <motion.button
        variants={itemVariants}
        type="button"
        onClick={() => setShowExplanation(true)}
        className="mt-6 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        O que significa 404?
      </motion.button>

      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm"
            onClick={() => setShowExplanation(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative mx-4 max-w-sm rounded-2xl border border-border bg-card p-6 shadow-elegant"
            >
              <button
                type="button"
                onClick={() => setShowExplanation(false)}
                className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base font-semibold text-foreground">Erro 404</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                É o código que o servidor retorna quando o endereço acessado não
                corresponde a nenhuma página — seja porque o link está errado, a
                página foi removida ou o acesso não é permitido no seu perfil.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default NotFound;

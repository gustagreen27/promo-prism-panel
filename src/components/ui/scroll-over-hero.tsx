"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

/* ── types ───────────────────────────────────────────────────── */

export interface ScrollOverHeroProps {
  /** Small pill / label rendered above the title. */
  eyebrow?: React.ReactNode;
  /** Main headline. */
  title: React.ReactNode;
  /** Supporting paragraph under the title. */
  description?: React.ReactNode;
  /** Row of CTA buttons / actions. */
  actions?: React.ReactNode;
  /**
   * The panel that rises and overlaps the pinned title as the page scrolls.
   * Drop in a screenshot, `<img>`, or a custom mock. Falls back to a themed
   * placeholder.
   */
  media?: React.ReactNode;
  /**
   * Total scroll height of the pinned section. Taller = the title stays pinned
   * longer and the media rises more slowly. Default `"220vh"`.
   */
  scrollLength?: string;
  className?: string;
}

/* ── helpers ─────────────────────────────────────────────────── */

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// Title rest padding (px). Must match the `pt-24` class on the title layer so
// the measured title position and the panel peek agree.
const TITLE_PT = 96;
// Gap kept between the resting title and the top of the peeking panel (px).
const PEEK_GAP = 24;
// The panel must show at least this much (px) for the overlap to be worth it;
// otherwise (short/landscape viewports) we stack instead.
const MIN_PEEK = 120;

/* ── pieces ──────────────────────────────────────────────────── */

function TitleStack({
  eyebrow,
  title,
  description,
  actions,
}: Pick<ScrollOverHeroProps, "eyebrow" | "title" | "description" | "actions">) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {eyebrow && <div>{eyebrow}</div>}

      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl md:text-6xl">
        {title}
      </h1>

      {description && (
        <p className="max-w-xl text-base text-muted-foreground text-balance sm:text-lg">
          {description}
        </p>
      )}
      {actions && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

function MediaFrame({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      {children ?? (
        <div className="grid aspect-[16/10] w-full place-items-center bg-muted/40">
          <span className="text-sm text-muted-foreground">
            Replace media
          </span>
        </div>
      )}
    </div>
  );
}

/* ── component ───────────────────────────────────────────────── */

export function ScrollOverHero({
  eyebrow,
  title,
  description,
  actions,
  media,
  scrollLength = "220vh",
  className,
}: ScrollOverHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = React.useRef<HTMLElement>(null);
  const titleRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Measure the real title height so the panel starts *just below it* on every
  // viewport — that's what keeps the CTAs clear of the panel at rest and lets
  // the overlap run on phones too (not just desktop). We stack only when the
  // title nearly fills the viewport (landscape / tiny screens) or for
  // reduced-motion. Starts "stacked" so SSR + first paint match; the layout
  // effect upgrades before paint, so no hydration mismatch and no flash.
  const [state, setState] = React.useState<{
    mode: "stacked" | "overlap";
    peek: number;
  }>({ mode: "stacked", peek: 0 });

  useIsomorphicLayoutEffect(() => {
    if (prefersReducedMotion) {
      setState({ mode: "stacked", peek: 0 });
      return;
    }
    const measure = () => {
      const el = titleRef.current;
      if (!el) return;
      const titleBottom = TITLE_PT + el.offsetHeight;
      if (titleBottom > window.innerHeight - MIN_PEEK) {
        setState((s) =>
          s.mode === "stacked" ? s : { mode: "stacked", peek: 0 },
        );
      } else {
        const peek = Math.round(titleBottom + PEEK_GAP);
        setState((s) =>
          s.mode === "overlap" && s.peek === peek
            ? s
            : { mode: "overlap", peek },
        );
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [prefersReducedMotion]);

  // The title fades and lifts away early; the media rises from its peek to fully
  // cover it. Both finish before the pin releases, so nothing snaps.
  const titleOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const titleScale = useTransform(scrollYProgress, [0, 0.35], [1, 0.92]);
  const titleY = useTransform(scrollYProgress, [0, 0.35], [0, -48]);
  const mediaY = useTransform(
    scrollYProgress,
    [0, 0.5],
    [`${state.peek}px`, "0px"],
  );
  const mediaScale = useTransform(scrollYProgress, [0, 0.5], [0.95, 1]);

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full bg-background", className)}
      style={{ height: state.mode === "overlap" ? scrollLength : "auto" }}
    >
      {state.mode === "overlap" ? (
        <div className="sticky top-0 h-screen overflow-hidden">
          {/* Pinned title — fades and lifts as the media rises over it. */}
          <motion.div
            style={{ opacity: titleOpacity, scale: titleScale, y: titleY }}
            className="absolute inset-x-0 top-0 z-0 px-6 pt-24"
          >
            <div ref={titleRef}>
              <TitleStack
                eyebrow={eyebrow}
                title={title}
                description={description}
                actions={actions}
              />
            </div>
          </motion.div>

          {/* Rising media — higher z-index, so it overlaps the title. */}
          <motion.div
            style={{ y: mediaY, scale: mediaScale }}
            className="absolute inset-x-0 top-0 z-10 px-6 pt-24"
          >
            <MediaFrame>{media}</MediaFrame>
          </motion.div>
        </div>
      ) : (
        // Stacked layout — reduced-motion, landscape/tiny viewports, no-JS.
        <div className="px-6 pt-24 pb-16">
          <div className="mb-12">
            <TitleStack
              eyebrow={eyebrow}
              title={title}
              description={description}
              actions={actions}
            />
          </div>
          <MediaFrame>{media}</MediaFrame>
        </div>
      )}
    </section>
  );
}

export default ScrollOverHero;

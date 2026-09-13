"use client";

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, MessageCircle, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/next-disparos-logo.png.asset.json";

export const SITE_CONTACT = {
  whatsapp: "5511988477426",
  get whatsappUrl() {
    return `https://wa.me/${this.whatsapp}`;
  },
  get whatsappLabel() {
    return "+55 62 93300-3970";
  },
  panelUrl: "https://painel.nextdisparos.com/login",
};

export const SITE_SECTIONS = [
  { id: "inicio", label: "Início" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "recursos", label: "Recursos" },
  { id: "plataforma", label: "Plataforma" },
  { id: "faq", label: "Perguntas frequentes" },
];

function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = React.useState<string | null>(null);
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0.05, 0.25, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids.join(",")]);
  return active;
}

export function SiteLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Next Disparos"
      className={cn("h-8 w-auto", className)}
      width={160}
      height={32}
    />
  );
}

export function SiteNavbar() {
  const scrolled = useScrolled();
  const active = useActiveSection(SITE_SECTIONS.map((s) => s.id));
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-white/10 bg-ink/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8"
      >
        <a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            go("inicio");
          }}
          className="flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <SiteLogo />
          <span className="sr-only">Next Disparos — início</span>
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {SITE_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(s.id);
                }}
                aria-current={active === s.id ? "true" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  active === s.id && "text-white",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={SITE_CONTACT.panelUrl}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Entrar
          </a>
          <a
            href={SITE_CONTACT.whatsappUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink shadow-elegant transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Falar com especialista
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-mobile-menu"
          className="inline-flex size-10 items-center justify-center rounded-lg border border-white/15 text-white lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
          <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
        </button>
      </nav>

      {open && (
        <div
          id="site-mobile-menu"
          className="lg:hidden border-t border-white/10 bg-ink/95 backdrop-blur-xl"
        >
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {SITE_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.id);
                  }}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-white/80 hover:bg-white/5 hover:text-white"
                >
                  {s.label}
                </a>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2">
              <a
                href={SITE_CONTACT.panelUrl}
                className="rounded-xl border border-white/15 px-4 py-3 text-center text-base font-medium text-white"
              >
                Entrar
              </a>
              <a
                href={SITE_CONTACT.whatsappUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl bg-brand px-4 py-3 text-center text-base font-semibold text-ink"
              >
                Falar com especialista
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <SiteLogo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Plataforma de comunicação em escala: planejamento de campanhas,
            acompanhamento operacional, créditos, usuários e relatórios em um só
            lugar.
          </p>
        </div>

        <nav aria-label="Seções do site">
          <h2 className="text-sm font-semibold text-white">Navegar</h2>
          <ul className="mt-4 space-y-2">
            {SITE_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-white">Plataforma</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={SITE_CONTACT.panelUrl}
                className="inline-flex items-center gap-1 text-white/60 transition-colors hover:text-white"
              >
                Acessar painel <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </li>
            <li>
              <a
                href={SITE_CONTACT.whatsappUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-white/60 transition-colors hover:text-white"
              >
                Suporte no WhatsApp ({SITE_CONTACT.whatsappLabel})
              </a>
            </li>
            <li>
              <Link
                to="/politica-de-privacidade"
                className="text-white/60 transition-colors hover:text-white"
              >
                Política de privacidade
              </Link>
            </li>
            <li>
              <Link
                to="/conformidade"
                className="text-white/60 transition-colors hover:text-white"
              >
                Termos de uso e conformidade
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto w-full max-w-7xl px-4 py-6 text-xs text-white/40 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Next Disparos. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}

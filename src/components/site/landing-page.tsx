"use client";

import { MessageCircle, ArrowRight } from "lucide-react";
import { ScrollOverHero } from "@/components/ui/scroll-over-hero";
import { DashboardMock } from "./site-mockups";
import { SiteFooter, SiteNavbar, SITE_CONTACT } from "./site-shell";
import {
  Audience,
  CapacityBento,
  Comparison,
  Faq,
  Features,
  FinalCta,
  HowItWorks,
  Security,
  Showcase,
  TrustStrip,
} from "./site-sections";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-ink text-white antialiased">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Ir para o conteúdo
      </a>

      <SiteNavbar />

      <main id="conteudo">
        <section id="inicio" className="relative scroll-mt-20 pt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--brand)_16%,transparent),transparent)]"
          />
          <ScrollOverHero
            className="relative bg-transparent"
            eyebrow={
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                Plataforma preparada para operações em escala
              </span>
            }
            title={
              <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Comunicação em escala.{" "}
                <span className="text-brand">Resultados em tempo real.</span>
              </h1>
            }
            description={
              <span className="mx-auto block max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
                Planeje campanhas, acompanhe resultados e centralize sua operação
                em uma plataforma desenvolvida para grandes volumes.
              </span>
            }
            actions={
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <a
                    href="#plataforma"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink shadow-elegant transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
                  >
                    Conhecer a plataforma
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                  <a
                    href={SITE_CONTACT.whatsappUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    Falar com especialista
                  </a>
                </div>
                <p className="text-sm text-white/45">
                  Gestão de campanhas, agendamentos, créditos e relatórios em um só lugar.
                </p>
              </div>
            }
            media={<DashboardMock />}
          />
        </section>

        <TrustStrip />
        <CapacityBento />
        <HowItWorks />
        <Features />
        <Showcase />
        <Comparison />
        <Audience />
        <Security />
        <Faq />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

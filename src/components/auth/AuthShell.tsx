import { Link } from "@tanstack/react-router";
import { ShieldCheck, Zap, BarChart3 } from "lucide-react";
import logoAsset from "@/assets/next-disparos-logo.png.asset.json";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-ink lg:grid-cols-2">
      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <Link to="/login" className="mb-10 block">
            <img src={logoAsset.url} alt="next DISPAROS" className="h-11 w-auto object-contain brightness-110" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-white/50">{subtitle}</p>}
          <div className="mt-8 space-y-6 [&_label]:text-white/70 [&_input]:h-12 [&_input]:rounded-xl [&_input]:border-white/10 [&_input]:bg-white/[0.04] [&_input]:text-white [&_input]:placeholder:text-white/30">
            {children}
            {footer && <div className="pt-2 text-white/50 [&_a]:text-brand [&_a:hover]:underline">{footer}</div>}
          </div>
        </div>
      </div>

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden border-l border-white/5 bg-graphite lg:block">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-brand-dark/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center gap-8 px-14">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            Plataforma operacional
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
            Comunicação em escala. Resultados em tempo real.
          </h2>
          <ul className="max-w-md space-y-4 text-sm text-white/55">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>Operação centralizada, com histórico e permissões por usuário.</span>
            </li>
            <li className="flex gap-3">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>Campanhas agendadas e processamento acompanhado em tempo real.</span>
            </li>
            <li className="flex gap-3">
              <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>Relatórios detalhados de envios, entregas e falhas.</span>
            </li>
          </ul>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Next Disparos
          </p>
        </div>
      </div>
    </div>
  );
}

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
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Left premium panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.15) 0, transparent 40%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2">
          <span className="grid h-11 place-items-center rounded-lg bg-white/95 px-3 py-1.5 backdrop-blur">
            <img src={logoAsset.url} alt="Disparos FR" className="h-7 w-auto object-contain" />
          </span>
        </Link>

        <div className="relative space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight">
              A plataforma oficial para campanhas no WhatsApp Business.
            </h2>
            <p className="mt-3 text-primary-foreground/85">
              Templates aprovados, contatos organizados, envios controlados e relatórios em tempo real.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <span>API oficial da Meta com controle total de opt-in e opt-out.</span>
            </li>
            <li className="flex gap-3">
              <Zap className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Disparos em fila, com pacing inteligente para preservar sua reputação.</span>
            </li>
            <li className="flex gap-3">
              <BarChart3 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Relatórios em tempo real: enviadas, entregues, lidas, respondidas.</span>
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} Disparos FR · Plataforma SaaS para WhatsApp Business.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center justify-center lg:hidden">
            <img src={logoAsset.url} alt="Disparos FR" className="h-9 w-auto object-contain" />
          </Link>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="mt-8 space-y-6">
            {children}
            {footer && <div className="pt-2">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

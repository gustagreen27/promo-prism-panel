"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mockups puramente visuais do produto. Não consultam nem expõem dados reais:
 * todos os valores são fictícios e rotulados como demonstração.
 */

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/60",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
      Demonstração da plataforma
    </span>
  );
}

function MockFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-graphite shadow-elegant-lg",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <span className="truncate text-xs font-medium text-white/60">{title}</span>
        <DemoBadge className="hidden sm:inline-flex" />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
      <figcaption className="sr-only">
        Ilustração demonstrativa da interface da Next Disparos com dados fictícios.
      </figcaption>
    </figure>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "brand" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/45">
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {label}
      </div>
      <p
        className={cn(
          "mt-1.5 text-lg font-semibold tabular-nums sm:text-xl",
          tone === "brand" && "text-brand",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-white",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Gráfico ilustrativo de desempenho ao longo do dia">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-dark/50 to-brand"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/50">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Mockup principal do hero: visão geral do painel. */
export function DashboardMock({ className }: { className?: string }) {
  return (
    <MockFrame title="Painel · Visão geral" className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Capacidade diária" value="500.000" hint="mensagens/dia" icon={Activity} />
        <Metric label="Disparos hoje" value="128.400" hint="processados" icon={Send} />
        <Metric label="Limite disponível" value="371.600" tone="brand" icon={ShieldCheck} />
        <Metric label="Em andamento" value="4" hint="campanhas" icon={CalendarClock} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Desempenho do dia</p>
            <BarChart3 className="size-4 text-white/40" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <Bars values={[12, 22, 30, 26, 38, 44, 40, 52, 47, 58, 50, 62]} />
          </div>
        </div>
        <div className="grid gap-3">
          <Metric label="Enviados" value="128.400" icon={Send} />
          <Metric label="Entregues" value="119.812" tone="brand" icon={CheckCircle2} />
          <Metric label="Falhas" value="3.204" tone="danger" icon={XCircle} />
        </div>
      </div>
    </MockFrame>
  );
}

/** Gestão de campanhas. */
export function CampaignsMock({ className }: { className?: string }) {
  const rows = [
    { name: "Campanha Demonstração A", status: "Em andamento", qty: "42.000", progress: 68, when: "Hoje, 14:30" },
    { name: "Campanha Demonstração B", status: "Agendada", qty: "18.500", progress: 0, when: "Amanhã, 09:00" },
    { name: "Campanha Demonstração C", status: "Concluída", qty: "76.200", progress: 100, when: "Ontem, 18:10" },
  ];
  return (
    <MockFrame title="Painel · Campanhas" className={className}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">{r.name}</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  r.status === "Em andamento" && "bg-brand/15 text-brand",
                  r.status === "Agendada" && "bg-white/10 text-white/70",
                  r.status === "Concluída" && "bg-white/10 text-white/60",
                )}
              >
                {r.status}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/45">
              <span>{r.qty} contatos</span>
              <span>{r.when}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={r.progress} label="Progresso" />
            </div>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

/** Acompanhamento em tempo real. */
export function RealtimeMock({ className }: { className?: string }) {
  return (
    <MockFrame title="Painel · Acompanhamento" className={className}>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Enviados" value="42.000" icon={Send} />
        <Metric label="Entregues" value="39.115" tone="brand" icon={CheckCircle2} />
        <Metric label="Falhas" value="1.180" tone="danger" icon={XCircle} />
        <Metric label="Pendentes" value="1.705" icon={Activity} />
      </div>
      <div className="mt-4 space-y-3">
        <ProgressBar value={68} label="Processamento da campanha" />
        <ProgressBar value={93} label="Taxa de entrega (ilustrativa)" />
      </div>
    </MockFrame>
  );
}

/** Relatórios. */
export function ReportsMock({ className }: { className?: string }) {
  const funnel = [
    { label: "Enviados", value: 100 },
    { label: "Entregues", value: 93 },
    { label: "Lidos", value: 42 },
    { label: "Cliques", value: 9 },
  ];
  return (
    <MockFrame title="Painel · Relatórios" className={className}>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Entrega" value="93%" tone="brand" />
        <Metric label="Leitura" value="42%" />
        <Metric label="Falha" value="2,8%" tone="danger" />
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <Bars values={[18, 26, 34, 30, 42, 48, 44, 55]} />
      </div>
      <div className="mt-4 space-y-2">
        {funnel.map((f) => (
          <ProgressBar key={f.label} value={f.value} label={f.label} />
        ))}
      </div>
    </MockFrame>
  );
}

/** Gestão de equipe. */
export function TeamMock({ className }: { className?: string }) {
  const users = [
    { name: "Usuário demonstração 1", role: "Administrador", active: true },
    { name: "Usuário demonstração 2", role: "Operador", active: true },
    { name: "Usuário demonstração 3", role: "Somente leitura", active: false },
  ];
  return (
    <MockFrame title="Painel · Usuários" className={className}>
      <ul className="divide-y divide-white/10">
        {users.map((u) => (
          <li key={u.name} className="flex items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5">
              <Users className="size-4 text-white/50" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{u.name}</p>
              <p className="text-[11px] text-white/45">{u.role}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                u.active ? "bg-brand/15 text-brand" : "bg-white/10 text-white/50",
              )}
            >
              {u.active ? "Ativo" : "Inativo"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-white/40">
        Permissões por perfil definem o que cada usuário pode visualizar e executar.
      </p>
    </MockFrame>
  );
}

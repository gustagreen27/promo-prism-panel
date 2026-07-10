import type { ReactNode } from "react";
import { HubTabs, type HubTab } from "./hub-tabs";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Sub-abas do hub (Financeiro, Clientes, Relatórios, etc.). */
  tabs?: HubTab[];
}

export function PageHeader({ title, description, actions, tabs }: PageHeaderProps) {
  return (
    <div className="space-y-3">
      {tabs && tabs.length > 0 && <HubTabs tabs={tabs} className="mb-0" />}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
    </div>
  );
}

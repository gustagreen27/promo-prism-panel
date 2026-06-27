// Pequeno utilitário para exportar CSV no browser.
function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : Array.isArray(v) ? v.join("|") : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV<T extends Record<string, any>>(
  rows: T[],
  columns: { key: keyof T | string; label: string; get?: (row: T) => unknown }[],
): string {
  const header = columns.map((c) => esc(c.label)).join(";");
  const body = rows
    .map((r) =>
      columns
        .map((c) => esc(c.get ? c.get(r) : (r as any)[c.key]))
        .join(";"),
    )
    .join("\n");
  // BOM para Excel reconhecer UTF-8
  return "\uFEFF" + header + "\n" + body;
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function participantsLabel(value?: string[] | null): string {
  const list = value ?? [];
  if (list.length === 0) return "";
  if (list.length === 2) return "Gustavo e Cayo";
  return list
    .map((p) => (p === "gustavo" ? "Gustavo" : p === "cayo" ? "Cayo" : p))
    .join(" e ");
}

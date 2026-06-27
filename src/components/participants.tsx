import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users } from "lucide-react";

export type Participant = "gustavo" | "cayo";
export const PARTICIPANTS: { value: Participant; label: string }[] = [
  { value: "gustavo", label: "Gustavo" },
  { value: "cayo", label: "Cayo" },
];

export function participantLabel(p: Participant): string {
  return PARTICIPANTS.find((x) => x.value === p)?.label ?? p;
}

export function ParticipantsBadges({
  value,
  empty = "—",
  size = "sm",
}: {
  value?: Participant[] | null;
  empty?: string;
  size?: "sm" | "xs";
}) {
  const list = value ?? [];
  if (list.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Badge
          key={p}
          variant="secondary"
          className={size === "xs" ? "px-1.5 py-0 text-[10px]" : "text-xs"}
        >
          {participantLabel(p)}
        </Badge>
      ))}
    </div>
  );
}

export function ParticipantsSelect({
  value,
  onChange,
  label = "Participantes",
  className,
}: {
  value: Participant[];
  onChange: (next: Participant[]) => void;
  label?: string;
  className?: string;
}) {
  const toggle = (p: Participant, checked: boolean) => {
    const set = new Set(value);
    if (checked) set.add(p);
    else set.delete(p);
    onChange(PARTICIPANTS.filter((x) => set.has(x.value)).map((x) => x.value));
  };
  const display =
    value.length === 0
      ? "Selecionar..."
      : value.length === PARTICIPANTS.length
        ? "Gustavo e Cayo"
        : value.map(participantLabel).join(", ");

  return (
    <div className={className}>
      {label ? <Label className="mb-1.5 block text-xs">{label}</Label> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full justify-start font-normal">
            <Users className="mr-2 h-3.5 w-3.5" />
            <span className="truncate">{display}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Sócios participantes</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PARTICIPANTS.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.value}
              checked={value.includes(p.value)}
              onCheckedChange={(c) => toggle(p.value, !!c)}
              onSelect={(e) => e.preventDefault()}
            >
              {p.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ParticipantsFilter({
  value,
  onChange,
}: {
  value: Participant[];
  onChange: (next: Participant[]) => void;
}) {
  return (
    <ParticipantsSelect value={value} onChange={onChange} label="" />
  );
}

/** Helpers para filtrar no client */
export function matchesParticipants(
  row: { participants?: Participant[] | null },
  filter: Participant[],
): boolean {
  if (!filter || filter.length === 0) return true;
  const list = row.participants ?? [];
  return filter.every((p) => list.includes(p));
}

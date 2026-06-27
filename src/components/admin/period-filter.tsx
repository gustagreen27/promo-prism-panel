import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/period";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PeriodKey)}>
      <SelectTrigger className="h-9 w-[180px]">
        <SelectValue placeholder="Período" />
      </SelectTrigger>
      <SelectContent>
        {PERIOD_OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

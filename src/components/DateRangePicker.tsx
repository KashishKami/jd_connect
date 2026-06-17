import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DateRangeValue = { from: string; to: string };

type PresetKey =
  | "today"
  | "yesterday"
  | "last2"
  | "last7"
  | "thisWeek"
  | "lastWeek"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "last6Months"
  | "thisYear"
  | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last2", label: "Last 2 days" },
  { key: "last7", label: "Last 7 days" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "last30", label: "Last 30 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last6Months", label: "Last 6 months" },
  { key: "thisYear", label: "This year" },
  { key: "custom", label: "Custom Range" },
];

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(key: PresetKey): { from: string; to: string } | null {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(0, 0, 0, 0);

  switch (key) {
    case "today": return { from: toISO(start), to: toISO(end) };
    case "yesterday": {
      const d = new Date(start); d.setDate(d.getDate() - 1);
      return { from: toISO(d), to: toISO(d) };
    }
    case "last2": {
      const f = new Date(start); f.setDate(f.getDate() - 1);
      return { from: toISO(f), to: toISO(end) };
    }
    case "last7": {
      const f = new Date(start); f.setDate(f.getDate() - 6);
      return { from: toISO(f), to: toISO(end) };
    }
    case "thisWeek": {
      const f = new Date(start);
      const day = (f.getDay() + 6) % 7; // Monday start
      f.setDate(f.getDate() - day);
      return { from: toISO(f), to: toISO(end) };
    }
    case "lastWeek": {
      const f = new Date(start);
      const day = (f.getDay() + 6) % 7;
      f.setDate(f.getDate() - day - 7);
      const t = new Date(f); t.setDate(t.getDate() + 6);
      return { from: toISO(f), to: toISO(t) };
    }
    case "last30": {
      const f = new Date(start); f.setDate(f.getDate() - 29);
      return { from: toISO(f), to: toISO(end) };
    }
    case "thisMonth": {
      const f = new Date(start.getFullYear(), start.getMonth(), 1);
      return { from: toISO(f), to: toISO(end) };
    }
    case "lastMonth": {
      const f = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      const t = new Date(start.getFullYear(), start.getMonth(), 0);
      return { from: toISO(f), to: toISO(t) };
    }
    case "last6Months": {
      const f = new Date(start); f.setMonth(f.getMonth() - 6);
      return { from: toISO(f), to: toISO(end) };
    }
    case "thisYear": {
      const f = new Date(start.getFullYear(), 0, 1);
      return { from: toISO(f), to: toISO(end) };
    }
    default: return null;
  }
}

function detectPreset(value: DateRangeValue): PresetKey {
  for (const p of PRESETS) {
    if (p.key === "custom") continue;
    const r = presetRange(p.key);
    if (r && r.from === value.from && r.to === value.to) return p.key;
  }
  return "custom";
}

function fmtLabel(value: DateRangeValue) {
  if (!value.from || !value.to) return "Pick date range";
  try {
    const f = parseISO(value.from);
    const t = parseISO(value.to);
    if (value.from === value.to) return format(f, "dd-MMM-yyyy");
    return `${format(f, "dd-MMM-yyyy")} – ${format(t, "dd-MMM-yyyy")}`;
  } catch {
    return `${value.from} – ${value.to}`;
  }
}

interface Props {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

export function DateRangePicker({ value, onChange, className, align = "start" }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>(() => detectPreset(value));
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: value.from ? parseISO(value.from) : undefined,
    to: value.to ? parseISO(value.to) : undefined,
  }));

  const label = useMemo(() => fmtLabel(value), [value]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelectedPreset(detectPreset(value));
      setDraft({
        from: value.from ? parseISO(value.from) : undefined,
        to: value.to ? parseISO(value.to) : undefined,
      });
    }
    setOpen(next);
  };

  const apply = () => {
    if (selectedPreset === "custom") {
      if (draft?.from && draft?.to) {
        onChange({ from: toISO(draft.from), to: toISO(draft.to) });
        setOpen(false);
      } else if (draft?.from) {
        onChange({ from: toISO(draft.from), to: toISO(draft.from) });
        setOpen(false);
      }
    } else {
      const r = presetRange(selectedPreset);
      if (r) {
        onChange(r);
        setOpen(false);
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-start font-normal gap-2 min-w-[240px]", className)}
        >
          <CalendarIcon className="h-4 w-4 opacity-70" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex flex-col sm:flex-row">
          <div className="w-full sm:w-44 border-b sm:border-b-0 sm:border-r p-2 max-h-[360px] overflow-y-auto">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setSelectedPreset(p.key);
                  if (p.key !== "custom") {
                    const r = presetRange(p.key);
                    if (r) setDraft({ from: parseISO(r.from), to: parseISO(r.to) });
                  }
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors",
                  selectedPreset === p.key && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selectedPreset === "custom" && (
            <div className="p-2">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={draft}
                onSelect={setDraft}
                defaultMonth={draft?.from ?? new Date()}
                className="pointer-events-auto"
              />
              <p className="text-xs text-muted-foreground px-2 pb-1">
                Click the start date, then click the end date.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-2 border-t">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={apply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

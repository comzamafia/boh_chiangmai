"use client";

/**
 * MenuNamePicker — searchable combobox of REAL PMIX menu item names so users
 * pick the exact name instead of free-typing (which silently mismatches, e.g.
 * a chicken mapping accidentally not matching, or matching the wrong dish).
 *
 * Free text is still allowed (for modifier names not present as menu items),
 * but when `warnUnmatched` is set and the typed value matches no PMIX item
 * name, a warning is shown — this is the signal that a mapping will never hit
 * real sales (or will hit the wrong dish).
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, X, AlertTriangle, Check } from "lucide-react";
import { reportStationsApi, type PmixMenuName } from "@/lib/api";

// Module-level cache so many pickers on one page share a single fetch.
let cache: PmixMenuName[] | null = null;
let inflight: Promise<PmixMenuName[]> | null = null;
function loadMenuNames(): Promise<PmixMenuName[]> {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = reportStationsApi.menuNames()
            .then((r: { items: PmixMenuName[] }) => (cache = r.items ?? []))
            .catch(() => (cache = []));
    }
    return inflight;
}

export default function MenuNamePicker({
    value, onChange, placeholder, warnUnmatched = true,
}: { value: string; onChange: (v: string) => void; placeholder?: string; warnUnmatched?: boolean }) {
    const [names, setNames] = useState<PmixMenuName[]>(cache ?? []);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadMenuNames().then(setNames); }, []);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const query = (open ? q : value).toLowerCase().trim();
    const matches = useMemo(() => {
        if (!query) return names.slice(0, 40);
        return names.filter(n => n.itemName.toLowerCase().includes(query)).slice(0, 40);
    }, [names, query]);

    // Does the current value exactly equal a known PMIX item name?
    const exact = useMemo(
        () => !!value && names.some(n => n.itemName.toLowerCase().trim() === value.toLowerCase().trim()),
        [names, value],
    );
    const showWarn = warnUnmatched && !!value.trim() && names.length > 0 && !exact;

    return (
        <div className="relative" ref={boxRef}>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                    value={open ? q : value}
                    onChange={e => { setQ(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
                    onFocus={() => { setQ(value); setOpen(true); }}
                    placeholder={placeholder ?? "Search menu item…"}
                    className={`pl-8 pr-7 h-9 text-sm ${showWarn ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                />
                {value && (
                    <button type="button" onClick={() => { onChange(""); setQ(""); }}
                        className="absolute right-2 top-2.5 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                )}
            </div>

            {open && (
                <div className="absolute z-30 mt-1 w-full border rounded-lg bg-popover shadow-md max-h-56 overflow-y-auto">
                    {matches.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2.5">No PMIX menu item matches.</p>
                    ) : matches.map(n => {
                        const sel = n.itemName.toLowerCase().trim() === value.toLowerCase().trim();
                        return (
                            <button key={n.itemName} type="button"
                                onClick={() => { onChange(n.itemName); setQ(""); setOpen(false); }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted/50 ${sel ? "bg-primary/10" : ""}`}>
                                <span className="truncate flex items-center gap-1.5">
                                    {sel && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                    {n.itemName}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{n.category} · {n.totalQty}</span>
                            </button>
                        );
                    })}
                    {q.trim() && !names.some(n => n.itemName.toLowerCase().trim() === q.toLowerCase().trim()) && (
                        <button type="button" onClick={() => { onChange(q.trim()); setOpen(false); }}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-t">
                            Use typed name: &ldquo;<strong>{q.trim()}</strong>&rdquo; (for modifiers / not-yet-sold items)
                        </button>
                    )}
                </div>
            )}

            {showWarn && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> No PMIX menu item is named exactly &ldquo;{value}&rdquo; — this mapping won&rsquo;t match any sales (or may be the wrong dish).
                </p>
            )}
        </div>
    );
}

"use client";

/**
 * UsageAuditCard — auto data-quality check for Usage-Report calc settings.
 * Shows duplicates and itemName/modifier mappings that don't match any real
 * PMIX name (typos, dish-name protein rows, etc.). Hidden when all clean.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, RefreshCw, Loader2, Copy, Layers, Link2, Tag } from "lucide-react";
import { usageSettingsApi, type UsageAuditResult } from "@/lib/api";

export default function UsageAuditCard() {
    const [data, setData] = useState<UsageAuditResult | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try { setData(await usageSettingsApi.audit()); }
        catch { setData(null); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <Card><CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking mappings…
        </CardContent></Card>;
    }
    if (!data) return null;

    // All clear
    if (data.total === 0) {
        return (
            <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="w-4 h-4" />
                        {data.havePmix
                            ? <span>All mappings look healthy — no duplicates or unknown menu/modifier names.</span>
                            : <span>No PMIX data yet to cross-check names. Duplicate check passed.</span>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Recheck</Button>
                </CardContent>
            </Card>
        );
    }

    const Section = ({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) => (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="w-3.5 h-3.5 text-amber-600" /> {title}</div>
            <p className="text-[11px] text-muted-foreground -mt-1">{desc}</p>
            <div className="flex flex-wrap gap-1.5">{children}</div>
        </div>
    );
    const chip = (key: number, main: string, sub?: string) => (
        <span key={key} className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-[11px]">
            <span className="font-medium">{main}</span>{sub && <span className="text-muted-foreground">{sub}</span>}
        </span>
    );

    return (
        <Card className="border-amber-300 dark:border-amber-800">
            <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-sm flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                            <ShieldAlert className="w-4 h-4" /> Mapping issues found
                            <Badge variant="outline" className="ml-1">{data.total}</Badge>
                        </CardTitle>
                        <CardDescription className="text-xs">Fix these in the tables below — they cause wrong totals on the Ingredients tab.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Recheck</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {data.duplicates.length > 0 && (
                    <Section icon={Copy} title={`Duplicates (${data.duplicates.length}) — double counting`}
                        desc="Same menu/modifier + ingredient defined more than once. Delete the extra rows.">
                        {data.duplicates.map((d, i) => chip(i, `${d.itemName} → ${d.ingredientName}`, `×${d.count} (${d.type})`))}
                    </Section>
                )}
                {data.modifierNameMismatch.length > 0 && (
                    <Section icon={Tag} title={`Modifier rows that match no PMIX modifier (${data.modifierNameMismatch.length})`}
                        desc="Stored as a modifier but the name isn't a real modifier — usually a protein saved under a dish name. These never fire; convert to a base row or delete.">
                        {data.modifierNameMismatch.map((m, i) => chip(i, m.itemName, `→ ${m.ingredientName}`))}
                    </Section>
                )}
                {data.baseNameMismatch.length > 0 && (
                    <Section icon={Layers} title={`Menu rows that match no PMIX item (${data.baseNameMismatch.length})`}
                        desc="The menu name doesn't exactly match any sold PMIX item (typo, trailing dot, renamed). They won't count until fixed.">
                        {data.baseNameMismatch.map((m, i) => chip(i, m.itemName, `→ ${m.ingredientName}`))}
                    </Section>
                )}
                {data.linkNameMismatch.length > 0 && (
                    <Section icon={Link2} title={`Composite links that match no PMIX item (${data.linkNameMismatch.length})`}
                        desc="The linked menu name isn't a sold PMIX item — the composite won't expand for it.">
                        {data.linkNameMismatch.map((m, i) => chip(i, m.itemName, `· ${m.compositeName}`))}
                    </Section>
                )}
                <p className="text-[10px] text-muted-foreground">
                    Cross-checked against PMIX from the last 365 days ({data.counts.pmixItems} items · {data.counts.pmixModifiers} modifiers).
                </p>
            </CardContent>
        </Card>
    );
}

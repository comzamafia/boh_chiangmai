"use client";
/**
 * StockCountGuide — in-app, step-by-step help for the Physical Stock Count.
 * Opened from a "How to count" button on the Stock Count tab so staff can
 * read it right where they're counting.
 */
import { useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, Boxes, ListChecks, Lightbulb } from "lucide-react";

export default function StockCountGuide() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
                <HelpCircle className="w-4 h-4" /> How to count
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col p-0">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            <ListChecks className="w-5 h-5 text-primary" />
                            Physical Stock Count — Step by Step
                        </DialogTitle>
                    </DialogHeader>

                    <div className="overflow-y-auto px-5 py-4 space-y-6 text-sm leading-relaxed">

                        {/* How units work */}
                        <section className="rounded-xl bg-muted/40 border border-border p-4">
                            <h3 className="font-semibold flex items-center gap-1.5 mb-2">
                                <Boxes className="w-4 h-4 text-amber-600" /> How the units work
                            </h3>
                            <p className="text-muted-foreground">
                                Each ingredient has up to three layers. You count what you SEE; the
                                system converts automatically and stores stock in the recipe unit.
                            </p>
                            <pre className="mt-2 text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
{`1 Pack (Case)  =  packSize × Purchase Unit  =  … × Recipe Unit

Example — Lobster:
  1 Case = 50 lb           (pack size = 50, purchase = lb)
  1 lb   = 16 oz           (conversion = 16, recipe = oz)
  → 1 Case = 50 × 16 = 800 oz   (auto)`}
                            </pre>
                        </section>

                        {/* Part A */}
                        <section>
                            <h3 className="font-semibold text-base mb-2">Part A · One-time setup: pack/case size</h3>
                            <p className="text-muted-foreground mb-2">Do this once per ingredient stored by the case/box/bag. Skip for loose-only items.</p>
                            <ol className="list-decimal pl-5 space-y-1.5">
                                <li>Open <strong>Inventory → Stock Count</strong>.</li>
                                <li>Find the ingredient. If no pack is set, you&apos;ll see a dashed <strong>&quot;Set pack size&quot;</strong> button.</li>
                                <li>Tap it. Enter <strong>Pack name</strong> (e.g. <em>Case</em>, <em>ลัง</em>, <em>Box</em>) and <strong>Size</strong> in the purchase unit (e.g. <em>50</em> = 1 Case of 50 lb).</li>
                                <li>Check the preview: <span className="font-mono text-xs">1 Case = 50 lb = 800 oz</span>. Tap <strong>Save</strong>.</li>
                                <li>An amber chip <span className="font-mono text-xs">1 Case = 50 lb</span> now shows on the card. Tap it any time to edit.</li>
                            </ol>
                        </section>

                        {/* Part B */}
                        <section>
                            <h3 className="font-semibold text-base mb-2">Part B · Counting</h3>
                            <ol className="list-decimal pl-5 space-y-1.5">
                                <li>Open <strong>Inventory → Stock Count</strong>. (Use search to jump to an item if needed.)</li>
                                <li>
                                    Each card has up to three boxes — type exactly what you physically see, in any combination:
                                    <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground">
                                        <li><strong>CASE</strong> — full unopened cases</li>
                                        <li><strong>lb</strong> — loose pounds from opened cases / partial bags</li>
                                        <li><strong>oz</strong> — any small leftover</li>
                                    </ul>
                                </li>
                                <li>Watch the live total: <span className="font-mono text-xs">= 1,764 oz ≈ 110.25 lb · 2.2 Case</span> and the colour-coded <strong>Variance</strong> vs system stock.</li>
                                <li>Progress shows at top (e.g. <em>3 / 24 counted</em>). Counts <strong>auto-save as a draft</strong> — refresh/close won&apos;t lose them.</li>
                                <li>When done, tap <strong>Save Count</strong> in the sticky bar. The system updates stock, logs a Stocktake, and records the variance for the Food Cost report.</li>
                            </ol>
                        </section>

                        {/* Worked example */}
                        <section className="rounded-xl border border-border p-4">
                            <h3 className="font-semibold mb-2">Worked example — a partial case</h3>
                            <p className="text-muted-foreground mb-2">You see 2 full cases, an opened case with ~10 lb left, and a bag with 4 oz.</p>
                            <p>Type: <span className="font-mono text-xs">CASE 2 + lb 10 + oz 4</span></p>
                            <pre className="mt-2 text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
{`2 × (50 × 16) = 1,600 oz
10 × 16       =   160 oz
4             =     4 oz
──────────────────────────
Total         = 1,764 oz   ← saved`}
                            </pre>
                        </section>

                        {/* Tips */}
                        <section>
                            <h3 className="font-semibold flex items-center gap-1.5 mb-2">
                                <Lightbulb className="w-4 h-4 text-amber-500" /> Tips
                            </h3>
                            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                <li>Count top-to-bottom by storage area (walk-in → freezer → dry store) so nothing is missed.</li>
                                <li>Two people — one counts, one types — is faster and more accurate.</li>
                                <li>A big red (negative) variance = less on the shelf than expected → shows as shrinkage in <strong>Reports → Food Cost Variance</strong>.</li>
                                <li>Count at the same time each period (e.g. before opening) for clean comparisons.</li>
                                <li>Make sure the pack size is exact — if a case is 50 lb, set 50 (not 48).</li>
                            </ul>
                        </section>

                    </div>

                    <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
                        <Button onClick={() => setOpen(false)}>Got it</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

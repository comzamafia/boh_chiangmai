/**
 * Thin wrapper that exports the Main Protein Usage heatmap to PDF
 * using the generic heatmap-pdf-export module.
 */
import { exportHeatmapToPDF } from "./heatmap-pdf-export";
import type { ProteinHeatmapResult } from "@/lib/api";

export function exportProteinHeatmapToPDF(data: ProteinHeatmapResult) {
    exportHeatmapToPDF({
        title:    "Main Protein Usage — Last 7 Days",
        subtitle: "from PMIX Sales",
        dates:    data.dates,
        days:     data.days,
        items:    data.items.map(p => ({
            name:         p.proteinType,
            subLabel:     `(${p.unit})`,
            unit:         p.unit,
            byDate:       p.byDate,
            totalQty:     p.totalQty,
            avgPerDay:    p.avgPerDay,
            currentStock: p.currentStock,
            parMin:       p.parMin,
        })),
        filenamePrefix: "MainProteinUsage",
    });
}

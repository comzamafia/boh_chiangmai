/**
 * PDF export for the Main Protein Usage heatmap (Inventory → Usage Trend).
 *
 * Renders a landscape A4 PDF with:
 *   - Title + date range + generated timestamp
 *   - Table: Ingredient | Mon … Sun | Total | Avg/d | 📦 Bal | 🛒 Order
 *   - Per-cell heat shading (red scale relative to each row's own peak)
 *   - Colour-coded Balance + Order columns matching the on-screen rules
 *   - Legend footer
 */
import jsPDF from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";
import type { ProteinHeatmapResult } from "@/lib/api";

// 6-step red palette tuned for print contrast
const HEAT_RGB: [number, number, number][] = [
    [254, 226, 226],   // faint
    [252, 165, 165],
    [248, 113, 113],
    [239, 68, 68],
    [220, 38, 38],
    [153, 27, 27],     // intense
];

function heatRgb(val: number, peak: number): [number, number, number] | null {
    if (!val || !peak) return null;
    const idx = Math.min(HEAT_RGB.length - 1, Math.floor((val / peak) * HEAT_RGB.length));
    return HEAT_RGB[idx];
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);

export function exportProteinHeatmapToPDF(data: ProteinHeatmapResult) {
    if (!data.items.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text("Main Protein Usage — Last 7 Days", 40, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("from PMIX Sales", 40, 56);

    // Right-aligned meta
    const range     = `${data.dates[0]} -> ${data.dates[data.dates.length - 1]}`;
    const generated = `Generated: ${new Date().toLocaleString("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    })}`;
    doc.setFontSize(9);
    doc.text(range,     pageW - 40, 40, { align: "right" });
    doc.text(generated, pageW - 40, 56, { align: "right" });
    doc.setTextColor(0);

    // ── Table data ───────────────────────────────────────────────────────────
    const hasInventory = data.items.some(r => r.currentStock != null);
    const lastDateIdx  = data.dates.length - 1;

    // Pre-compute per-row peak for shading
    const peaks = data.items.map(r => Math.max(...r.byDate, 1));

    // Headers
    const dateHeaders = data.dates.map(iso => {
        const dow = DOW_SHORT[new Date(iso + "T00:00:00").getDay()];
        return `${dow}\n${iso.slice(5)}`;
    });
    const head = [[
        "Ingredient",
        ...dateHeaders,
        "Total",
        "Avg/d",
        ...(hasInventory ? ["Bal\nCt-Sld", "Order"] : []),
    ]];

    // Body
    const body: string[][] = data.items.map(row => {
        const r: string[] = [`${row.proteinType}\n(${row.unit})`];
        for (const q of row.byDate) r.push(q > 0 ? fmt(q) : "-");
        r.push(`${fmt(row.totalQty)} ${row.unit}`);
        r.push(String(row.avgPerDay));
        if (hasInventory) {
            if (row.currentStock == null) {
                r.push("-");
                r.push("-");
            } else {
                const lastSold = row.byDate[lastDateIdx] ?? 0;
                const balance  = row.currentStock - lastSold;
                const parMin   = row.parMin ?? 0;
                const orderQty = parMin - balance;
                r.push(`${fmt(balance)}\n(${fmt(row.currentStock)}-${fmt(lastSold)})`);
                r.push(orderQty > 0
                    ? `+${fmt(Math.ceil(orderQty * 100) / 100)}`
                    : "OK");
            }
        }
        return r;
    });

    // Footer (TOTAL row)
    const footRow: string[] = ["TOTAL"];
    for (let d = 0; d < data.dates.length; d++) {
        const sum = data.items.reduce((s, r) => s + (r.byDate[d] ?? 0), 0);
        footRow.push(sum > 0 ? fmt(sum) : "-");
    }
    const grandTotal = data.items.reduce((s, r) => s + r.totalQty, 0);
    footRow.push(fmt(grandTotal));
    footRow.push((grandTotal / data.days).toFixed(2));
    if (hasInventory) { footRow.push(""); footRow.push(""); }

    const dynColCount = data.dates.length;

    autoTable(doc, {
        startY: 78,
        head,
        body,
        foot: [footRow],
        margin: { left: 40, right: 40 },
        theme: "grid",
        styles: {
            fontSize: 7.5,
            cellPadding: 3,
            lineColor: [220, 220, 220],
            lineWidth: 0.4,
            valign: "middle",
        },
        headStyles: {
            fillColor: [55, 65, 81],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
        },
        footStyles: {
            fillColor: [243, 244, 246],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            halign: "center",
        },
        columnStyles: {
            0: { cellWidth: 110, halign: "left", fontStyle: "bold" },
        },
        didParseCell: (hookData: CellHookData) => {
            const colIdx = hookData.column.index;
            const rowIdx = hookData.row.index;

            // Date columns get heat shading + center align
            const dateColStart = 1;
            const dateColEnd   = dynColCount;
            if (colIdx >= dateColStart && colIdx <= dateColEnd) {
                hookData.cell.styles.halign = "center";
                if (hookData.section === "body") {
                    const peak = peaks[rowIdx];
                    const qty  = data.items[rowIdx]?.byDate[colIdx - 1] ?? 0;
                    const rgb  = heatRgb(qty, peak);
                    if (rgb) {
                        hookData.cell.styles.fillColor = rgb;
                        hookData.cell.styles.textColor = qty / peak > 0.5 ? [255, 255, 255] : [80, 0, 0];
                        hookData.cell.styles.fontStyle = "bold";
                    } else {
                        hookData.cell.styles.textColor = [200, 200, 200];
                    }
                }
            }

            // Total + Avg columns
            const totalCol = dateColEnd + 1;
            const avgCol   = dateColEnd + 2;
            if (colIdx === totalCol || colIdx === avgCol) {
                hookData.cell.styles.halign = "center";
            }

            // Bal + Order (only when hasInventory)
            if (hasInventory && hookData.section === "body") {
                const balCol   = dateColEnd + 3;
                const orderCol = dateColEnd + 4;
                if (colIdx === balCol || colIdx === orderCol) {
                    hookData.cell.styles.halign = "center";
                    const row = data.items[rowIdx];
                    if (row?.currentStock != null) {
                        const lastSold = row.byDate[lastDateIdx] ?? 0;
                        const balance  = row.currentStock - lastSold;
                        const parMin   = row.parMin ?? 0;
                        const colour: [number, number, number] = balance < 0
                            ? [185, 28, 28]
                            : balance < parMin
                                ? [194, 65, 12]
                                : [4, 120, 87];
                        hookData.cell.styles.textColor = colour;
                        hookData.cell.styles.fontStyle = "bold";
                    }
                }
            }
        },
    });

    // ── Legend / footer ──────────────────────────────────────────────────────
    const footerY = pageH - 30;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(
        "Legend: cell shade = relative usage intensity per ingredient | Bal colour: green = stock OK, orange = below PAR Min, red = stockout",
        40, footerY,
    );
    doc.text("Generated by BOH Chiang Mai", pageW - 40, footerY, { align: "right" });

    // ── Save ─────────────────────────────────────────────────────────────────
    const safeFrom = data.dates[0];
    const safeTo   = data.dates[data.dates.length - 1];
    doc.save(`MainProteinUsage_${safeFrom}_to_${safeTo}.pdf`);
}

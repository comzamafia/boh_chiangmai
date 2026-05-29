/**
 * Generic PDF export for any "usage heatmap" data.
 * Used by the Main Protein / Dessert / Beverage / Curry sections in
 * /inventory → Usage Trend.
 *
 * Renders a landscape A4 PDF with:
 *   - Title + subtitle + date range + generated timestamp
 *   - Table: Item | Mon … Sun | Total | Avg/d | 📦 Bal | 🛒 Order
 *   - Per-cell heat shading (relative to each row's own peak)
 *   - Colour-coded Balance + Order matching the on-screen rules
 *   - Legend footer
 */
import jsPDF from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";

const HEAT_RGB: [number, number, number][] = [
    [254, 226, 226],
    [252, 165, 165],
    [248, 113, 113],
    [239, 68, 68],
    [220, 38, 38],
    [153, 27, 27],
];

function heatRgb(val: number, peak: number): [number, number, number] | null {
    if (!val || !peak) return null;
    const idx = Math.min(HEAT_RGB.length - 1, Math.floor((val / peak) * HEAT_RGB.length));
    return HEAT_RGB[idx];
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);

/** Shape any heatmap row must conform to. */
export interface HeatmapPdfRow {
    name:         string;       // ingredient / protein / dessert / curry group / beverage item
    subLabel?:    string;       // optional category text under the name
    unit:         string;
    byDate:       number[];
    totalQty:     number;
    avgPerDay:    number;
    currentStock: number | null;
    parMin:       number | null;
}

export interface HeatmapPdfData {
    title:    string;
    subtitle: string;
    dates:    string[];
    items:    HeatmapPdfRow[];
    days:     number;
    /** File-name prefix (e.g. "MainProteinUsage"). */
    filenamePrefix: string;
}

export function exportHeatmapToPDF(data: HeatmapPdfData) {
    if (!data.items.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(data.title, 40, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(data.subtitle, 40, 56);

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
    const peaks        = data.items.map(r => Math.max(...r.byDate, 1));
    const dynColCount  = data.dates.length;

    const dateHeaders = data.dates.map(iso => {
        const dow = DOW_SHORT[new Date(iso + "T00:00:00").getDay()];
        return `${dow}\n${iso.slice(5)}`;
    });
    const head = [[
        "Item",
        ...dateHeaders,
        "Total",
        "Avg/d",
        ...(hasInventory ? ["Bal\nCt-Sld", "Order"] : []),
    ]];

    const body: string[][] = data.items.map(row => {
        const r: string[] = [row.subLabel ? `${row.name}\n${row.subLabel}` : `${row.name}\n(${row.unit})`];
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
                    ? `Buy +${fmt(Math.ceil(orderQty * 100) / 100)}`
                    : "OK");
            }
        }
        return r;
    });

    const footRow: string[] = ["TOTAL"];
    for (let d = 0; d < data.dates.length; d++) {
        const sum = data.items.reduce((s, r) => s + (r.byDate[d] ?? 0), 0);
        footRow.push(sum > 0 ? fmt(sum) : "-");
    }
    const grandTotal = data.items.reduce((s, r) => s + r.totalQty, 0);
    footRow.push(fmt(grandTotal));
    footRow.push((grandTotal / data.days).toFixed(2));
    if (hasInventory) { footRow.push(""); footRow.push(""); }

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

            const totalCol = dateColEnd + 1;
            const avgCol   = dateColEnd + 2;
            if (colIdx === totalCol || colIdx === avgCol) {
                hookData.cell.styles.halign = "center";
            }

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
        "Legend: cell shade = relative usage intensity per item | Bal colour: green = stock OK, orange = below PAR Min, red = stockout",
        40, footerY,
    );
    doc.text("Generated by BOH Chiang Mai", pageW - 40, footerY, { align: "right" });

    const safeFrom = data.dates[0];
    const safeTo   = data.dates[data.dates.length - 1];
    doc.save(`${data.filenamePrefix}_${safeFrom}_to_${safeTo}.pdf`);
}

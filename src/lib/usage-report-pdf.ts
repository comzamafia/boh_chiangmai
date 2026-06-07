/**
 * PDF export for the Usage Report — polished, heat-graded.
 * The page passes numeric per-day values (in each item's chosen unit) so the
 * PDF can format them and shade each cell by usage intensity (light → dark red).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NAVY: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [148, 163, 184];
const HEAT_LIGHT: [number, number, number] = [254, 226, 226]; // #fee2e2
const HEAT_DARK:  [number, number, number] = [153, 27, 27];   // #991b1b

export interface UsageExportRow {
    label: string; unit: string;
    dayNums: (number | null)[];   // per weekday, in the chosen unit (null = no sales)
    total: number; avg: number;
    allUnits: string;
}
export interface UsageExportSection { title: string; rows: UsageExportRow[] }
export interface UsageFlavorRow { flavor: string; cells: string[]; total: string }
export interface UsageReportExport {
    days: number;
    dowCounts: number[];
    sections: UsageExportSection[];
    iceCream: UsageFlavorRow[];
}

const fmt = (n: number | null) => {
    if (n == null) return "";
    if (n === 0) return "0";
    const a = Math.abs(n), dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
};
const heat = (t: number): [number, number, number] => {
    const c = Math.max(0, Math.min(1, t));
    return [
        Math.round(HEAT_LIGHT[0] + (HEAT_DARK[0] - HEAT_LIGHT[0]) * c),
        Math.round(HEAT_LIGHT[1] + (HEAT_DARK[1] - HEAT_LIGHT[1]) * c),
        Math.round(HEAT_LIGHT[2] + (HEAT_DARK[2] - HEAT_LIGHT[2]) * c),
    ];
};

export function exportUsageReportPDF(d: UsageReportExport) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const M = 28;

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
    doc.text("Usage Report", M, 38);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Last ${d.days} days · from PMIX sales`, M, 52);
    doc.text(`Generated: ${new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`, pageW - M, 52, { align: "right" });

    const dowHead = DOW.map((dd, i) => `${dd}\n×${d.dowCounts[i] ?? 0}`);
    let y = 66;
    const DAY0 = 2;                       // first weekday column index
    const TOTAL = DAY0 + 7, AVG = TOTAL + 1, ALL = AVG + 1;

    for (const s of d.sections) {
        if (s.rows.length === 0) continue;
        if (y > pageH - 80) { doc.addPage(); y = 44; }
        // section title
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
        doc.text(`${s.title} — Last ${d.days} Days`, M, y + 4);
        y += 12;

        const rowMax = s.rows.map(r => Math.max(1, ...r.dayNums.map(v => v ?? 0)));
        autoTable(doc, {
            startY: y,
            head: [["Item", "Unit", ...dowHead, "Total", "Avg/d", "Total — all units"]],
            body: s.rows.map(r => [
                r.label, r.unit, ...r.dayNums.map(v => fmt(v)), fmt(r.total), fmt(r.avg), r.allUnits,
            ]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [255, 255, 255], lineWidth: 0.5 },
            headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7.5, halign: "center", valign: "middle" },
            columnStyles: {
                0: { halign: "left", cellWidth: 120, fontStyle: "bold" },
                1: { halign: "left", textColor: MUTED },
                [TOTAL]: { halign: "right", fontStyle: "bold" },
                [AVG]: { halign: "right", textColor: [71, 85, 105] },
                [ALL]: { halign: "left", cellWidth: 150, fontSize: 7, textColor: [71, 85, 105] },
            },
            didParseCell: (data) => {
                const ci = data.column.index;
                if (data.section === "body" && ci >= DAY0 && ci < DAY0 + 7) {
                    data.cell.styles.halign = "center";
                    const v = s.rows[data.row.index]?.dayNums[ci - DAY0] ?? 0;
                    if (v > 0) {
                        const t = v / rowMax[data.row.index];
                        data.cell.styles.fillColor = heat(t);
                        data.cell.styles.textColor = t > 0.55 ? [255, 255, 255] : [69, 10, 10];
                    } else {
                        data.cell.styles.textColor = MUTED;
                    }
                } else if (data.section === "body" && (ci === TOTAL || ci === AVG)) {
                    data.cell.styles.halign = "right";
                }
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 16;
    }

    if (d.iceCream.length > 0) {
        if (y > pageH - 80) { doc.addPage(); y = 44; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
        doc.text("Ice Cream — by flavour (orders)", M, y + 4); y += 12;
        autoTable(doc, {
            startY: y,
            head: [["Flavour", ...dowHead, "Total"]],
            body: d.iceCream.map(r => [r.flavor, ...r.cells, r.total]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [157, 23, 77], textColor: 255, fontSize: 7.5, halign: "center" },
            columnStyles: { 0: { halign: "left", cellWidth: 180, fontStyle: "bold" } },
            didParseCell: (data) => { if (data.column.index >= 1) data.cell.styles.halign = data.column.index === 8 ? "right" : "center"; },
        });
    }

    doc.save(`usage-report-${d.days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
}

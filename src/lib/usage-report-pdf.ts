/**
 * PDF export for the Usage Report. The page prepares display-ready rows
 * (already converted to each item's chosen unit) so conversion stays in one place.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TEAL: [number, number, number] = [13, 148, 136];
const MUTED: [number, number, number] = [148, 163, 184];

export interface UsageExportRow { label: string; unit: string; cells: string[]; total: string; allUnits: string }
export interface UsageExportSection { title: string; rows: UsageExportRow[] }
export interface UsageFlavorRow { flavor: string; cells: string[]; total: string }
export interface UsageReportExport {
    days: number;
    dowCounts: number[];
    sections: UsageExportSection[];
    iceCream: UsageFlavorRow[];
}

export function exportUsageReportPDF(d: UsageReportExport) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const M = 32;

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...TEAL);
    doc.text("Usage Report", M, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Last ${d.days} days  ·  PMIX usage`, M, 55);
    doc.text(`Generated: ${new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`, pageW - M, 55, { align: "right" });

    const dowHead = DOW.map((dd, i) => `${dd}\n×${d.dowCounts[i] ?? 0}`);
    let y = 70;

    const sectionBar = (label: string) => {
        if (y > pageH - 80) { doc.addPage(); y = 50; }
        doc.setFillColor(...TEAL);
        doc.roundedRect(M, y, pageW - M * 2, 18, 3, 3, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        doc.text(label, M + 8, y + 12.5);
        y += 24;
    };

    for (const s of d.sections) {
        if (s.rows.length === 0) continue;
        sectionBar(`${s.title}  (${s.rows.length})`);
        const allCol = 2 + DOW.length + 1; // index of the "All units" column
        autoTable(doc, {
            startY: y,
            head: [["Item", "Unit", ...dowHead, "Total", "Total — all units"]],
            body: s.rows.map(r => [r.label, r.unit, ...r.cells, r.total, r.allUnits]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontSize: 7.5, halign: "right" },
            columnStyles: { 0: { halign: "left", cellWidth: 130 }, 1: { halign: "left" }, [allCol]: { halign: "left", cellWidth: 150 } },
            didParseCell: (data) => { if (data.column.index >= 2 && data.column.index < allCol) data.cell.styles.halign = "right"; },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 14;
    }

    if (d.iceCream.length > 0) {
        sectionBar(`Ice Cream — by flavour (orders)  (${d.iceCream.length})`);
        autoTable(doc, {
            startY: y,
            head: [["Flavour", ...dowHead, "Total"]],
            body: d.iceCream.map(r => [r.flavor, ...r.cells, r.total]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [253, 232, 243], textColor: [157, 23, 77], fontSize: 7.5, halign: "right" },
            columnStyles: { 0: { halign: "left", cellWidth: 180 } },
            didParseCell: (data) => { if (data.column.index >= 1) data.cell.styles.halign = "right"; },
        });
    }

    doc.save(`usage-report-${d.days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
}

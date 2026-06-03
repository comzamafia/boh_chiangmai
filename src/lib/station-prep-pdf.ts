/**
 * Export helpers for the Station Prep Report (PDF + CSV).
 * The page prepares display-ready rows (already converted to each row's chosen
 * unit) so the conversion logic stays in one place.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface StationPrepExportRow {
    name: string;
    unit: string;
    values: string[];     // aligned to columns
    total?: string;       // present when view = dated
    rop: string;
    menus: string;
}
export interface StationPrepExport {
    stationName: string;
    view: "weekday" | "dated";
    days: number;
    columns: string[];
    showTotal: boolean;
    rows: StationPrepExportRow[];
    unlinkedMenus: string[];
}

const GREEN: [number, number, number] = [5, 150, 105];
const MUTED: [number, number, number] = [148, 163, 184];

export function exportStationPrepPDF(d: StationPrepExport) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const M = 32;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...GREEN);
    doc.text(`Station Prep — ${d.stationName}`, M, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const viewLabel = d.view === "weekday" ? `Weekday average (last ${d.days} days)` : `Per day (last ${d.days} days)`;
    doc.text(viewLabel, M, 56);
    doc.text(
        `Generated: ${new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        pageW - M, 56, { align: "right" },
    );

    const head = [["Ingredient", "Unit", ...d.columns, ...(d.showTotal ? ["Total"] : []), "ROP"]];
    const body = d.rows.length
        ? d.rows.map(r => [r.name, r.unit, ...r.values, ...(d.showTotal ? [r.total ?? ""] : []), r.rop])
        : [["—", "", ...d.columns.map(() => ""), ...(d.showTotal ? [""] : []), ""]];

    autoTable(doc, {
        startY: 70,
        head, body,
        margin: { left: M, right: M },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: GREEN, textColor: 255, fontSize: 8 },
        columnStyles: { 0: { halign: "left", cellWidth: 120 }, 1: { halign: "left" } },
        // right-align numeric columns
        didParseCell: (data) => {
            if (data.column.index >= 2) data.cell.styles.halign = "right";
        },
    });

    if (d.unlinkedMenus.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const afterY = (doc as any).lastAutoTable?.finalY ?? 70;
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text(
            `Excluded (no linked recipe): ${d.unlinkedMenus.join(", ")}`,
            M, afterY + 16, { maxWidth: pageW - M * 2 },
        );
    }

    doc.save(`station-prep-${d.stationName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportStationPrepCSV(d: StationPrepExport) {
    const header = ["Ingredient", "Unit", ...d.columns, ...(d.showTotal ? ["Total"] : []), "ROP", "Menus"];
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [
        header.map(esc).join(","),
        ...d.rows.map(r => [r.name, r.unit, ...r.values, ...(d.showTotal ? [r.total ?? ""] : []), r.rop, r.menus].map(esc).join(",")),
    ];
    if (d.unlinkedMenus.length > 0) lines.push("", esc(`Excluded (no linked recipe): ${d.unlinkedMenus.join("; ")}`));

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `station-prep-${d.stationName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

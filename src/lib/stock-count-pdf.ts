/**
 * Stock-count PDF helpers.
 *  - exportBlankCountSheet: a printable sheet to carry to the cold room /
 *    store and write on by hand (grouped by category), then key in later.
 *  - exportFilledCountSheet: the completed count as a record (with variance).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TEAL: [number, number, number] = [13, 148, 136];
const MUTED: [number, number, number] = [120, 130, 145];

export interface BlankSheetGroup {
    category: string;
    items: { name: string; unitsHint: string; system: string }[];
}
export interface FilledSheetGroup {
    category: string;
    items: { name: string; counted: string; total: string; system: string; variance: string }[];
}

function header(doc: jsPDF, areaName: string, subtitle: string) {
    const pageW = doc.internal.pageSize.width;
    const M = 36;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...TEAL);
    doc.text(`Stock Count — ${areaName}`, M, 42);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(subtitle, M, 57);
    doc.text(`Date: ${new Date().toLocaleDateString("en-CA")}    Counter: ____________________`, pageW - M, 57, { align: "right" });
    return 70;
}

function sectionBar(doc: jsPDF, label: string, y: number): number {
    const pageW = doc.internal.pageSize.width; const M = 36;
    doc.setFillColor(...TEAL);
    doc.roundedRect(M, y, pageW - M * 2, 18, 3, 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(label, M + 8, y + 12.5);
    return y + 24;
}

export function exportBlankCountSheet(areaName: string, groups: BlankSheetGroup[]) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const M = 36;
    let y = header(doc, areaName, "Write what you count on the shelf, then enter it in the app.");

    for (const g of groups) {
        if (y > doc.internal.pageSize.height - 90) { doc.addPage(); y = 50; }
        y = sectionBar(doc, `${g.category}  (${g.items.length})`, y);
        autoTable(doc, {
            startY: y,
            head: [["Ingredient", "Units available", "Count (write here)", "On system"]],
            body: g.items.map(i => [i.name, i.unitsHint, "", i.system]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, minCellHeight: 20 },
            headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontSize: 8 },
            columnStyles: { 0: { cellWidth: 150 }, 2: { cellWidth: 150 }, 3: { halign: "right" } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 14;
    }
    doc.save(`stock-count-sheet-${areaName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportFilledCountSheet(areaName: string, groups: FilledSheetGroup[]) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const M = 36;
    let y = header(doc, areaName, "Completed physical count (variance vs system).");

    for (const g of groups) {
        if (y > doc.internal.pageSize.height - 90) { doc.addPage(); y = 50; }
        y = sectionBar(doc, `${g.category}  (${g.items.length})`, y);
        autoTable(doc, {
            startY: y,
            head: [["Ingredient", "Counted", "Total", "System", "Variance"]],
            body: g.items.map(i => [i.name, i.counted, i.total, i.system, i.variance]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
            headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8 },
            columnStyles: { 0: { cellWidth: 130 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 14;
    }
    doc.save(`stock-count-${areaName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

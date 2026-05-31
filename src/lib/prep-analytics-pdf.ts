/**
 * PDF export for Prep Productivity Analytics.
 * Two sections on one portrait A4: Station Frequency + Staff Performance.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PrepAnalyticsResult } from "@/lib/api";

const PURPLE: [number, number, number] = [109, 40, 217];
const SOFT:   [number, number, number] = [243, 244, 246];
const GREY:   [number, number, number] = [55, 65, 81];
const MUTED:  [number, number, number] = [148, 163, 184];

export function exportPrepAnalyticsToPDF(data: PrepAnalyticsResult) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const M = 36;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...PURPLE);
    doc.text("Prep Productivity Report", M, 44);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Period: ${data.from}  →  ${data.to}`, M, 60);
    doc.text(
        `Generated: ${new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        pageW - M, 60, { align: "right" },
    );

    let y = 80;

    const sectionBar = (label: string) => {
        doc.setFillColor(...PURPLE);
        doc.roundedRect(M, y, pageW - M * 2, 20, 3, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(label, M + 10, y + 13.5);
        y += 28;
    };

    // ── Station Frequency ─────────────────────────────────────────────────────
    sectionBar("STATION FREQUENCY  ·  most-scheduled prep tasks");
    autoTable(doc, {
        startY: y,
        head: [["Station", "Task", "Days", "Scheduled", "Completed"]],
        body: data.stationFrequency.length
            ? data.stationFrequency.map(r => [r.station, r.task, String(r.daysScheduled), String(r.timesScheduled), String(r.timesCompleted)])
            : [["—", "No activity in this range", "", "", ""]],
        margin: { left: M, right: M },
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 4, textColor: GREY, lineColor: [228,231,235], lineWidth: 0.4 },
        headStyles: { fillColor: SOFT, textColor: PURPLE, fontStyle: "bold", fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 110 },
            1: { cellWidth: "auto", fontStyle: "bold" },
            2: { halign: "right", cellWidth: 50 },
            3: { halign: "right", cellWidth: 70 },
            4: { halign: "right", cellWidth: 70 },
        },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y + 60) + 22;

    if (y > pageH - 160) { doc.addPage(); y = M; }

    // ── Staff Performance ─────────────────────────────────────────────────────
    sectionBar("STAFF PERFORMANCE  ·  tasks completed");
    autoTable(doc, {
        startY: y,
        head: [["Staff", "Completed", "Days Active", "Avg / Day"]],
        body: data.staffPerformance.length
            ? data.staffPerformance.map(r => [r.name, String(r.completed), String(r.daysActive), String(r.avgPerDay)])
            : [["No completions in this range", "", "", ""]],
        margin: { left: M, right: M },
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 4, textColor: GREY, lineColor: [228,231,235], lineWidth: 0.4 },
        headStyles: { fillColor: SOFT, textColor: PURPLE, fontStyle: "bold", fontSize: 8 },
        columnStyles: {
            0: { cellWidth: "auto", fontStyle: "bold" },
            1: { halign: "right", cellWidth: 80 },
            2: { halign: "right", cellWidth: 80 },
            3: { halign: "right", cellWidth: 70 },
        },
    });

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(228, 231, 235);
        doc.setLineWidth(0.5);
        doc.line(M, pageH - 30, pageW - M, pageH - 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text("Frequency flags labour-heavy prep (candidates for pre-cut buying). Completions are timestamped for performance review.", M, pageH - 18);
        doc.text(`Page ${p}/${pages} · BOH Chiang Mai`, pageW - M, pageH - 18, { align: "right" });
    }

    doc.save(`Prep_Productivity_${data.from}_to_${data.to}.pdf`);
}

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
    header: string;
    key: string;
    width?: number;
}

export function excelExport(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    fileName: string
) {
    const headers = columns.map(c => c.header);
    const rows = data.map(row => columns.map(c => {
        const val = row[c.key];
        return val !== null && val !== undefined ? String(val) : "";
    }));

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Kolon genişlikleri
    ws["!cols"] = columns.map(c => ({ wch: c.width || 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Veri");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split("T")[0]}.xlsx`);
}

export function pdfExport(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    fileName: string,
    title: string
) {
    const doc = new jsPDF({ orientation: data.length > 0 && columns.length > 6 ? "landscape" : "portrait" });

    // Başlık
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Tarih: ${new Date().toLocaleDateString("tr-TR")} | Toplam: ${data.length} kayıt`, 14, 25);

    const headers = columns.map(c => c.header);
    const rows = data.map(row => columns.map(c => {
        const val = row[c.key];
        return val !== null && val !== undefined ? String(val) : "";
    }));

    autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 30,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
    });

    doc.save(`${fileName}_${new Date().toISOString().split("T")[0]}.pdf`);
}

import { formatDatePT, formatDateTimePT, formatEUR } from "./format";
import type { RouteForecast } from "./forecasts.functions";

export async function downloadForecastPdf(f: RouteForecast) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const r = f.route_snapshot ?? {};
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Brand palette
  const primary: [number, number, number] = [15, 23, 42];   // slate-900
  const accent: [number, number, number] = [37, 99, 235];   // blue-600
  const muted: [number, number, number] = [100, 116, 139];  // slate-500
  const soft: [number, number, number] = [241, 245, 249];   // slate-100
  const border: [number, number, number] = [226, 232, 240]; // slate-200

  // ---------- HEADER ----------
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 90, "F");

  doc.setFillColor(...accent);
  doc.rect(0, 90, pageW, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PREVISÃO DE RECEBIMENTOS", margin, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Documento de controlo logístico", margin, 60);

  // Right side: doc id + date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`Nº ${f.id.slice(0, 8).toUpperCase()}`, pageW - margin, 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(formatDateTimePT(f.created_at), pageW - margin, 60, { align: "right" });

  // ---------- INFO CARD ----------
  const infoY = 115;
  const infoH = 90;
  doc.setFillColor(...soft);
  doc.setDrawColor(...border);
  doc.roundedRect(margin, infoY, pageW - margin * 2, infoH, 6, 6, "FD");

  const colW = (pageW - margin * 2 - 30) / 3;
  const labelColor = muted;
  const valueColor: [number, number, number] = [15, 23, 42];

  const drawField = (label: string, value: string, x: number, y: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...labelColor);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...valueColor);
    doc.text(value || "—", x, y + 14);
  };

  // Row 1
  drawField("Zona", String(r.zone ?? "—"), margin + 15, infoY + 20);
  drawField("Data da rota", r.route_date ? formatDatePT(r.route_date) : "—", margin + 15 + colW, infoY + 20);
  drawField("Motorista", String(r.driver ?? "—"), margin + 15 + colW * 2, infoY + 20);

  // Row 2
  drawField("Veículo", String(r.vehicle ?? "—"), margin + 15, infoY + 55);
  drawField("Auxiliar", String(r.assistant ?? "—"), margin + 15 + colW, infoY + 55);
  drawField("Gerado por", String(f.generated_by_name ?? "—"), margin + 15 + colW * 2, infoY + 55);

  // ---------- TABLE ----------
  const startY = infoY + infoH + 20;

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    head: [["#Encomenda", "Cliente", "Total", "Serviços", "Previsto (Entrega)"]],
    body: f.items.map((it) => [
      it.order_number,
      it.customer_name,
      formatEUR(it.total_value),
      formatEUR(it.services_value),
      formatEUR(it.forecast_value),
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 8,
      lineColor: border,
      lineWidth: 0.5,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: primary,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 9,
      halign: "left",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 70 },
      3: { halign: "right", cellWidth: 70 },
      4: { halign: "right", cellWidth: 90, fontStyle: "bold", textColor: accent },
    },
    foot: [[
      `${f.total_orders} encomenda(s)`,
      "TOTAIS",
      formatEUR(f.total_gross),
      formatEUR(f.total_services),
      formatEUR(f.total_forecast),
    ]],
    footStyles: {
      fillColor: soft,
      textColor: primary,
      fontStyle: "bold",
      fontSize: 9.5,
      cellPadding: 9,
    },
    didDrawPage: () => {
      // Footer on each page
      const fy = pageH - 30;
      doc.setDrawColor(...border);
      doc.setLineWidth(0.5);
      doc.line(margin, fy - 10, pageW - margin, fy - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(
        "Valores estimados a partir das parcelas marcadas como \"Pagar na entrega\" no GestãoClick.",
        margin,
        fy,
      );
      doc.text(
        `Página ${doc.getNumberOfPages()}`,
        pageW - margin,
        fy,
        { align: "right" },
      );
    },
  });

  const endY = (doc as any).lastAutoTable?.finalY ?? startY + 50;

  // ---------- TOTAL HIGHLIGHT ----------
  let cursorY = endY + 20;
  const totalBoxH = 60;
  const totalBoxW = 260;
  const totalBoxX = pageW - margin - totalBoxW;

  // Ensure space; else new page
  if (cursorY + totalBoxH + 140 > pageH - 50) {
    doc.addPage();
    cursorY = margin;
  }

  doc.setFillColor(...primary);
  doc.roundedRect(totalBoxX, cursorY, totalBoxW, totalBoxH, 6, 6, "F");
  doc.setFillColor(...accent);
  doc.rect(totalBoxX, cursorY, 4, totalBoxH, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text("TOTAL PREVISTO A RECEBER", totalBoxX + 18, cursorY + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(formatEUR(f.total_forecast), totalBoxX + totalBoxW - 18, cursorY + 44, { align: "right" });

  // ---------- SIGNATURE BLOCK ----------
  const sigY = cursorY + totalBoxH + 50;
  const sigW = (pageW - margin * 2 - 30) / 2;

  const drawSignature = (label: string, name: string, x: number) => {
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.8);
    doc.line(x, sigY, x + sigW, sigY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text(label, x, sigY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(name, x, sigY + 26);
  };

  drawSignature("Assinatura do Motorista", String(r.driver ?? "—"), margin);
  drawSignature("Conferido por", "_______________________________", margin + sigW + 30);

  // Date line under signatures
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(`Data: ____ / ____ / ________`, margin, sigY + 50);

  const fname = `previsao-${(r.zone ?? "rota").toString().replace(/\s+/g, "-").toLowerCase()}-${r.route_date ?? ""}-${f.id.slice(0, 8)}.pdf`;
  doc.save(fname);
}

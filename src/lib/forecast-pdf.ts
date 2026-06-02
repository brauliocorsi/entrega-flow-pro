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

  doc.setFontSize(16);
  doc.text("Previsão de Recebimentos", 40, 50);

  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta: string[] = [
    `Rota: ${r.zone ?? "—"} · ${r.route_date ? formatDatePT(r.route_date) : "—"}`,
    `ID: ${f.route_id}`,
    `Motorista: ${r.driver ?? "—"}${r.vehicle ? ` · Veículo: ${r.vehicle}` : ""}${r.assistant ? ` · Auxiliar: ${r.assistant}` : ""}`,
    `Gerado em: ${formatDateTimePT(f.created_at)} por ${f.generated_by_name ?? "—"}`,
  ];
  meta.forEach((line, i) => doc.text(line, 40, 70 + i * 14));

  const startY = 70 + meta.length * 14 + 10;

  autoTable(doc, {
    startY,
    head: [["#Encomenda", "Cliente", "Total", "Serviços", "Previsto (Entrega)"]],
    body: f.items.map((it) => [
      it.order_number,
      it.customer_name,
      formatEUR(it.total_value),
      formatEUR(it.services_value),
      formatEUR(it.forecast_value),
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 75 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    foot: [[
      `${f.total_orders} encomenda(s)`,
      "TOTAIS",
      formatEUR(f.total_gross),
      formatEUR(f.total_services),
      formatEUR(f.total_forecast),
    ]],
    footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: "bold" },
  });

  const endY = (doc as any).lastAutoTable?.finalY ?? startY + 50;

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(
    `Total previsto a receber: ${formatEUR(f.total_forecast)}`,
    pageW - 40,
    endY + 30,
    { align: "right" },
  );

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Valores estimados a partir das parcelas marcadas como \"Pagar na entrega\" no GestãoClick.",
    40,
    doc.internal.pageSize.getHeight() - 30,
  );

  const fname = `previsao-${(r.zone ?? "rota").toString().replace(/\s+/g, "-").toLowerCase()}-${r.route_date ?? ""}-${f.id.slice(0, 8)}.pdf`;
  doc.save(fname);
}

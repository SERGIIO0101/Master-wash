import { jsPDF } from "jspdf";
import { LOGO, LOGO_W, LOGO_H } from "./logo.js";

export const fmt = (n) =>
  "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const PAGOS = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
export const pagoLabel = (k) => (PAGOS.find((p) => p[0] === k) || PAGOS[0])[1];
export const fmtHora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }) : "-";
export const extrasSum = (it) => (it.extras || []).reduce((a, e) => a + e.v, 0);

const NAVY = [11, 17, 24];
const BLUE = [8, 115, 192];

export function buildPdf({ rows, mode, emp, subtitle }) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pcts = [...new Set(rows.map((r) => r.pct))];
  const gLab = pcts.length === 1 ? ` (${pcts[0]}%)` : "";
  const lLab = pcts.length === 1 ? ` (${100 - pcts[0]}%)` : "";
  const con = mode === "con";
  const cols = con
    ? [
        { h: "#", w: 8 }, { h: "Placa", w: 22 }, { h: "Modelo", w: 34 }, { h: "Hora", w: 15 }, { h: "Pago", w: 24 },
        { h: "Precio", w: 25 }, { h: `Ganancia${gLab}`, w: 28 }, { h: `Lavadero${lLab}`, w: 29 },
      ]
    : [
        { h: "#", w: 10 }, { h: "Placa", w: 28 }, { h: "Modelo", w: 50 }, { h: "Hora", w: 22 }, { h: "Pago", w: 34 }, { h: "Valor", w: 36 },
      ];
  const tw = cols.reduce((s, c) => s + c.w, 0);
  const x0 = (W - tw) / 2;
  const rh = 9;

  const header = () => {
    const lw = 62;
    const lh = (lw * LOGO_H) / LOGO_W;
    doc.addImage(LOGO, "PNG", (W - lw) / 2, 10, lw, lh);
    let y = 10 + lh + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(`Reporte de motos lavadas - ${subtitle}`, W / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(90);
    y += 6;
    doc.text(`Empleado: ${emp}`, W / 2, y, { align: "center" });
    y += 5.5;
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CO")}`, W / 2, y, { align: "center" });
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.6);
    doc.line(x0, y + 4, x0 + tw, y + 4);
    doc.setLineWidth(0.2);
    return y + 11;
  };
  let y = header();

  const row = (vals, o = {}) => {
    if (y + rh > H - 20) {
      doc.addPage();
      y = 20;
    }
    if (o.fill) {
      doc.setFillColor(...o.fill);
      doc.rect(x0, y, tw, rh, "F");
    }
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setTextColor(...(o.color || [30, 30, 30]));
    let x = x0;
    vals.forEach((v, i) => {
      const txt = String(v);
      let fs = 10;
      doc.setFontSize(fs);
      while (fs > 6.5 && doc.getTextWidth(txt) > cols[i].w - 2) {
        fs -= 0.5;
        doc.setFontSize(fs);
      }
      doc.text(txt, x + cols[i].w / 2, y + 6, { align: "center" });
      x += cols[i].w;
    });
    doc.setDrawColor(200, 208, 220);
    doc.rect(x0, y, tw, rh);
    x = x0;
    cols.forEach((c, i) => {
      if (i < cols.length - 1) {
        x += c.w;
        doc.line(x, y, x, y + rh);
      }
    });
    y += rh;
  };

  row(cols.map((c) => c.h), { fill: NAVY, bold: true, color: [255, 255, 255] });
  let sum = 0;
  let gan = 0;
  let extras = 0;
  let propinas = 0;
  rows.forEach((it, i) => {
    const g = (it.precio * it.pct) / 100;
    sum += it.precio;
    gan += g;
    extras += extrasSum(it);
    propinas += it.propina || 0;
    const v = [i + 1, it.placa || "-", it.modelo || "-", fmtHora(it.hora), pagoLabel(it.pago), fmt(it.precio)];
    if (con) v.push(fmt(g), fmt(it.precio - g));
    row(v, { fill: i % 2 ? [244, 247, 251] : [255, 255, 255] });
  });
  const t = ["", "TOTAL", "", "", "", fmt(sum)];
  if (con) t.push(fmt(gan), fmt(sum - gan));
  row(t, { fill: [222, 238, 250], bold: true });

  if (extras > 0) {
    y += 8;
    if (y > H - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Extras vendidos (pasabocas, bebidas, no incluidos en el porcentaje): ${fmt(extras)}`, x0, y);
  }

  if (propinas > 0) {
    y += extras > 0 ? 6 : 8;
    if (y > H - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Propinas de las motos (bolsa, se reparten aparte): ${fmt(propinas)}`, x0, y);
  }
  return doc;
}

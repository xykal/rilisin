#!/usr/bin/env node
/**
 * Penilai laporan ZAP baseline:
 *   node scripts/qa/zap-baseline-check.mjs [zap-baseline.json]
 *
 * Kebijakan (lihat PROGRESS.md): temuan HIGH menggagalkan CI; Medium/Low/Info
 * hanya dilaporkan — scan pasif banyak false positive (mis. aturan anti-CSRF
 * generik yang tidak paham pola origin + fetch-metadata kita).
 */
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "zap-baseline.json";
let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch {
  console.error(`✗ Laporan ZAP tidak bisa dibaca (${path}) — scan gagal atau file tidak tertulis.`);
  process.exit(1);
}
if (!Array.isArray(report.site)) {
  console.error("✗ Format laporan ZAP tidak dikenal (tidak ada array 'site') — periksa versi image ZAP.");
  process.exit(1);
}

const alerts = [];
for (const site of report.site) {
  for (const a of site.alerts ?? []) {
    // Format ZAP baru: "Medium (High)" = Risiko (Keyakinan); format lama: "Medium" saja.
    const rawRisk = String(a.riskdesc ?? "Unknown");
    const rm = rawRisk.match(/^(High|Medium|Low|Informational)(?: \(([^)]+)\))?$/);
    alerts.push({
      rule: String(a.pluginid ?? "?"),
      name: String(a.alert ?? a.name ?? "(tanpa nama)"),
      risk: rm ? rm[1] : "Unknown",
      confidence: rm?.[2] ?? "",
      count: Array.isArray(a.instances) ? a.instances.length : 0,
      sample: a.instances?.[0]?.uri ? String(a.instances[0].uri).slice(0, 120) : "-",
    });
  }
}

const by = (r) => alerts.filter((a) => a.risk === r);
const order = ["High", "Medium", "Low", "Informational"];
console.log(
  `ZAP baseline: ${alerts.length} jenis temuan — ` +
    `High ${by("High").length}, Medium ${by("Medium").length}, Low ${by("Low").length}, Info ${by("Informational").length}`,
);
if (alerts.length === 0) console.log("! Tidak ada temuan sama sekali — pastikan spider ZAP benar-benar merayapi target.");
for (const risk of order) {
  for (const a of by(risk)) {
    console.log(
      `  [${risk.toUpperCase()}] ${a.name} (rule ${a.rule}) ×${a.count} — ${a.sample}${a.confidence ? ` (keyakinan ${a.confidence})` : ""}`,
    );
  }
}
for (const a of alerts.filter((x) => !order.includes(x.risk))) {
  console.log(`  [?] ${a.name} (rule ${a.rule}, risk "${a.risk}") ×${a.count} — ${a.sample}`);
}

if (by("High").length > 0) {
  console.error("✗ ZAP menemukan temuan HIGH — wajib diperbaiki, atau diabaikan eksplisit via baseline.conf + alasan.");
  process.exit(1);
}
console.log("✓ ZAP baseline lolos (tidak ada temuan High).");

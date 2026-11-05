/**
 * Die Auswertung der Render-Prüfung, siehe `render-check.mjs`.
 *
 * @module
 */

/** Wert am Anteil `share` der sortierten Liste. */
export function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? NaN;
}

/** Mittelt die Läufe je Variante und Szene, dazu die Ersparnis gegenüber dem Ausgangszustand. */
export function report(rows) {
  const lines = [];
  const groups = Map.groupBy(rows, (row) => `${row.scene}/${row.variant}`);
  const mean = (list, key) => list.reduce((sum, row) => sum + row[key], 0) / list.length;
  for (const [name, list] of groups) {
    const base = groups.get(`${list[0].scene}/ausgang`);
    const gpu = mean(list, "gpuMedian");
    const saved = base ? Math.round((1 - gpu / mean(base, "gpuMedian")) * 100) : NaN;
    const { calls, textures, programs, materials } = list.at(-1);
    lines.push(
      `${name.padEnd(22)} GPU ${gpu.toFixed(2).padStart(7)} ms (p95 ${mean(list, "gpuP95").toFixed(2)}, ${saved} % gespart)` +
        ` · CPU ${mean(list, "cpuMedian").toFixed(2)} ms · ${mean(list, "fps").toFixed(1)} FPS` +
        ` · ${calls} Draws, ${textures} Texturen, ${materials} Materialien, ${programs} Programme`,
    );
  }
  return lines.join("\n");
}

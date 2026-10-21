import { PALETTES } from "./chart-palettes";

// ❌ Side effect ở top-level: chạy ngay khi module được import.
// Bundler không chứng minh được `buildPaletteIndex()` không có side effect,
// nên dù app không dùng gì từ chart.ts, module này (và PALETTES) vẫn bị giữ.
// Fix phía thư viện: `/*#__PURE__*/ buildPaletteIndex(PALETTES)`, hoặc khởi tạo lười
// bên trong function, hoặc khai báo "sideEffects": false trong package.json.
const PALETTE_INDEX = buildPaletteIndex(PALETTES);

function buildPaletteIndex(palettes: string[][]): Map<string, number> {
  const index = new Map<string, number>();
  palettes.forEach((p, i) => index.set(p[0], i));
  return index;
}

export function renderChart(el: HTMLElement, values: number[], paletteId = 0): void {
  const colors = PALETTES[paletteId % PALETTES.length];
  const max = Math.max(...values, 1);
  el.innerHTML = values
    .map((v, i) => `<div style="height:${(v / max) * 100}%;background:${colors[i % colors.length]}"></div>`)
    .join("");
  el.dataset.palettes = String(PALETTE_INDEX.size);
}

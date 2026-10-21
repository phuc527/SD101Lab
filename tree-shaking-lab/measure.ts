import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build, type Rollup } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const casesDir = join(root, "cases");

export type BundleReport = {
  /** Bytes của chunk entry (thứ trình duyệt phải tải + parse trước khi app chạy). */
  initial: number;
  initialGzip: number;
  /** Tổng mọi chunk, kể cả chunk lazy. */
  total: number;
  /** File trong lib/ có code nằm trong chunk entry. */
  libModules: string[];
};

export async function bundle(entry: string): Promise<BundleReport> {
  const result = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    build: { write: false, minify: true, rolldownOptions: { input: entry } },
  })) as Rollup.RollupOutput;

  const chunks = result.output.filter((o): o is Rollup.OutputChunk => o.type === "chunk");
  const entryChunk = chunks.find((c) => c.isEntry)!;
  return {
    initial: Buffer.byteLength(entryChunk.code),
    initialGzip: gzipSync(entryChunk.code).length,
    total: chunks.reduce((sum, c) => sum + Buffer.byteLength(c.code), 0),
    libModules: Object.entries(entryChunk.modules)
      .filter(([id, m]) => id.includes("/lib/") && m.renderedLength > 0)
      .map(([id]) => basename(id))
      .sort(),
  };
}

export const cases = readdirSync(casesDir).sort();

export async function measureCase(name: string) {
  const [bad, good] = await Promise.all([
    bundle(join(casesDir, name, "bad.ts")),
    bundle(join(casesDir, name, "good.ts")),
  ]);
  return { name, bad, good };
}

const kb = (n: number) => (n / 1024).toFixed(1) + " KB";
// Ước lượng thời gian tải trên mạng "Slow 4G" của Chrome DevTools (~1.6 Mbps ≈ 200 KB/s).
// Chưa tính parse/compile JS, thứ trên điện thoại tầm trung còn chậm hơn cả tải.
const slow4g = (gzipBytes: number) => Math.round((gzipBytes / (200 * 1024)) * 1000) + " ms";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of cases) {
    const { bad, good } = await measureCase(name);
    console.log(`\n== ${name} ==`);
    console.table({
      bad: {
        initial: kb(bad.initial),
        gzip: kb(bad.initialGzip),
        "slow 4G": slow4g(bad.initialGzip),
        total: kb(bad.total),
        "lib modules": bad.libModules.join(", "),
      },
      good: {
        initial: kb(good.initial),
        gzip: kb(good.initialGzip),
        "slow 4G": slow4g(good.initialGzip),
        total: kb(good.total),
        "lib modules": good.libModules.join(", "),
      },
    });
  }
}

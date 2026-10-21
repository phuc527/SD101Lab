import { describe, expect, it } from "vitest";
import { cases, measureCase } from "../measure";

describe("tree shaking", () => {
  it.each(cases)("%s: bản good nhẹ hơn bad ít nhất một nửa", async (name) => {
    const { bad, good } = await measureCase(name);
    expect(good.initialGzip).toBeLessThan(bad.initialGzip / 2);
  });

  it("02: import qua barrel kéo chart.ts vào vì side effect top-level", async () => {
    const { bad, good } = await measureCase("02-barrel-side-effect");
    expect(bad.libModules).toContain("chart.ts");
    expect(good.libModules).toEqual(["format.ts"]);
  });

  it("03: CommonJS kéo cả bảng locale", async () => {
    const { bad, good } = await measureCase("03-commonjs");
    expect(bad.libModules).toContain("locales-data.cjs");
    expect(good.libModules).toEqual(["format.ts"]);
  });

  it("05: import() tách chart ra chunk riêng, tổng code không đổi", async () => {
    const { bad, good } = await measureCase("05-lazy-import");
    expect(good.libModules).not.toContain("chart.ts");
    expect(good.total).toBeGreaterThanOrEqual(bad.initial);
  });
});

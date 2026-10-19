export type Line = { text: string; kind: "cmd" | "log" | "ok" | "err" };

// Runs real pattern code and collects its console.log output as console lines.
// ponytail: patches the global console.log while fn runs; fine for one click at a time.
export async function run<T>(
  label: string,
  fn: () => Promise<T> | T,
): Promise<Line[]> {
  const lines: Line[] = [{ text: `> ${label}`, kind: "cmd" }];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push({ text: args.map(String).join(" "), kind: "log" });
    original(...args);
  };

  try {
    const result = await fn();
    lines.push({
      text:
        result === undefined
          ? "resolved"
          : `resolved: ${JSON.stringify(result)}`,
      kind: "ok",
    });
  } catch (error) {
    lines.push({
      text: `rejected: ${error instanceof Error ? error.message : String(error)}`,
      kind: "err",
    });
  } finally {
    console.log = original;
  }

  return lines;
}

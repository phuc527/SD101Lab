// Cùng 1 bộ helper, viết theo 2 kiểu.

// ✅ Named function: mỗi function là 1 export độc lập -> không dùng thì bị bỏ.
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ❌ Class static: import StringUtils = kéo cả class. Bundler không bỏ từng method
// vì method có thể được gọi động (StringUtils[name]) hoặc qua kế thừa.
export class StringUtils {
  static slugify(s: string): string {
    return slugify(s);
  }
  static truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + "…";
  }
  static escapeHtml(s: string): string {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return s.replace(/[&<>"']/g, (c) => map[c]);
  }
  static toTitleCase(s: string): string {
    return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  static levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }
  static maskEmail(s: string): string {
    const [user, domain] = s.split("@");
    return user.slice(0, 2) + "*".repeat(Math.max(user.length - 2, 0)) + "@" + domain;
  }
}

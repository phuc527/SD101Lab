// ESM + pure functions: bundler giữ đúng function được import, bỏ phần còn lại.
// Dùng Intl có sẵn của trình duyệt thay vì tự ship bảng locale.

export function formatPrice(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount);
}

export function formatDate(date: Date, locale = "vi"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function timeAgo(date: Date, now = new Date()): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  return new Intl.RelativeTimeFormat("vi", { numeric: "auto" }).format(minutes, "minute");
}

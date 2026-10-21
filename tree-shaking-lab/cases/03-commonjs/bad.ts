// Thư viện CommonJS: chỉ cần formatDate cho tiếng Việt,
// nhưng bundle phải chứa cả module + bảng 74 locale nó require.
import { formatDate } from "../../lib/legacy-format.cjs";

console.log(formatDate(new Date(), "vi"));

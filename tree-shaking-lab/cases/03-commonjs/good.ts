// Thư viện ESM + Intl có sẵn trong trình duyệt: không ship bảng locale nào.
import { formatDate } from "../../lib/format";

console.log(formatDate(new Date(), "vi"));

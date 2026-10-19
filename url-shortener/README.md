# URL Shortener (bit.ly / TinyURL): 4 level

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Key-value mapping code → URL, redirect 302, code ngẫu nhiên + kiểm tra trùng | `url-shortener-fresher/shortener.js` |
| Junior | REST API, counter + base62, validate URL (chặn `javascript:`), shorten idempotent | `url-shortener-junior/server.js` |
| Middle | So sánh chiến lược sinh code (birthday paradox), cache LRU cho link hot, 301 vs 302 | `url-shortener-middle/strategies.js` |
| Senior | Estimation, sinh ID phân tán (cấp phát theo range), làm rối ID tuần tự, analytics bất đồng bộ, hết hạn link | `url-shortener-senior/system.js` |

```bash
node url-shortener-fresher/shortener.js
node url-shortener-junior/server.js      # tự start server, tự test rồi tắt
node url-shortener-middle/strategies.js
node url-shortener-senior/system.js
```

> **Read-heavy (khoảng 100:1).** Một link được tạo một lần nhưng có thể được click hàng nghìn lần.
> Hệ quả: cache nhiều tầng (CDN, Redis LRU, DB), dùng read replica, dùng KV store tra cứu O(1) theo code. Ghi thì ít, nhưng phải sinh ID không trùng giữa nhiều node. Riêng phần **analytics click** lại là write-heavy (mỗi click là một lần ghi), nên tách ra pipeline bất đồng bộ (Kafka, gom theo lô).

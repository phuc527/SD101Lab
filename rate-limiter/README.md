# Rate Limiter: 4 level

> **Write-heavy.** Mỗi request vào hệ thống đều tạo ra một lần **ghi** (tăng counter, trừ token) kèm một lần đọc, nên tỉ lệ đọc/ghi gần 1:1. Ngoài ra rất nhiều request cùng ghi vào **một key** (`ratelimit:{user}`), gây hot key.
> Hệ quả: lưu trong bộ nhớ (Redis) chứ không dùng DB trên đĩa, phép ghi phải **atomic** (`INCR`, Lua), chấp nhận số liệu xấp xỉ (sliding window counter, lease token) để giảm số lần ghi.

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Fixed window counter, trả 429, vấn đề burst ở ranh giới cửa sổ | `rate-limiter-fresher/fixed-window.js` |
| Junior | Middleware token bucket theo API key, header `X-RateLimit-*` và `Retry-After` | `rate-limiter-junior/server.js` |
| Middle | So sánh 5 thuật toán trên cùng một traffic: độ chính xác, bộ nhớ, burst | `rate-limiter-middle/algorithms.js` |
| Senior | Limiter phân tán: counter local bị sai, race condition, `INCR` atomic, fail-open/closed, lease | `rate-limiter-senior/distributed.js` |

```bash
node rate-limiter-fresher/fixed-window.js
node rate-limiter-junior/server.js     # tự start server, tự test rồi tắt
node rate-limiter-middle/algorithms.js
node rate-limiter-senior/distributed.js
```

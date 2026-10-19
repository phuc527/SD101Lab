# SD101: System Design Interview Roadmap

Mỗi ngày học 1 đề. Mỗi đề có 4 level (fresher, junior, middle, senior), level sau giải quyết giới hạn của level trước. Tất cả lab chạy bằng Node 18+, không cần cài gì.

| Ngày | Đề | Read hay Write heavy | Ý chính |
|---|---|---|---|
| 0 | [read-write-heavy-101](read-write-heavy-101/) | Nền tảng | Tối ưu cho đọc nhiều hay ghi nhiều, cùng các trade-off |
| 1 | [newsfeed](newsfeed/) | **Read-heavy** (10-100:1) | Fan-out push/pull/hybrid, cache, ranking |
| 2 | [url-shortener](url-shortener/) | **Read-heavy** (khoảng 100:1), riêng analytics là write-heavy | Sinh ID, base62, cache redirect, ID phân tán |
| 3 | [rate-limiter](rate-limiter/) | **Write-heavy** (mỗi request là một lần ghi counter) | Các thuật toán rate limit, race condition, limiter phân tán |
| 4 | [chat-app](chat-app/) | **Write-heavy** (khoảng 1:1, khối lượng ghi rất lớn) | Real-time (SSE/WebSocket), thứ tự tin nhắn, delivery guarantee, nhiều gateway |
| 5 | [ride-sharing](ride-sharing/) | **Write-heavy** (vị trí tài xế khoảng 1000:1), riêng trip/payment cần nhất quán mạnh | Geospatial index, matching, lock, hot spot, AP vs CP |
| 6 | [autocomplete](autocomplete/) | **Read-heavy** (mỗi phím là một lần đọc, khoảng 10:1 so với search) | Trie + top-K, aggregate bất đồng bộ, prefix cache, shard, degradation |
| 7 | [notification](notification/) | **Write-heavy** (mỗi tin là nhiều lần ghi: tạo, enqueue, mỗi lần retry, log delivery; broadcast tạo burst cực lớn) | Queue, retry + backoff, idempotency, DLQ, priority, circuit breaker |
| 8 | [flash-sale](flash-sale/) | **Write-heavy** (mọi lượt bấm mua là một lần ghi có điều kiện vào cùng một dòng stock) | Race condition, row lock vs atomic update, hot row, Redis + Lua, queue ghi đơn |

Mẹo khi phỏng vấn: **luôn nói ra tỉ lệ đọc/ghi ngay sau phần estimation**, vì nó quyết định kiến trúc. Read-heavy thì dùng cache, replica, tính sẵn dữ liệu. Write-heavy thì dùng bộ nhớ, append-only, gom theo lô, queue, và chấp nhận dữ liệu xấp xỉ.

## UI tương tác (React + Vite + TS)
```bash
cd sd101-ui
npm install      # chỉ cần lần đầu
npm run dev      # bật UI và cả 32 backend (8 đề × 4 level), sau đó mở http://localhost:5173
```
- Sidebar chọn đề, tab chọn level. **UI và API giữ nguyên ở mọi level, chỉ kiến trúc backend thay đổi.**
- Cột phải gồm: sơ đồ kiến trúc của level đang chọn, các ý chính và trade-off, controls (tắt cache, làm Redis sập, làm crash gateway...), stats cập nhật mỗi giây, và **Request trace** (từng bước backend đã làm cho mỗi request).
- Cách học hiệu quả: làm cùng một thao tác ở 4 level rồi so sánh trace và stats.
- Cấu trúc: mỗi level có `<đề>/<đề>-<level>/api.js` (Node thuần) dùng chung `lib/api-kit.js`. Port của từng level nằm trong `labs.json`. Có thể chạy riêng một backend bằng `node newsfeed/newsfeed-junior/api.js`.

## Cách học mỗi đề (khoảng 1 tiếng)
1. Đọc README của đề, rồi tự trả lời đề bài trước (10').
2. Chạy lab từ fresher lên senior, đọc code và output (30').
3. Đọc phần "Câu hỏi hay gặp" và tự trả lời to thành tiếng (10').
4. Đổi tham số trong code (ngưỡng, kích thước, tỉ lệ lỗi) rồi chạy lại để xem trade-off thay đổi thế nào (10').

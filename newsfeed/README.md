# News Feed: System Design Interview theo 4 level

Cùng một đề bài: **"Design Facebook/Twitter news feed"**. Level càng cao thì interviewer kỳ vọng càng sâu.

> **Read-heavy.** Mỗi user mở feed khoảng 10 lần/ngày nhưng chỉ đăng khoảng 1 bài, nên đọc gấp 10 đến 100 lần ghi.
> Hệ quả: chấp nhận **ghi nhiều hơn để đọc nhanh**. Fan-out on write biến 1 bài đăng thành 200 lần ghi vào feed của các follower (write amplification), để mỗi lần đọc chỉ cần lấy 1 list có sẵn. Thêm cache và tính sẵn feed. Celebrity là ngoại lệ, vì ghi quá đắt nên chuyển sang pull.

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Data model, API cơ bản, pull model (query lúc đọc) | `newsfeed-fresher/feed.js` |
| Junior | REST API, cursor pagination, cache feed + invalidation | `newsfeed-junior/server.js` |
| Middle | Fan-out on write vs on read, celebrity problem, hybrid | `newsfeed-middle/fanout.js` |
| Senior | Estimation, async fan-out bằng queue, sharding, ranking, xử lý lỗi | `newsfeed-senior/feed-system.js` |

Chạy bằng Node 18+, không cần cài gì:
```bash
node newsfeed-fresher/feed.js
node newsfeed-junior/server.js   # terminal khác: node newsfeed-junior/client.js
node newsfeed-middle/fanout.js
node newsfeed-senior/feed-system.js
```
Mỗi folder có README riêng gồm: nên nói gì khi phỏng vấn, câu hỏi hay gặp, và trade-off. Mỗi level kết thúc bằng một **giới hạn**, và level kế tiếp giải quyết giới hạn đó.

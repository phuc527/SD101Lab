# Flash Sale / Ticket Booking (100 món, hàng nghìn người bấm cùng lúc): 4 level

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Đọc stock, kiểm tra, rồi ghi lại | `flash-sale-fresher/demo.js` |
| Junior | Transaction + row lock (`SELECT ... FOR UPDATE`) | `flash-sale-junior/demo.js` |
| Middle | Atomic conditional update, `UNIQUE(user)`, idempotency key, cache cờ sold-out | `flash-sale-middle/demo.js` |
| Senior | Trừ stock trước trong Redis (Lua), queue + ghi đơn theo batch, nói được về waiting room và reconciliation | `flash-sale-senior/demo.js` |

```bash
node flash-sale-fresher/demo.js
node flash-sale-junior/demo.js
node flash-sale-middle/demo.js
node flash-sale-senior/demo.js
```

> **Write-heavy, và dồn vào một điểm nóng.** Mỗi lần bấm "Mua" là một lần ghi có điều kiện vào **cùng một dòng** tồn kho. Lượng đọc (xem trang sản phẩm) cũng lớn nhưng dễ cache bằng CDN. Phần khó nằm ở phía ghi: hàng nghìn request/giây tranh nhau 1 counter.
> Hệ quả: phải ghi atomic (không bán lố), đưa counter nóng ra khỏi DB (Redis), loại người thua càng sớm càng tốt, và ghi đơn bất đồng bộ.

## Estimation mẫu
- 1M người chờ, 10k món. Ai cũng bấm trong khoảng 10 giây đầu, tức khoảng 100k request/s vào **1 dòng**.
- Một row lock trong Postgres chỉ chịu khoảng vài nghìn update/s trên một dòng. DB không thể đứng tuyến đầu.
- 99% request sẽ thua, nên phải từ chối chúng thật rẻ (bằng bộ nhớ, không chạm DB).

## Câu hỏi hay gặp
- Vì sao bán lố? → Đọc rồi ghi qua 2 query là race (check-then-act), cộng với lost update.
- Sửa bằng lock được không? → Đúng nhưng mọi người xếp hàng trên một dòng. Tốt hơn là `UPDATE ... SET stock = stock - 1 WHERE stock > 0`.
- Một người một món? → `UNIQUE(item_id, user_id)` trong DB, `SADD` trong Redis.
- Double click / client retry? → Idempotency key.
- 100k request/s? → Redis + Lua để trừ trước, queue để ghi đơn, waiting room hoặc rate limit ở cửa vào, CDN cho trang tĩnh.
- Người giữ hàng nhưng không trả tiền? → Reservation có TTL (ví dụ 10 phút), hết hạn thì cộng lại stock.
- Redis mất dữ liệu? → Bật AOF, dùng replica, đối soát định kỳ với DB (DB là nguồn sự thật cho đơn hàng).

# Notification System (email, SMS, push): 4 level

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Gọi provider ngay trong request, lưu bảng `notifications` | `notification-fresher/demo.js` |
| Junior | Queue + worker, trả 202, retry | `notification-junior/demo.js` |
| Middle | Queue riêng cho từng channel, backoff + jitter, DLQ, idempotency key, opt-out | `notification-middle/demo.js` |
| Senior | Priority lane, rate limit theo user, circuit breaker + provider dự phòng, fan-out broadcast bằng job | `notification-senior/demo.js` |

```bash
node notification-fresher/demo.js
node notification-junior/demo.js
node notification-middle/demo.js
node notification-senior/demo.js
```

> **Write-heavy.** Gần như mọi thứ là ghi: tạo notification, đẩy vào queue, cập nhật trạng thái mỗi lần thử, log delivery. Một broadcast có thể sinh ra hàng triệu lần ghi trong vài phút. Đọc thì ít (xem lịch sử, inbox).
> Hệ quả: dùng queue để hấp thụ burst, xử lý bất đồng bộ, at-least-once + idempotency, và tách lane theo channel/priority để phần chậm không chặn phần quan trọng.

## Estimation mẫu
- 10M user, mỗi người 5 notification/ngày = 50M/ngày, tức khoảng 600/s. Lúc broadcast lên tới 10M trong 10 phút, tức khoảng 17k/s.
- Provider giới hạn tốc độ (ví dụ SMS khoảng 100/s mỗi số gửi), nên queue phải giữ được backlog nhiều giờ.

## Câu hỏi hay gặp
- Vì sao không gửi trong request? → Fresher: latency và độ sẵn sàng của bạn bị gắn chặt vào provider.
- Làm sao không gửi trùng? → Idempotency key ở API, và truyền notification id làm idempotency key cho provider. Exactly-once thật sự là không thể, chỉ có at-least-once + dedup.
- Retry thế nào? → Exponential backoff + jitter, giới hạn số lần, rồi đưa vào DLQ.
- OTP bị chậm khi đang broadcast? → Priority lane (senior).
- Provider sập? → Circuit breaker rồi chuyển sang provider dự phòng.

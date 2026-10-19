# Junior: Queue + worker + retry

## Nên nói gì khi phỏng vấn
1. API lưu notification, đẩy vào **queue** (SQS/RabbitMQ), trả **202 Accepted** ngay.
2. **Worker** lấy từ queue, gọi provider, cập nhật status.
3. Lỗi thì **retry** (tối đa 3 lần).

## Chạy
`node demo.js`, hoặc mở UI tại `#/notification/junior`. Đặt failure rate 40%, broadcast, rồi xem các dòng "delivered 2×". Gửi OTP ngay sau broadcast: OTP phải chờ sau 200 email.

## Trade-off
API nhanh và chịu được burst. Nhưng:
- **Head-of-line blocking**: OTP bị kẹt sau tin marketing.
- **Gửi trùng**: provider đã gửi nhưng response bị timeout, retry gửi thêm lần nữa.
- Retry ngay lập tức dồn tải vào provider đang lỗi.

→ Middle.

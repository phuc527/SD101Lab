# Fresher: Gửi đồng bộ trong request

## Nên nói gì khi phỏng vấn
1. **Yêu cầu**: gửi email, SMS và push cho user. Có loại quan trọng (OTP) và loại marketing.
2. **Data model**: `notifications(id, user_id, channel, message, status, created_at)`.
3. **API**: `POST /notify {userId, channel, message}`. Server gọi SendGrid/Twilio/FCM rồi trả kết quả.

## Chạy
`node demo.js`, hoặc mở UI tại `#/notification/fresher`. Bấm broadcast: request bị treo khoảng 8 giây.

## Trade-off
Dễ hiểu và biết kết quả ngay. Nhưng API chậm bằng provider, provider sập thì API cũng lỗi, lỗi một lần là mất tin, và broadcast tới N user làm treo request N × latency. → Junior dùng queue.

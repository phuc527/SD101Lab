# Senior: Priority, rate limit theo user, circuit breaker + failover, fan-out bằng job

## Nên nói gì khi phỏng vấn
1. **Estimation** (xem README của đề): bình thường khoảng 600/s, broadcast tới khoảng 17k/s.
2. **Priority lane**: high (OTP, đổi mật khẩu) luôn được xử lý trước low (marketing). Trong thực tế là topic hoặc queue riêng.
3. **Rate limit theo user**: tối đa 3 tin low priority mỗi phút. Vừa chống spam vừa chặn bug gửi lặp.
4. **Circuit breaker**: primary lỗi 3 lần liên tiếp thì mở breaker 5 giây và chuyển sang provider dự phòng (SendGrid → SES, Twilio → Vonage).
5. **Broadcast là job**: API trả 202, job đọc danh sách user theo trang (50 user/trang) rồi enqueue.
6. Theo dõi các chỉ số: độ sâu queue, tỉ lệ lỗi theo provider, độ trễ p99 của OTP, kích thước DLQ.

## Chạy
`node demo.js`, hoặc mở UI tại `#/notification/senior`.
- Broadcast rồi bấm "Send OTP now": OTP xong ngay.
- Chọn "Primary provider down = sms" rồi gửi vài SMS: xem `breakerTrips` và `sentViaFailover`.
- Broadcast 4 lần: từ lần thứ 4, user bị throttle (giới hạn 3 tin/phút).

## Trade-off
Hai provider đồng nghĩa với hai hợp đồng, hai bộ template và chi phí khác nhau. Tin bị throttle sẽ bị bỏ (hoặc phải gộp thành digest). Low priority có thể bị "đói" khi high nhiều. At-least-once + dedup vẫn không phải exactly-once tuyệt đối.

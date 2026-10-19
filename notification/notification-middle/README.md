# Middle: Queue riêng theo channel, backoff, DLQ, idempotency

## Nên nói gì khi phỏng vấn
1. **Idempotency key** ở API: client gửi lại cùng key thì trả về id cũ, không tạo tin mới.
2. **Dedup ở provider**: gửi kèm notification id. Retry sau khi mất ack sẽ không bị gửi lần hai.
3. **Exponential backoff + jitter** (200ms, 400ms, 800ms... ± ngẫu nhiên), tối đa 5 lần rồi đưa vào **DLQ** để kiểm tra hoặc replay.
4. **Queue riêng từng channel**: SMS sập không làm kẹt push.
5. **Preferences**: user opt-out marketing email thì bỏ qua.

## Chạy
`node demo.js`, hoặc mở UI tại `#/notification/middle`. Thử "Double-submit (same key)" và "Provider down = sms".

## Trade-off
Không mất tin và không gửi trùng (với provider hỗ trợ idempotency). Nhưng trong một channel vẫn là FIFO, nên OTP vẫn chờ sau broadcast. Provider sập thì tin dồn hết vào DLQ, và chưa có giới hạn số tin cho mỗi user. → Senior.

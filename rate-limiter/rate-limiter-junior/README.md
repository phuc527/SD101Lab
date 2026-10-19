# Junior: Token bucket middleware

## Nên nói gì khi phỏng vấn
- **Token bucket**: mỗi key có một bucket chứa tối đa `capacity` token, được nạp lại `refill` token mỗi giây. Mỗi request lấy 1 token, hết token thì trả 429.
  - Cho phép **burst ngắn** (tối đa 10 request) nhưng giữ **tốc độ trung bình** (5 req/s). AWS API Gateway và Stripe dùng cách này.
- **Lazy refill**: không cần timer cho từng user. Lúc có request thì tính số token nạp thêm dựa trên `now - last`.
- **Header chuẩn**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, để client biết khi nào gửi lại (backoff).
- **Dọn dẹp bộ nhớ**: xoá bucket không dùng quá 60 giây.

## Chạy
`node server.js` (tự start server, tự test rồi tắt).

## Câu hỏi hay gặp
- Limit theo gói trả phí thì sao? → capacity/refill lấy từ config của từng gói, lưu cache.
- Có endpoint nặng hơn endpoint khác? → cho endpoint nặng tốn nhiều token hơn mỗi request (cost-based).

## Trade-off
Bucket nằm trong bộ nhớ của một process thì chạy nhanh nhưng **không dùng chung được giữa nhiều server**, và mất khi restart.

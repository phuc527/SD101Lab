# Junior: API, base62 counter, validation

## Nên nói gì khi phỏng vấn
- **Counter + base62**: lấy id auto-increment của DB rồi encode sang base62 (1000001 → `4c93`). Mỗi id là duy nhất nên **không bao giờ trùng** và không cần kiểm tra DB.
- **Idempotent**: shorten cùng một URL thì trả lại code cũ, nhờ unique index trên `long_url`. Cách này tiết kiệm storage.
- **Validate input**: chỉ nhận `http(s)`. Nếu nhận `javascript:` hay `data:` thì link rút gọn có thể bị dùng để tấn công XSS hoặc phishing.
- Status code: tạo mới trả 201, đã tồn tại trả 200, input sai trả 400, redirect trả 302, không thấy trả 404.

## Chạy
`node server.js` (tự start server, tự test rồi tắt).

## Câu hỏi hay gặp
- Có nên normalize URL không (`HTTP://A.com/` và `http://a.com`)? → nên, dùng `new URL().href`.
- Có cho user tự đặt alias không? → có thể, nhưng phải kiểm tra trùng và chặn các từ dành riêng (`api`, `admin`...).

## Trade-off
Counter không bao giờ trùng nhưng **dễ đoán**: người khác có thể duyệt lần lượt toàn bộ link. Ngoài ra một counter trong DB là single point of failure (sẽ xử lý ở level senior).

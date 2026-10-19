# Senior: Trừ stock trước trong Redis, ghi đơn qua queue

## Nên nói gì khi phỏng vấn
1. **Estimation**: khoảng 100k request/s vào một counter, 99% sẽ thua.
2. **Redis + Lua**: một script kiểm tra người này mua chưa và còn hàng không, rồi `DECR` + `SADD`. Redis đơn luồng nên script chạy atomic mà không cần lock DB.
3. **Chỉ người thắng đi tiếp**: trả 202 `queued`, đơn được đưa vào queue. Worker ghi vào DB theo batch (50 đơn mỗi `INSERT`).
4. **DB sập vẫn bán được**: đơn nằm chờ trong queue và được ghi khi DB sống lại.
5. **Vòng ngoài**: CDN cho trang sản phẩm, waiting room hoặc rate limit trước API, reservation có TTL cho bước thanh toán.
6. **Đối soát**: DB là nguồn sự thật cho đơn hàng. Bật Redis AOF và replica, chạy job so sánh Redis với DB.

## Chạy
`node demo.js`, hoặc mở UI tại `#/flash-sale/senior`.
- "Rush 500 buyers": xong gần như tức thì, và `dbQueries` chỉ khoảng 2.
- Bật "Pause order writer (DB down)" rồi rush: đơn ở trạng thái `pending` và `pendingWrites` tăng. Tắt đi thì các đơn chuyển sang `confirmed`.

## Trade-off
Thêm một hệ thống (Redis) có thể lệch với DB. Đơn hàng là eventual consistency: UI phải hiện "đang xử lý". Nếu Redis mất dữ liệu trước khi ghi xuống DB thì có thể bán lố hoặc mất đơn, nên cần AOF + đối soát. Hàng hot hơn nữa (hàng triệu request/s) thì chia stock thành nhiều key (bucket) để tránh một key nóng.

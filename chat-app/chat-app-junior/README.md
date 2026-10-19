# Junior: Real-time

## Nên nói gì khi phỏng vấn
| Cách | Cơ chế | Ưu | Nhược |
|---|---|---|---|
| Short polling | Client gọi `GET /messages` mỗi 2 giây | Đơn giản | 1M user tạo ra 500k req/s, phần lớn trả về rỗng. Tin đến trễ |
| Long polling | Server giữ request đến khi có tin hoặc timeout | Ít request rỗng | Mỗi lần nhận tin phải mở lại request |
| SSE | Một kết nối HTTP mở lâu, chỉ server đẩy xuống | Dùng HTTP thuần, tự reconnect | Một chiều |
| **WebSocket** | Kết nối 2 chiều mở lâu | **Chuẩn cho chat** (gửi, typing, đã đọc) | Stateful, khó scale (xem level senior) |

- **Persist trước, push sau**: tin nhắn luôn được ghi vào DB trước. Nếu người nhận offline thì tin vẫn còn đó, và client đồng bộ bằng `GET /messages?after=<lastId>` khi kết nối lại.
- Một user có thể có nhiều thiết bị, nên server giữ một `Set` connection cho mỗi user.

## Chạy
`node server.js` (dùng SSE vì Node không có WebSocket server sẵn, ý tưởng push là như nhau).

## Câu hỏi hay gặp
- User offline thì sao? → lưu tin, gửi push notification (APNs/FCM), rồi đồng bộ khi user mở app.
- Vì sao chưa đủ cho production? → mạng có thể làm mất hoặc lặp tin, và một server không giữ nổi hàng chục triệu connection.

## Trade-off
Push giúp tin đến ngay và không lãng phí request, nhưng server phải **giữ state** (các connection đang mở), nên khó scale và khó deploy hơn REST.

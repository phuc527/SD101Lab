# Fresher: Rate limiter cơ bản

## Nên nói gì khi phỏng vấn
1. **Mục đích**: chống spam/DDoS, bảo vệ backend, chia tài nguyên công bằng giữa các user, giới hạn theo gói trả phí.
2. **Đặt ở đâu**: ở API gateway hoặc middleware, trước business logic.
3. **Key**: theo user id (đã đăng nhập), API key, hoặc IP (chưa đăng nhập).
4. **Fixed window**: đếm số request trong mỗi cửa sổ 1 giây/1 phút. Vượt ngưỡng thì trả **429 Too Many Requests**.

## Chạy
`node fixed-window.js`

## Câu hỏi hay gặp
- Vì sao giới hạn theo IP chưa đủ? → nhiều người dùng chung một IP qua NAT, còn kẻ tấn công thì đổi IP liên tục.
- Fixed window có nhược điểm gì? → burst ở ranh giới: 5 request cuối cửa sổ này cộng 5 request đầu cửa sổ sau thành 10 request trong 180ms.

## Trade-off
Fixed window **cực rẻ** (một counter cho mỗi key) nhưng **không chính xác** ở ranh giới cửa sổ.

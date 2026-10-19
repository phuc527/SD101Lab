# Middle: Atomic conditional update, 1 món mỗi người, idempotency

## Nên nói gì khi phỏng vấn
1. **Một câu lệnh**: `UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0`. Nếu số dòng bị ảnh hưởng bằng 0 thì là hết hàng. Không còn khoảng trống giữa đọc và ghi.
2. **`UNIQUE(item_id, user_id)`** trên bảng orders: DB tự đảm bảo mỗi người một món.
3. **Idempotency key**: double click hoặc client retry đều nhận lại cùng một kết quả.
4. **Cache cờ sold-out**: khi đã hết hàng, từ chối ngay trong bộ nhớ, không chạm DB.

## Chạy
`node demo.js`, hoặc mở UI tại `#/flash-sale/middle`.
- "Double-submit (same key)": hai request nhận cùng một `orderId`.
- "Rush 500 buyers" hai lần: ở lần thứ 2, `rejectedSoldOutFast` tăng còn `dbQueries` thì gần như đứng yên. Tắt "Cache sold-out flag" rồi thử lại để so sánh.

## Trade-off
Đúng và nhanh hơn junior, vì lock chỉ giữ trong một câu lệnh. Nhưng **vẫn là một dòng nóng**: trước khi hết hàng, cả đám đông vẫn đổ vào DB, và DB là giới hạn (khoảng vài nghìn lần/s). Khi restock hoặc huỷ đơn thì phải nhớ xoá cờ sold-out. → Senior.

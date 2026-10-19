# Fresher: Đọc stock, kiểm tra, rồi ghi

## Nên nói gì khi phỏng vấn
1. Bảng `items(id, stock)` và `orders(id, item_id, user_id)`.
2. Khi mua: `SELECT stock`, nếu còn thì `UPDATE stock = stock - 1` và `INSERT order`.
3. Biết rằng có vấn đề khi nhiều người mua cùng lúc, dù chưa biết sửa thế nào.

## Chạy
`node demo.js`, hoặc mở UI tại `#/flash-sale/fresher` rồi bấm "Rush 500 buyers".

## Trade-off
Code đơn giản nhất, chạy đúng khi chỉ có một người. Khi 500 người cùng đọc `stock = 100` thì tất cả đều mua được: **bán lố**. Câu `stock = seen - 1` còn ghi đè lên kết quả của người khác (lost update), nên stock gần như không giảm. → Junior.

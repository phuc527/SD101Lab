# Junior: Transaction + row lock

## Nên nói gì khi phỏng vấn
1. `BEGIN; SELECT stock FROM items WHERE id = 1 FOR UPDATE; UPDATE ...; INSERT ...; COMMIT;`
2. Lock giữ dòng từ lúc đọc tới lúc commit, nên không còn bán lố.
3. Nhắc tới optimistic lock (cột `version`, retry khi xung đột) như một phương án khác.

## Chạy
`node demo.js`, hoặc mở UI tại `#/flash-sale/junior`. Bấm "Rush 500 buyers" và xem stat `maxLockWaitMs`. Thử tăng DB latency.

## Trade-off
Đúng, nhưng **mọi người xếp hàng trên một dòng**: request thứ 500 phải đợi 499 request trước. Người đến khi đã hết hàng cũng phải đợi lock mới biết là hết. Chưa giới hạn mỗi người một món, và double click tạo ra 2 đơn. Optimistic lock thì còn tệ hơn khi tranh chấp cao, vì hầu hết request sẽ retry. → Middle.

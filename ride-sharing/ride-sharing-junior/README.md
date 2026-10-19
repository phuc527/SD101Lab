# Junior: Geospatial index

## Nên nói gì khi phỏng vấn
- **Vấn đề**: tìm k tài xế gần nhất trong 1M tài xế mà không quét hết.
- **Chia lưới / geohash**: chia bản đồ thành các ô (khoảng 1km). Mỗi ô giữ tập tài xế trong đó. Khi tìm thì quét ô hiện tại, rồi mở rộng dần từng vòng ô xung quanh.
  - **Geohash**: mã hoá (lat, lng) thành chuỗi như `w3gv2...`. Hai điểm có chung tiền tố thì gần nhau. Redis `GEOADD`/`GEOSEARCH` dùng cách này.
  - **Quadtree**: ô tự chia nhỏ khi quá đông (xem level senior). **Google S2 / Uber H3**: ô hình cầu hoặc lục giác.
- **Cập nhật vị trí**: khi tài xế đi sang ô khác thì xoá khỏi ô cũ, thêm vào ô mới (O(1)).
- **Cẩn thận ở ranh giới ô**: tài xế gần nhất có thể nằm ở ô bên cạnh, nên phải quét thêm một vòng sau khi đã tìm thấy.

## Chạy
`node geo-index.js`. So sánh với quét toàn bộ và kiểm tra kết quả giống hệt nhau.

## Câu hỏi hay gặp
- Ô nên lớn bao nhiêu? → ô nhỏ thì phải quét nhiều ô, ô lớn thì mỗi ô chứa nhiều tài xế. Chọn theo mật độ.
- Vì sao không dùng index trên DB SQL? → vị trí thay đổi mỗi 4 giây, cập nhật B-tree liên tục quá đắt. Nên giữ trong bộ nhớ.

## Trade-off
Index trong bộ nhớ đọc nhanh và cập nhật O(1), nhưng mất khi crash (chấp nhận được, vì 4 giây sau tài xế sẽ gửi lại vị trí).

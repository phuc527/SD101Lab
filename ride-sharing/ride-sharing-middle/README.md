# Middle: Matching và concurrency

## Nên nói gì khi phỏng vấn
- **Double booking**: hai khách cùng thấy tài xế d1 rảnh. Nếu "kiểm tra rồi mới ghi" (check-then-set) thì cả hai đều được gán d1. Phải dùng thao tác **atomic**:
  - Redis `SET lock:driver:d1 r1 NX EX 10`, hoặc
  - SQL `UPDATE drivers SET status='busy' WHERE id='d1' AND status='available'` rồi kiểm tra số dòng bị ảnh hưởng.
- **Lock có TTL**: gửi offer cho tài xế. Nếu 10 giây không phản hồi thì lock **tự hết hạn**, chuyển sang tài xế kế tiếp. Không cần job dọn dẹp, và tài xế không bị kẹt mãi.
- **Thứ tự dispatch**: gửi tuần tự cho từng tài xế (ít bị huỷ ngang, nhưng chậm) hoặc gửi cho nhiều tài xế cùng lúc, ai nhận trước thì được (nhanh, nhưng làm phiền tài xế).
- **Surge pricing**: hệ số = cầu / cung theo từng khu vực (ô geohash), có giới hạn trần, tính lại mỗi 1-2 phút.

## Chạy
`node matching.js`

## Câu hỏi hay gặp
- Lock bằng Redis hay DB? → Redis nhanh và có sẵn TTL. Trạng thái cuối cùng của trip vẫn phải ghi vào DB (nguồn sự thật).
- Matching tối ưu toàn cục? → gom các request trong khoảng 2 giây, rồi ghép cặp cả lô để giảm tổng ETA (batch matching, Uber có dùng).

## Trade-off
Lock giúp không bao giờ double booking, nhưng thêm độ trễ và thêm phụ thuộc vào Redis. TTL ngắn thì khách chờ ít hơn, nhưng tài xế có ít thời gian để bấm nhận.

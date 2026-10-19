# Middle: Fan-out và celebrity problem

## Nên nói gì khi phỏng vấn
| | Push (fan-out on write) | Pull (fan-out on read) |
|---|---|---|
| Khi đăng bài | Ghi vào feed của N follower | Ghi 1 dòng |
| Khi đọc feed | Đọc 1 list đã tính sẵn (nhanh) | Merge M timeline (chậm) |
| Hợp với | User thường, đọc nhiều hơn ghi rất nhiều | Celebrity, user ít hoạt động |
| Vấn đề | Celebrity có 1M follower thì mỗi bài là 1M lần ghi | Mở feed chậm |

**Hybrid** (cách Twitter/Facebook làm): push cho user thường, pull cho celebrity (số follower vượt ngưỡng), rồi merge hai nguồn lúc đọc.

## Chạy
`node fanout.js` in ra bảng chi phí của 3 mô hình và demo hybrid chạy thật.

## Câu hỏi hay gặp
- Chọn ngưỡng celebrity thế nào? → so chi phí fan-out với chi phí merge, rồi chỉnh theo metrics thực tế.
- User không hoạt động thì sao? → không push cho họ. Khi họ quay lại thì dựng feed bằng pull.
- Có lưu cả bài viết trong feed không? → không, chỉ lưu `postId`, nội dung lấy từ post cache (gọi là hydrate).

## Trade-off
Push đọc nhanh nhưng ghi tốn, và bài đã sửa/xoá vẫn nằm trong feed của follower. Pull thì ngược lại. Hybrid phức tạp hơn nhưng cân bằng được cả hai.

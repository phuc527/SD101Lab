# Fresher: Chat cơ bản

## Nên nói gì khi phỏng vấn
1. **Yêu cầu**: chat 1-1 và chat nhóm, xem lịch sử, inbox sắp xếp theo hoạt động gần nhất.
2. **Data model**: `conversations`, `members`, `messages(conversation_id, id, sender_id, text, created_at)`.
3. **ID cho DM**: ghép cặp user đã sắp xếp (`dm:alice:bob`), để tạo DM nhiều lần cũng không bị trùng conversation.
4. **Lịch sử**: phân trang bằng cursor `beforeId` (cuộn lên để tải tin cũ), dùng index `(conversation_id, id DESC)`.
5. **Phân quyền**: chỉ thành viên mới được gửi và đọc tin.

## Chạy
`node chat.js`

## Câu hỏi hay gặp
- Vì sao không dùng `created_at` để sắp xếp? → hai tin có thể trùng timestamp, và đồng hồ client không đáng tin. Nên dùng id/seq do server cấp.
- Inbox lấy dữ liệu thế nào? → lưu `last_message_id` trên conversation, sắp xếp theo cột đó.

## Trade-off
Đọc trực tiếp từ DB thì đơn giản, nhưng user không nhận được tin mới nếu không tự hỏi lại server.

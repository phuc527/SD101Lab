# Fresher: News Feed cơ bản

## Nên nói gì khi phỏng vấn
1. **Làm rõ yêu cầu**: đăng bài, follow người khác, xem feed sắp xếp theo thời gian.
2. **Data model**: 3 bảng là `users`, `follows(follower_id, followee_id)`, `posts(id, author_id, content, created_at)`.
3. **API**: `POST /posts`, `POST /follow/:id`, `GET /feed?limit=10`.
4. **Pull model**: khi user mở feed thì query bài của những người họ follow, sắp xếp theo `created_at DESC`.
5. **Index**: `posts(author_id, created_at)` để query không phải quét toàn bộ bảng.

## Chạy
`node feed.js`

## Câu hỏi hay gặp
- Vì sao cần index `(author_id, created_at)`? → để lọc theo tác giả và sắp xếp theo thời gian ngay trong index.
- Nếu user follow 5000 người thì sao? → query chậm. Đây là lý do cần cache và fan-out ở các level sau.

## Trade-off
Pull model **đơn giản, ghi rẻ**, nhưng **đọc đắt** vì mỗi lần mở feed là một query lớn.

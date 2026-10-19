# Junior: API, pagination, cache

## Nên nói gì khi phỏng vấn
- **API**: `GET /feed?limit=10&cursor=<lastPostId>`, `POST /posts`. Xác thực bằng header/token. Giới hạn `limit` tối đa 50.
- **Cursor vs offset pagination**: với offset, khi có bài mới thì các trang bị lệch nên user thấy bài trùng hoặc bị sót. Cursor (`id < lastSeen`) ổn định hơn và nhanh hơn vì dùng được index.
- **Cache feed** (Redis list `feed:{userId}`) theo kiểu cache-aside. Khi ai đó đăng bài thì **invalidate** (xoá) cache feed của các follower.
- Validate input: thiếu content trả 400, không có user trả 401.

## Chạy
```bash
node server.js     # :3010
node client.js     # terminal khác
```

## Câu hỏi hay gặp
- Vì sao dùng cursor thay vì `OFFSET 1000`? → offset vẫn phải quét 1000 dòng, và bị lệch khi có dữ liệu mới.
- Nên invalidate hay update cache? → invalidate đơn giản hơn và tránh race condition.

## Trade-off
Cache giúp đọc nhanh, nhưng tác giả có nhiều follower sẽ gây **invalidation storm** (xoá hàng loạt cache cùng lúc). Mỗi lần cache miss lại phải dựng feed bằng query đắt.

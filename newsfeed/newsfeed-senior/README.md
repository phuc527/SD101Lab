# Senior: feed ở quy mô production

## Cấu trúc buổi phỏng vấn (45 phút)
1. **Yêu cầu + NFR** (5'): DAU 300M, độ trễ đọc p99 < 200ms, chấp nhận eventual consistency (bài hiện trễ vài giây cũng được), high availability.
2. **Estimation** (5'): khoảng 35k read QPS, khoảng 700k lượt ghi fan-out mỗi giây, feed cache khoảng 1.2TB.
3. **Kiến trúc tổng thể** (10'):
```
Client → LB → API ─┬─ Post Service → Post DB (shard theo postId) + Post cache
                   │        └─ Kafka "post_created" → Fan-out workers → Feed cache (Redis, shard theo userId)
                   └─ Feed Service → Feed cache + merge celeb timelines → Ranking → hydrate posts
```
4. **Deep dive** (20'): hybrid fan-out, sharding, ranking, xử lý lỗi.
5. **Trade-off + nút thắt** (5').

## Lab `node feed-system.js`
| # | Chủ đề | Ý chính |
|---|---|---|
| 1 | Estimation | Biến con số thành quyết định: fan-out phải async, cache phải shard |
| 2 | Consistent hashing | Thêm 1 node chỉ dời khoảng 25% key, còn `hash % N` dời khoảng 75% (gây cache miss storm) |
| 3 | Async fan-out | Queue + worker, chia chunk 100 user, retry, DLQ, ghi idempotent (Set / `ZADD`) nên retry không tạo bản trùng |
| 4 | Ranking | Điểm = affinity × trọng số loại nội dung × engagement / độ cũ, thay vì chỉ sắp theo thời gian |
| 5 | Degradation | Cache sập thì pull từ top-K followee, timeout thì trả feed trending. Không bao giờ trả 500 |

## Câu hỏi senior nên tự nêu ra
- **Hot key** (bài của celebrity bị đọc dồn dập): replicate post cache, thêm cache local trong process.
- **Xoá/sửa bài**: feed chỉ lưu id, nội dung hydrate từ post cache, nên bài đã xoá bị lọc ra lúc hydrate.
- **Độ dài feed**: giữ khoảng 500 id gần nhất cho mỗi user (`ZREMRANGEBYRANK`).
- **Multi-region**: ghi ở region gần nhất, replicate bất đồng bộ. Feed giữa các region là eventual consistency.
- **Monitoring**: Kafka consumer lag, độ trễ fan-out, cache hit ratio, feed p99.

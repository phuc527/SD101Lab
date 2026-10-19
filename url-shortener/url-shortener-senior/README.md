# Senior: URL Shortener ở quy mô lớn

## Kiến trúc
```
Client → CDN/Edge (cache redirect) → LB → Redirect Service → Redis (LRU) → KV DB (shard theo code)
                                               └→ Kafka "click" → Analytics consumer → ClickHouse
Client → LB → Shorten Service (mỗi node giữ 1 range id) → scramble → base62 → KV DB
                    └→ Ticket server / etcd (cấp range 1000 id mỗi lần)
```

## Lab `node system.js`
| # | Chủ đề | Ý chính |
|---|---|---|
| 1 | Estimation | 1.2k write QPS, 116k read QPS, 182 tỷ URL trong 5 năm, khoảng 91TB. 7 ký tự base62 là đủ |
| 2 | Cấp phát theo range | Mỗi node xin trước 1000 id, nên 30k id chỉ cần 30 lần gọi ticket server. Node crash thì mất một range (tạo khoảng trống id), chấp nhận được |
| 3 | Scramble | `id × P mod 62^7` là song ánh nên vẫn không trùng, nhưng code nhìn như ngẫu nhiên |
| 4 | Analytics bất đồng bộ | Request redirect không chờ ghi DB. Gom theo lô thì 10k lượt ghi giảm còn 250 |
| 5 | Hết hạn link | Kiểm tra khi đọc (trả 410 Gone) kết hợp cron dọn dẹp |

## Câu hỏi senior nên tự nêu ra
- **Snowflake ID** (timestamp + machineId + sequence): dùng thay cho ticket server, không cần phối hợp giữa các node, nhưng phải xử lý clock skew.
- **Chống lạm dụng**: rate limit việc tạo link (xem đề rate-limiter), quét link độc hại (Google Safe Browsing).
- **Hot link** (link viral): cache ở CDN edge, cache local trong process.
- **Multi-region**: đọc ở region gần nhất, ghi về region chủ hoặc mỗi region giữ một dải id riêng.

# Senior: Rate limiter phân tán

## Kiến trúc
```
Client → LB → API Gateway (N node) ──INCR / Lua──→ Redis Cluster (shard theo key)
                    │                                    ↑
                    └── rules cache (limit theo gói) ← Config service
```

## Lab `node distributed.js`
| # | Chủ đề | Ý chính |
|---|---|---|
| 1 | Estimation | 10M user cần khoảng 1GB. 1M req/s thì phải shard Redis |
| 2 | Counter local | 3 node, mỗi node limit 10, thì user được 30 request. Sai |
| 3 | Race condition | GET rồi SET khi có 50 request đồng thời thì cho qua khoảng 50. `INCR` atomic thì đúng 10 |
| 4 | Fail-open / fail-closed | Redis sập: endpoint đọc thì vẫn cho qua, endpoint login thì chặn |
| 5 | Lease token | Mỗi node xin 5 token một lần, số lần gọi Redis giảm khoảng 70%, đổi lại limit chỉ còn xấp xỉ |

## Câu hỏi senior nên tự nêu ra
- **Lua script**: sliding window cần đọc 2 counter rồi mới ghi, nên gói vào một script để chạy atomic trên Redis.
- **Hot key**: một user/API key bị DDoS ghi dồn vào một shard. Giải pháp: chặn sớm ở edge (WAF), dùng counter local kết hợp đồng bộ định kỳ.
- **Multi-region**: limit theo từng region (nhanh) hay toàn cục (chính xác nhưng chậm). Thường chọn theo từng region.
- **Observability**: tỉ lệ 429 theo key, độ trễ Redis, số lần chuyển sang fail-open.

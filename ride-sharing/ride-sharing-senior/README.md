# Senior: Ride sharing ở quy mô lớn

## Kiến trúc
```
Driver app ══WebSocket══ Gateway ─(ping mỗi 4s)→ Location Service ─→ Redis GEO (shard theo vùng/quadtree, TTL)
                                                     └─→ Kafka "locations" → lưu lịch sử (S3/HDFS), tính surge, ETA ML
Rider app → API → Trip Service ─→ Matching Service (đọc Redis GEO, lock tài xế) ─→ Trip DB (Postgres, transaction)
                        └─→ Payment Service (idempotency key) ─→ cổng thanh toán
```

## Lab `node system.js`
| # | Chủ đề | Ý chính |
|---|---|---|
| 1 | Estimation | 250k ghi/giây so với 230 đọc/giây. Nếu ghi mọi ping vào DB thì 2.2TB/ngày, còn nếu chỉ giữ vị trí mới nhất thì 100MB trong RAM |
| 2 | Last-write-wins + TTL | Ping đến trễ (cũ hơn bản đang lưu) thì bỏ qua. App crash thì TTL tự loại tài xế khỏi danh sách rảnh |
| 3 | Hot spot | Lưới cố định làm shard trung tâm quá tải. Quadtree tự chia nhỏ vùng đông, nên mỗi shard không vượt cap |
| 4 | AP vs CP | Vị trí cho phép mất (eventual consistency). Thanh toán dùng idempotency key nên retry không tính tiền 2 lần |

## Câu hỏi senior nên tự nêu ra
- **Giảm tải ghi**: tài xế đang chở khách hoặc đứng yên thì gửi ping thưa hơn. Gateway gom các ping lại theo lô.
- **ETA**: routing trên đồ thị đường đi (Dijkstra/A* kèm contraction hierarchies) và dữ liệu giao thông real-time. Không dùng khoảng cách chim bay.
- **Multi-region**: mỗi thành phố là một cell độc lập (dữ liệu không đi qua thành phố khác), nên lỗi ở một nơi không lan ra cả hệ thống.
- **Theo dõi chuyến đi**: khách xem xe di chuyển bằng cách subscribe vị trí của tài xế qua WebSocket (pub/sub, giống chat).

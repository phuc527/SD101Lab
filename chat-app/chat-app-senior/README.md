# Senior: Chat ở quy mô lớn

## Kiến trúc
```
Client ══WebSocket══ LB (L4, sticky) ══ Gateway 1..500 (giữ connection, stateful)
                                            │  ↑ subscribe channel "gw-{id}"
                                            ↓  │
                                   Chat Service ── Redis Pub/Sub / Kafka
                                     │   ├─ Session registry (Redis: user → gateway)
                                     │   ├─ Presence (Redis TTL)
                                     │   └─ Push notification (APNs/FCM) khi user offline
                                     └─ Message store: Cassandra (partition = conversation_id + bucket, clustering = seq)
```

## Lab `node cluster.js`
| # | Chủ đề | Ý chính |
|---|---|---|
| 1 | Estimation | Khoảng 46k msg/s, 500 gateway cho 50M connection, khoảng 800GB/ngày |
| 2 | Routing | Session registry cho biết bob đang ở gateway nào, rồi publish vào channel của gateway đó |
| 3 | Group fan-out | Nhóm 9 người trên 3 gateway chỉ cần 3 publish (một publish mỗi gateway, không phải mỗi member) |
| 4 | Presence | Heartbeat kèm TTL. Connection chết thì TTL tự hết hạn, không cần logout |
| 5 | Gateway crash | Persist trước nên không mất tin. Client reconnect vào gateway khác và sync theo `lastSeq` |

## Câu hỏi senior nên tự nêu ra
- **Deploy gateway**: drain connection từ từ, gửi thông báo "reconnect" cho client, client tự reconnect với jitter để tránh thundering herd.
- **Group rất lớn hoặc channel**: không fan-out push, member tự pull khi mở app (giống celebrity trong newsfeed).
- **Mã hoá đầu cuối (E2E)**: server chỉ lưu ciphertext, không đọc được nội dung, nên không có tính năng search phía server.
- **Multi-device**: mỗi thiết bị có `lastSeq` riêng.
- **Cassandra bucket**: partition theo `(conversation_id, tháng)` để một conversation lâu năm không tạo partition quá lớn.

# Chat App (Messenger / WhatsApp): 4 level

> **Write-heavy.** Tỉ lệ đọc/ghi gần **1:1**: mỗi tin nhắn được ghi một lần và mỗi người nhận chỉ đọc khoảng một lần (tin cũ hiếm khi đọc lại). Khác với newsfeed, ở đây không có chuyện một bài được đọc hàng triệu lần. Khối lượng ghi rất lớn (khoảng 4 tỷ tin nhắn/ngày) và ghi liên tục.
> Hệ quả: DB tối ưu cho ghi (Cassandra/HBase, LSM-tree, append-only theo `conversation_id`), **push** tin nhắn cho người nhận thay vì để họ đọc/poll, và chỉ cache những tin gần đây.

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Data model (conversations, members, messages), lịch sử chat phân trang, inbox | `chat-app-fresher/chat.js` |
| Junior | Real-time: polling, long polling, SSE, WebSocket. Push bằng SSE, user offline thì đồng bộ khi quay lại | `chat-app-junior/server.js` |
| Middle | Mạng không ổn định: seq theo từng conversation, ack và retry, idempotency, sắp xếp lại, đồng bộ theo `lastSeq` | `chat-app-middle/delivery.js` |
| Senior | Estimation, nhiều gateway kèm session registry và pub/sub, fan-out cho group, presence bằng TTL, gateway crash | `chat-app-senior/cluster.js` |

```bash
node chat-app-fresher/chat.js
node chat-app-junior/server.js     # tự start server, tự test rồi tắt
node chat-app-middle/delivery.js
node chat-app-senior/cluster.js
```

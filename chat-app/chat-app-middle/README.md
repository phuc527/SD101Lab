# Middle: Delivery guarantee và ordering

## Nên nói gì khi phỏng vấn
Mạng có thể **làm mất, lặp, đảo thứ tự** gói tin. Các kỹ thuật cần có:
| Vấn đề | Giải pháp |
|---|---|
| Request mất hoặc ack mất | Client **retry** đến khi nhận được ack (at-least-once) |
| Retry tạo tin trùng | Client sinh `clientMsgId` (UUID) **một lần**, server dedup theo id đó (idempotent) |
| Thứ tự sai | Server cấp **seq tăng dần theo từng conversation**. Client có buffer sắp xếp lại và chỉ hiển thị khi các seq liền nhau |
| Offline hoặc bị mất push | Client lưu `lastSeq`, khi reconnect gọi `sync(after=lastSeq)` |

Kết luận: **at-least-once delivery + idempotency = exactly-once display**. Exactly-once delivery thật sự thì không làm được trên mạng không tin cậy.

## Chạy
`node delivery.js`. Dùng PRNG có seed nên lần chạy nào kết quả cũng giống nhau. Có thể đổi `DROP`/`DUP` để thử.

## Câu hỏi hay gặp
- Vì sao không sắp xếp theo timestamp của client? → đồng hồ client lệch nhau, và hai tin có thể cùng timestamp.
- Cần seq toàn cục không? → không, chỉ cần theo từng conversation. Seq toàn cục sẽ thành nút thắt.
- Tin đã gửi, đã nhận, đã đọc làm thế nào? → mỗi trạng thái là một ack riêng, lưu `last_delivered_seq` và `last_read_seq` cho mỗi member.

## Trade-off
Retry và dedup tốn thêm bộ nhớ (bảng `seen` cần TTL) và có thêm độ trễ, đổi lại không mất tin và không trùng tin.

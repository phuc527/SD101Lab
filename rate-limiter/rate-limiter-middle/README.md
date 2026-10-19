# Middle: So sánh 5 thuật toán

## Nên nói gì khi phỏng vấn
| Thuật toán | Chính xác | Bộ nhớ | Burst | Dùng khi |
|---|---|---|---|---|
| Fixed window | Thấp (gấp đôi limit ở ranh giới) | 1 counter | Có, ở ranh giới | Cần đơn giản, giới hạn thô |
| Sliding log | Tuyệt đối | O(limit) mỗi key | Không | Limit nhỏ, cần chính xác (ví dụ login) |
| Sliding window counter | Xấp xỉ (Cloudflare đo sai khoảng 0.003%) | 2 counter | Rất ít | **Mặc định tốt** cho API |
| Token bucket | Tốt | 2 số | **Cho phép** burst đến capacity | API cần chịu burst ngắn (Stripe, AWS) |
| Leaky bucket | Tốt | Hàng đợi | Không, **làm phẳng** output | Bảo vệ backend cần tải đều (ví dụ gửi SMS) |

## Chạy
`node algorithms.js` chạy cả 5 thuật toán trên cùng một traffic và in bảng so sánh.

## Câu hỏi hay gặp
- Token bucket khác leaky bucket thế nào? → token bucket cho request đi ngay nếu còn token (cho phép burst). Leaky bucket xếp request vào hàng đợi và cho ra đều đặn.
- Vì sao sliding window counter là lựa chọn mặc định tốt? → chỉ cần 2 counter, sai số nhỏ, và dễ implement bằng `INCR` trên Redis.

## Trade-off
Chính xác hơn thì tốn bộ nhớ hơn (sliding log). Rẻ hơn thì chấp nhận sai số (fixed window). Sliding window counter và token bucket là điểm cân bằng.

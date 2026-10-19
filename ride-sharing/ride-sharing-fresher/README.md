# Fresher: Ride sharing cơ bản

## Nên nói gì khi phỏng vấn
1. **Yêu cầu**: khách đặt xe, hệ thống tìm tài xế gần nhất, tài xế nhận chuyến, đi, kết thúc, thanh toán.
2. **Data model**: `riders`, `drivers(status, lat, lng)`, `trips(rider_id, driver_id, status, pickup, dropoff, fare)`.
3. **State machine của trip**: `requested → accepted → in_progress → completed`, có thể `cancelled` trước khi bắt đầu. Chặn các chuyển trạng thái sai (ví dụ huỷ một chuyến đã hoàn thành).
4. **Khoảng cách**: dùng công thức Haversine trên toạ độ GPS.
5. **Tìm tài xế**: lọc tài xế `available`, sắp xếp theo khoảng cách.

## Chạy
`node ride.js`

## Câu hỏi hay gặp
- Vì sao cần state machine? → để tránh bug kiểu tính tiền 2 lần hoặc huỷ chuyến đã xong. Mỗi chuyển trạng thái là một event có thể audit.
- Khoảng cách đường chim bay có đúng không? → chỉ dùng để lọc sơ bộ. ETA thật phải tính theo bản đồ đường đi (routing service).

## Trade-off
Quét toàn bộ tài xế thì đơn giản và đúng, nhưng tốn O(N) cho mỗi request, không scale được khi có hàng triệu tài xế.

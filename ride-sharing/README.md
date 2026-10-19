# Ride Sharing (Uber / Grab): 4 level

> **Write-heavy** (phần vị trí tài xế). 1 triệu tài xế, mỗi người gửi vị trí mỗi 4 giây, tạo ra **khoảng 250k lượt ghi/giây**, trong khi chỉ có khoảng 230 yêu cầu đặt xe/giây. Tỉ lệ ghi/đọc vị trí khoảng **1000:1**.
> Hệ quả: chỉ giữ **vị trí mới nhất** trong bộ nhớ (Redis GEO), không ghi từng điểm vào DB, có TTL, chấp nhận mất vài bản cập nhật (bản sau sẽ thay thế). Ngược lại, **trip và payment** ít ghi nhưng phải nhất quán mạnh (transaction trong DB).

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Data model, state machine của trip, tìm tài xế gần nhất bằng cách quét hết | `ride-sharing-fresher/ride.js` |
| Junior | Geospatial index (chia lưới / geohash), cập nhật vị trí, so sánh với quét toàn bộ | `ride-sharing-junior/geo-index.js` |
| Middle | Matching: race khi 2 khách cùng giành 1 tài xế, lock có TTL, offer timeout, surge pricing | `ride-sharing-middle/matching.js` |
| Senior | Estimation, pipeline vị trí (giữ bản mới nhất, chống đảo thứ tự, TTL), shard theo vùng và hot spot, trip AP vs CP | `ride-sharing-senior/system.js` |

```bash
node ride-sharing-fresher/ride.js
node ride-sharing-junior/geo-index.js
node ride-sharing-middle/matching.js
node ride-sharing-senior/system.js
```

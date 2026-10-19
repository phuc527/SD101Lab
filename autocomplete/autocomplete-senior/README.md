# Senior: Shard, sampling, trending, degradation

## Nên nói gì khi phỏng vấn
1. **Estimation** (xem README của đề): khoảng 50k QPS đọc, khoảng 1k QPS ghi.
2. **Shard trie theo prefix** (a-h, i-p, q-z) và replicate mỗi shard. Prefix rỗng thì scatter-gather rồi merge top 5. Chữ "s" nóng hơn chữ "x" nên phải tách nhỏ range nóng (hoặc shard theo hash của 2 ký tự đầu).
3. **Sampling**: chỉ log 1/N search với trọng số N, giảm N lần lượng ghi. Đổi lại, term hiếm bị nhiễu hoặc mất.
4. **Trending**: điểm = count tổng + recent × boost, recent giảm một nửa sau mỗi chu kỳ (decay).
5. **Blocklist** lọc lúc build trie, không lọc lúc đọc.
6. **Graceful degradation**: shard sập thì trả cache cũ, không có cache thì trả list rỗng. Không bao giờ trả 5xx cho ô search.
7. **Cache nhiều tầng**: browser (`Cache-Control: max-age`), CDN cho prefix 1-2 ký tự, rồi tới Redis.

## Chạy
`node demo.js`, hoặc mở UI tại `#/autocomplete/senior`. Thử chọn "Shard down = i-p" rồi gõ "ja" (đã cache) và "k" (chưa cache). Thử sampling 1/10 và để ý stats `logged`.

## Trade-off
Scale được và chịu lỗi tốt, nhưng nhiều thành phần (router, aggregator, cache, replica). Shard theo prefix bị lệch tải. Trending dễ bị spam đẩy lên, nên cần abuse detection.

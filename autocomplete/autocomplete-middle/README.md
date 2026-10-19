# Middle: Tách đường đọc và ghi, aggregate theo lô, prefix cache

## Nên nói gì khi phỏng vấn
1. **Đường ghi**: search được append vào query log (Kafka/file), trả về ngay, không động vào trie.
2. **Aggregator**: mỗi N giây (thực tế là mỗi giờ hoặc mỗi ngày) đếm log, **build trie mới bên cạnh rồi swap con trỏ**. Trie đang phục vụ là read-only, nên không cần lock.
3. **Prefix cache** (Redis, TTL): prefix ngắn như "a", "j" là key nóng nhất. Mỗi lần rebuild thì xoá cache.
4. **Client**: debounce khoảng 150ms, bỏ response cũ về trễ (out-of-order), cache trên browser.

## Chạy
`node demo.js`, hoặc mở UI tại `#/autocomplete/middle`. Thử search "rust tutorial" 30 lần rồi gõ "ru": phải chờ tới lần rebuild sau mới thấy.

## Trade-off
Đọc nhanh và ổn định, ghi rẻ, nhưng **dữ liệu cũ** (stale) tới lần rebuild sau. Rebuild toàn bộ ngày càng tốn khi vocabulary lớn dần. Một server với một trie thì vẫn là giới hạn về RAM và QPS. → Senior shard.

# Autocomplete / Typeahead (Google search suggestions): 4 level

| Level | Interviewer kỳ vọng | Lab |
|---|---|---|
| Fresher | Bảng `queries(term, count)`, `LIKE 'q%' ORDER BY count LIMIT 5` | `autocomplete-fresher/demo.js` |
| Junior | Trie, cache top-K tại mỗi node, đọc O(độ dài prefix) | `autocomplete-junior/demo.js` |
| Middle | Tách read/write: log truy vấn, aggregator build lại trie theo lô, prefix cache, debounce phía client | `autocomplete-middle/demo.js` |
| Senior | Shard theo prefix, scatter-gather, sampling, trending (decay), blocklist, graceful degradation | `autocomplete-senior/demo.js` |

```bash
node autocomplete-fresher/demo.js
node autocomplete-junior/demo.js
node autocomplete-middle/demo.js
node autocomplete-senior/demo.js
```

> **Read-heavy (rất nặng).** Mỗi lần gõ phím là một lần đọc: 1 lượt search khoảng 10 lượt suggest, và rất nhiều người gõ cùng prefix ngắn.
> Hệ quả: tính sẵn top-K (trie), cache nhiều tầng (browser, CDN, Redis), cho phép dữ liệu cũ vài phút. Phía ghi (log search) thì tách ra thành pipeline bất đồng bộ, gom theo lô, có thể sampling. Đọc phải dưới 100ms, ghi thì không cần realtime.

## Estimation mẫu
- 10M DAU × 10 search/ngày × 10 ký tự/search = 1 tỉ suggest/ngày, tức khoảng 12k QPS, peak khoảng 50k QPS.
- Ghi: 100M search/ngày, tức khoảng 1.2k QPS, vào log rồi aggregate.
- Trie chứa top vài chục triệu term, mỗi node cache top 5, tổng chỉ vài GB, nên vừa RAM và có thể replicate.

## Câu hỏi hay gặp
- Vì sao không query DB mỗi lần gõ? → Xem fresher: cost = QPS × số dòng.
- Vì sao term mới search không hiện ngay? → Middle: trie được build lại theo lô. Suggestion không cần realtime.
- Shard theo gì? → Theo prefix (đơn giản, nhưng lệch tải: chữ "s" nóng hơn chữ "x") hoặc theo hash của prefix (đều tải hơn, nhưng prefix rỗng phải scatter-gather).
- Shard sập thì sao? → Autocomplete là tính năng phụ: trả cache cũ hoặc danh sách rỗng, không bao giờ làm hỏng trang search.
- Lọc nội dung xấu ở đâu? → Lúc build trie (offline), không lọc lúc đọc.

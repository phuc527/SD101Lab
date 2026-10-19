# Fresher: Autocomplete bằng một bảng DB

## Nên nói gì khi phỏng vấn
1. **Yêu cầu**: gõ prefix, hiện 5 gợi ý phổ biến nhất. Nhanh (dưới 100ms), chỉ hỗ trợ prefix, chữ thường.
2. **Data model**: `queries(term PK, count)`.
3. **API**: `GET /suggest?q=ja` trả top 5. `POST /search {term}` thì `count + 1`.
4. **Query**: `SELECT term FROM queries WHERE term LIKE 'ja%' ORDER BY count DESC LIMIT 5`.

## Chạy
`node demo.js`, hoặc mở UI tại `#/autocomplete/fresher`.

## Trade-off
Đơn giản và luôn mới, nhưng mỗi phím là một lần scan + sort. Gõ "system design" tốn 13 query. Có index B-tree thì `LIKE 'ja%'` nhanh hơn, nhưng vẫn phải sort theo count trên mọi dòng match (prefix "a" match rất nhiều dòng).

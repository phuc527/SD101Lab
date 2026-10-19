# Fresher: URL Shortener cơ bản

## Nên nói gì khi phỏng vấn
1. **Yêu cầu**: rút gọn URL dài thành code ngắn. Truy cập code thì redirect về URL gốc.
2. **Data model**: `urls(code PK, long_url, created_at)`. Thực chất là một bài toán key-value.
3. **API**: `POST /shorten {url}` trả về `{code}`. `GET /:code` trả `302 Location: long_url`.
4. **Độ dài code**: base62 (0-9, a-z, A-Z), 7 ký tự cho 62^7 ≈ 3.5 nghìn tỷ code, đủ dùng rất lâu.
5. **Sinh code**: random 7 ký tự. Nếu trùng thì sinh lại.

## Chạy
`node shortener.js`

## Câu hỏi hay gặp
- Vì sao dùng base62 mà không dùng base64? → base64 có `+` và `/`, không an toàn khi đặt trong URL.
- Nên trả 301 hay 302? → xem level middle.

## Trade-off
Random code đơn giản và khó đoán, nhưng mỗi lần tạo phải kiểm tra trùng trong DB. Shorten cùng một URL sẽ ra nhiều code khác nhau.

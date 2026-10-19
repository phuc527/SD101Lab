# Middle: chiến lược sinh code, cache, 301 vs 302

## Nên nói gì khi phỏng vấn
| Chiến lược | Ưu điểm | Nhược điểm |
|---|---|---|
| Hash URL (MD5) rồi cắt ngắn | Cùng URL luôn ra cùng code | Có thể trùng (birthday paradox), phải kiểm tra DB và salt lại |
| Random | Khó đoán | Có thể trùng, mỗi lần ghi phải kiểm tra DB |
| Counter + base62 | Không bao giờ trùng, nhanh | Dễ đoán, counter là nút thắt |

- **Birthday paradox**: mới dùng 1.4% không gian code mà đã có khoảng 1350 lần trùng. Trùng xảy ra sớm hơn nhiều so với trực giác.
- **Cache**: traffic tuân theo Zipf (một số ít link hot chiếm phần lớn click). Cache LRU 1% số link cho hit ratio khoảng 50%, cache 10% cho khoảng 73%. Dùng Redis đặt trước DB.
- **301 vs 302**: 301 thì trình duyệt cache lại nên server nhẹ hơn, nhưng mất số liệu analytics. bit.ly dùng 301, còn hệ thống cần analytics thì dùng 302.

## Chạy
`node strategies.js`

## Câu hỏi hay gặp
- Vì sao hash cắt ngắn lại trùng nhiều? → không gian code nhỏ, nên xác suất trùng tăng theo n².
- Nên dùng chính sách cache nào? → LRU, cộng TTL cho link có ngày hết hạn.

## Trade-off
Không có chiến lược nào hoàn hảo: phải đổi một trong các yếu tố (không trùng, khó đoán, không cần phối hợp giữa các server). Level senior kết hợp cả ba.

# Junior: Trie + top-K tại mỗi node

## Nên nói gì khi phỏng vấn
1. **Trie**: mỗi node là một ký tự. Tìm prefix chỉ đi qua `len(q)` node.
2. **Tính sẵn top-K tại mỗi node**: khỏi phải duyệt subtree và sort. Đọc O(len(q)), không phụ thuộc số term.
3. **Ghi**: `count++`, rồi cập nhật top-K trên mọi node dọc đường đi (len(term)+1 node).
4. Toàn bộ trie nằm trong RAM của service.

## Chạy
`node demo.js`, hoặc mở UI tại `#/autocomplete/junior`.

## Trade-off
Đọc cực nhanh, nhưng mỗi lần ghi bị nhân lên (write amplification) và ghi đồng bộ trên cùng cấu trúc đang được đọc, nên ở quy mô lớn sẽ tranh chấp lock. Term gõ sai cũng làm trie phình ra. → Middle tách ghi ra khỏi đường đọc.

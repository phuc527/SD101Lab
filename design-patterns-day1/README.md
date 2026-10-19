# Day 1 — Behavioral Design Patterns với TypeScript

Mini project: **E-commerce Order Processing System** dùng 5 behavioral pattern: Strategy, Template Method, Observer, State, Command.

## 0. Chuẩn bị

Yêu cầu Node >= 22.6 (khuyến nghị Node 24). Node chạy thẳng file `.ts` bằng type stripping, không cần build.

```bash
npm install        # chỉ cài typescript + @types/node để typecheck
npm start          # chạy demo src/main.ts
npm test           # chạy unit test (node:test)
npm run typecheck  # tsc --noEmit
```

Vì Node chỉ "xóa type" chứ không compile, code tránh các cú pháp không xóa được: không dùng `enum` (dùng union type) và không dùng parameter properties (`constructor(private x)`), mà gán field trong constructor.

## Cấu trúc

```
src/
  domain/order.ts             # Model Order + hàm tính tiền
  patterns/strategy.ts        # Step 2: thanh toán
  patterns/template-method.ts # Step 3: quy trình xử lý đơn
  patterns/observer.ts        # Step 4: domain events
  patterns/state.ts           # Step 5: vòng đời đơn hàng
  patterns/command.ts         # Step 6: thao tác giỏ hàng + undo/redo
  main.ts                     # Step 7: ghép tất cả lại
tests/patterns.test.ts        # Step 8: mỗi pattern 1 test
```

Nên đọc theo đúng thứ tự step bên dưới.

## Step 1 — Domain: `src/domain/order.ts`

Nền tảng cho mọi pattern, chỉ là data + hàm thuần:

- `OrderItem { sku, price, quantity }`
- `Order { id, customerEmail, items, discount }`
- `subtotal(order)` = tổng `price * quantity`
- `total(order)` = `max(0, subtotal - discount)` (không bao giờ âm)
- `createOrder(id, email, items = [])`

## Step 2 — Strategy: `src/patterns/strategy.ts`

**Vấn đề:** có nhiều cách thanh toán. Nếu viết `if (method === "card") ... else if ...` trong checkout thì mỗi lần thêm phương thức mới phải sửa checkout.

**Giải pháp:** mỗi thuật toán là một class implement chung interface `PaymentStrategy { name, pay(amount) }`.

| Strategy                | Quy tắc                                      |
| ----------------------- | -------------------------------------------- |
| `CreditCardPayment`     | Số thẻ phải đủ 16 chữ số, phí 2.9%           |
| `PayPalPayment`         | Phí 3.4% + 0.3                               |
| `CashOnDeliveryPayment` | Không phí, từ chối nếu số tiền > 500 (LIMIT) |

`PaymentService` là **context**: chỉ giữ một strategy và gọi `strategy.pay()`. Nó không biết strategy cụ thể là gì, và đổi được lúc runtime bằng `setStrategy()`.

```ts
const service = new PaymentService(new PayPalPayment("a@b.com"));
service.setStrategy(new CashOnDeliveryPayment());
service.checkout(130); // { success: true, message: "Pay on delivery" }
```

**Ghi nhớ:** thêm phương thức mới = thêm 1 class, không sửa code cũ (Open/Closed).

## Step 3 — Template Method: `src/patterns/template-method.ts`

**Vấn đề:** mọi loại đơn đều xử lý theo cùng thứ tự, chỉ khác vài chi tiết. Copy-paste quy trình cho từng loại thì dễ lệch nhau.

**Giải pháp:** class abstract `OrderProcessor` có method `process()` cố định khung xử lý:

1. `validate(order)`: đơn phải có item, quantity > 0, price >= 0
2. `calculateTotal(order)`: `total - discount + shippingFee(order)`
3. `payment.pay(amount)`: dùng lại Strategy ở Step 2
4. `afterPayment(order, steps)`: **hook**, mặc định không làm gì

Subclass chỉ override phần khác nhau:

- `StandardOrderProcessor`: ship 5, miễn phí khi subtotal >= 100
- `ExpressOrderProcessor`: ship 20, hook thêm bước `"priority dispatch scheduled"`

Lỗi ở bất kỳ bước nào sẽ bị bắt lại, `process()` trả về `{ success: false, error, steps }`, trong đó `steps` cho biết đã chạy tới đâu.

**Ghi nhớ:** lớp cha giữ thứ tự (abstract method = bắt buộc override, hook = tùy chọn). Đây là "Don't call us, we'll call you".

## Step 4 — Observer: `src/patterns/observer.ts`

**Vấn đề:** khi đơn được thanh toán thì cần gửi email, cập nhật kho, ghi analytics... Nếu `pay()` gọi trực tiếp từng service thì code bị dính chặt vào nhau.

**Giải pháp:** `EventBus<E>` generic, được type theo map `OrderEvents`:

```ts
type OrderEvents = {
  "order.created": { orderId; email };
  "order.paid": { orderId; amount };
  "order.shipped": { orderId; trackingCode };
  "order.cancelled": { orderId; reason };
};
```

- `subscribe(event, listener)` trả về hàm **unsubscribe**
- `publish(event, payload)` gọi mọi listener. Một listener throw thì các listener khác vẫn chạy, và lỗi được gom vào mảng `Error[]` để trả về.
- TypeScript kiểm tra payload theo tên event, nên gửi sai field sẽ báo lỗi lúc compile.

Ví dụ subscriber: `emailNotifier` (nghe `order.paid`) và `inventoryReleaser` (nghe `order.cancelled`).

**Ghi nhớ:** publisher không biết ai đang nghe. Thêm subscriber mới không phải sửa publisher.

## Step 5 — State: `src/patterns/state.ts`

**Vấn đề:** hành vi phụ thuộc trạng thái (đơn đã ship thì không được cancel...). Dùng `switch(status)` rải khắp nơi thì rất khó bảo trì.

```
Pending -> Paid -> Shipped -> Delivered
Pending | Paid -> Cancelled
```

**Giải pháp:**

- `BaseState` mặc định **từ chối mọi hành động** bằng cách throw `InvalidTransitionError("Cannot ship an order that is pending")`.
- Mỗi state chỉ override hành động mà nó cho phép, ví dụ `PendingState` override `pay` và `cancel`. `DeliveredState` và `CancelledState` không override gì cả (trạng thái cuối).
- `OrderLifecycle` là context: `pay()/ship()/deliver()/cancel()` chuyển việc cho state hiện tại. Nó ghi lại `history` và gọi callback `onChange(from, to)`. Callback này dùng để nối sang Observer.

**Ghi nhớ:** mỗi trạng thái là một class, nên luật chuyển trạng thái nằm ngay trong state đó thay vì rải trong các `if`.

## Step 6 — Command: `src/patterns/command.ts`

**Vấn đề:** cần undo/redo các thao tác trên giỏ hàng và có log lại những gì đã làm.

**Giải pháp:** mỗi thao tác là một object `Command { description, execute(), undo() }`:

- `AddItemCommand`: thêm item. Undo thì gỡ item ra.
- `RemoveItemCommand`: throw nếu SKU không tồn tại. Undo thì trả item về **đúng vị trí cũ**.
- `ApplyDiscountCommand`: lưu discount cũ để undo khôi phục lại.

`CommandHistory` là invoker:

- `run(cmd)`: chỉ ghi lịch sử khi `execute()` thành công. Chạy thành công thì **xóa redo stack**.
- `undo()` / `redo()`: trả `false` nếu không còn gì để undo/redo.
- `log`: danh sách mô tả các lệnh đã chạy.

**Ghi nhớ:** biến hành động thành object, nhờ đó lưu, hoàn tác, làm lại và log được.

## Step 7 — Ghép lại: `src/main.ts`

Demo một luồng đầy đủ:

1. **Command** dựng giỏ hàng: thêm item, áp discount, thử undo/redo. Kết quả total = 130.
2. **Strategy** đổi qua lại giữa các phương thức thanh toán, thử COD.
3. **Template Method** xử lý đơn qua `StandardOrderProcessor` bằng thẻ.
4. **State + Observer**: `OrderLifecycle` có `onChange` publish event lên `EventBus`. Chạy pending → paid → shipped, sau đó thử `cancel()` thì bị chặn vì đã ship.
5. In ra các notification mà subscriber nhận được.

```bash
npm start
```

## Step 8 — Test: `tests/patterns.test.ts`

Dùng `node:test` + `node:assert/strict` có sẵn trong Node, không cần Jest. Mỗi pattern có 1 test kiểm tra hành vi chính:

- Strategy: phí đúng, thẻ sai bị từ chối, COD vượt limit
- Template Method: free ship >= 100, hook Express, đơn rỗng thì fail
- Observer: nhận event, unsubscribe, listener lỗi không ảnh hưởng listener khác
- State: chuyển đúng thứ tự, transition sai thì throw, history đúng
- Command: undo/redo, lệnh lỗi không vào log, chạy lệnh mới thì xóa redo

```bash
npm test
```

## Tóm tắt nhanh

| Pattern         | Câu hỏi nó trả lời                      | Trong project          |
| --------------- | --------------------------------------- | ---------------------- |
| Strategy        | Làm _cách nào_? (thuật toán đổi được)   | Phương thức thanh toán |
| Template Method | Làm _theo thứ tự nào_? (khung cố định)  | Quy trình xử lý đơn    |
| Observer        | _Ai cần biết_ khi có chuyện xảy ra?     | Domain events          |
| State           | Được làm gì _ở trạng thái này_?         | Vòng đời đơn hàng      |
| Command         | Làm sao _lưu / hoàn tác_ một hành động? | Undo/redo giỏ hàng     |

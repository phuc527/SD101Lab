# Day 1 — Behavioral Design Patterns với TypeScript

Mini project **E-commerce Order Processing System** dùng 5 pattern: Strategy, Template Method, Observer, State, Command.

## Step 0 — Setup

Yêu cầu: Node.js 20+ và npm. Không cần database hay Docker.

```bash
npm install
npm run dev        # mở UI React (Vite) để bấm thử từng pattern
npm start          # tsx src/main.ts — chạy demo trên terminal
npm run dev:cli    # demo terminal, chạy lại khi sửa code
npm test           # vitest run — 9 test
npm run test:watch
npm run typecheck  # tsc
```

```
src/
  domain/order.ts             # Step 6: OrderService ghép các pattern
  patterns/strategy.ts        # Step 1
  patterns/template-method.ts # Step 2
  patterns/observer.ts        # Step 3
  patterns/state.ts           # Step 4
  patterns/command.ts         # Step 5
  main.ts                     # Step 7: demo
tests/patterns.test.ts        # Step 8
ui/                           # UI React gọi trực tiếp code trong src/
```

UI (`npm run dev`) có 6 tab ứng với Step 1–6. Mỗi nút gọi class thật trong `src/`, console bên dưới hiện `console.log` và lỗi thật, nên khi sửa code pattern thì UI cập nhật theo.

## Step 1 — Strategy (`strategy.ts`)

**Vấn đề:** `if (method === "card") ... else if (method === "paypal")`. Mỗi lần thêm provider (MoMo, Stripe...) lại phải sửa hàm này.

**Giải pháp:**

- `PaymentStrategy` là abstraction: `pay(amount): Promise<string>` trả về mã giao dịch.
- `CardPayment` và `PayPalPayment` là các strategy cụ thể. Cả hai từ chối `amount <= 0` và trả về `CARD-...` / `PAYPAL-...`.
- `PaymentService` nhận strategy qua constructor (dependency injection) và chỉ gọi `strategy.pay()`. Nó không biết provider nào đang chạy.

**Ghi nhớ:** thêm provider = thêm 1 class, không sửa `PaymentService`. Khi test có thể inject một strategy giả.

## Step 2 — Template Method (`template-method.ts`)

**Vấn đề:** mọi loại đơn đều theo cùng trình tự `validate → execute → log`, chỉ khác bước execute.

**Giải pháp:** `OrderProcessor.process()` cố định thứ tự đó.

- `validate` và `log` là `private`: lớp con không đổi được.
- `execute` là `protected abstract`: lớp con bắt buộc phải cài đặt.
- `StandardOrderProcessor` và `DigitalOrderProcessor` chỉ viết phần `execute`.

**Trade-off:** pattern này dựa vào kế thừa. Nếu các biến thể khác nhau quá nhiều thì nên dùng composition + Strategy.

## Step 3 — Observer (`observer.ts`)

**Vấn đề:** sau khi đơn được thanh toán cần gửi email, ghi audit, push notification. Nếu `OrderService` gọi trực tiếp cả ba thì nó phụ thuộc vào tất cả.

**Giải pháp:** `OrderEventEmitter`.

- `subscribe(handler)` trả về hàm `unsubscribe`.
- `publish(event)` chạy mọi handler **đồng thời** bằng `Promise.allSettled`, nên một handler lỗi không chặn các handler khác. Sau khi tất cả chạy xong, nếu có handler lỗi thì throw `"N order event handler(s) failed"`.
- `Promise.resolve().then(() => handler(event))` biến cả lỗi throw đồng bộ thành promise bị reject.
- `registerOrderObservers` đăng ký 3 subscriber: email, audit, push.

**Production:** emitter này chạy trong cùng process, event mất khi app crash. Hệ thống thật cần message broker (RabbitMQ/Kafka), retry + dead-letter queue, idempotent consumer và Transactional Outbox.

## Step 4 — State (`state.ts`)

```
PENDING -> PAID -> SHIPPED -> COMPLETED
PENDING | PAID -> CANCELLED
```

**Vấn đề:** if/else kiểm tra trạng thái rải khắp nơi, quy tắc chuyển trạng thái bị phân tán.

**Giải pháp:** bảng `transitions: Record<OrderStatus, OrderStatus[]>` gom mọi quy tắc vào một chỗ. `OrderStateMachine.transitionTo(next)` throw `Invalid transition: A -> B` nếu bước đó không có trong bảng.

| Strategy                      | State                                |
| ----------------------------- | ------------------------------------ |
| Chọn thuật toán               | Hành vi thay đổi theo trạng thái     |
| Thường được chọn từ bên ngoài | Thay đổi theo vòng đời của đối tượng |
| Card / PayPal                 | Pending / Shipped                    |

**Production:** nhiều server cùng cập nhật một order thì kiểm tra trong bộ nhớ là không đủ. Cần transaction, optimistic locking hoặc conditional update ở database.

## Step 5 — Command (`command.ts`)

**Vấn đề:** cần lịch sử thao tác, queue, retry hoặc undo, nên không thể gọi thẳng các hàm nghiệp vụ.

**Giải pháp:**

- `Command { execute() }`: mỗi thao tác là một object.
- `CommandInvoker.execute(cmd)`: chạy lệnh, chỉ lưu vào lịch sử khi chạy thành công. `getHistory()` trả về bản sao.
- `ChangeStatusCommand` nhận getter/setter và status mới. `execute` lưu status cũ, sau đó `undo()` khôi phục lại. Gọi `undo` khi chưa execute sẽ throw.

**Lưu ý:** `undo()` chưa thuộc interface `Command`. Muốn invoker undo được mọi lệnh thì thêm `UndoableCommand` (bài tập). Không dùng cách này để hoàn tiền thật.

## Step 6 — Ghép lại (`domain/order.ts`)

`OrderService` lưu các order trong một `Map<orderId, { total, state }>`:

- `create(id, total)`: validate id không rỗng, chưa tồn tại, total > 0. Tạo order với state machine `PENDING`.
- `pay(id)`: chỉ khi đơn đang `PENDING`. **Strategy** thu tiền, **State** chuyển sang `PAID`, **Observer** publish event, sau đó trả về mã giao dịch.
- `transition(id, next)` / `getStatus(id)`: thao tác với state machine.

**Giới hạn:** nếu đã thu tiền nhưng bước chuyển trạng thái hoặc publish event bị lỗi thì dữ liệu sẽ không nhất quán. Production cần idempotency key, reconciliation và outbox.

## Step 7 — Demo (`main.ts`)

```
Before payment: PENDING
Paying 250 via Card
Email sent for ORD-001
Audit logged for ORD-001
Push notification for ORD-001
Payment reference: CARD-...
After payment: PAID
After shipping: SHIPPED
```

## Step 8 — Test (`tests/patterns.test.ts`)

9 test chạy bằng vitest:

- Strategy (2): trả về đúng prefix mã giao dịch; từ chối amount = 0
- Template Method (2): chạy đúng trình tự (spy `console.log`); từ chối order ID rỗng
- Observer (2): handler nhận đúng event; handler đã unsubscribe thì không được gọi
- State (2): transition hợp lệ; `PENDING -> SHIPPED` bị chặn
- Command (1): execute, kiểm tra history, rồi undo

## Bài tập nâng cao

- [ ] Strategy: thêm `MoMoPayment` + test, không sửa `PaymentService`
- [ ] Template Method: thêm `CsvOrderProcessor`
- [ ] Observer: subscriber lỗi, kiểm tra các subscriber khác vẫn chạy
- [ ] State: không cho hủy sau khi đã giao
- [ ] Command: interface `UndoableCommand`

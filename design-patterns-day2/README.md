# Day 2 — Creational Design Patterns với TypeScript

Tiếp tục domain e-commerce của Day 1, lần này tập trung vào **cách tạo object**: Factory Method, Abstract Factory, Builder, Prototype, Singleton.

## Step 0 — Setup

Yêu cầu: Node.js 20+ và npm. Không cần database hay Docker.

```bash
npm install
npm run dev        # mở UI React (Vite) để bấm thử từng pattern
npm start          # tsx src/main.ts — chạy demo trên terminal
npm run dev:cli    # demo terminal, chạy lại khi sửa code
npm test           # vitest run — 10 test
npm run test:watch
npm run typecheck  # tsc
```

```
src/
  patterns/factory-method.ts   # Step 1
  patterns/abstract-factory.ts # Step 2
  patterns/builder.ts          # Step 3
  patterns/prototype.ts        # Step 4
  patterns/singleton.ts        # Step 5
  domain/checkout.ts           # Step 6: CheckoutService ghép các pattern
  main.ts                      # Step 7: demo
tests/patterns.test.ts         # Step 8
ui/                            # UI React gọi trực tiếp code trong src/
```

UI (`npm run dev`) có 6 tab ứng với Step 1–6. Mỗi nút gọi class thật trong `src/`, console bên dưới hiện `console.log` và lỗi thật.

**Behavioral (Day 1) và Creational (Day 2) khác nhau ở đâu?** Day 1 trả lời "các object **cư xử và giao tiếp** với nhau thế nào". Day 2 trả lời "ai **tạo** object, tạo lúc nào, tạo bằng cách nào". Mục tiêu chung là code nghiệp vụ không phải `new` một class cụ thể.

## Step 1 — Factory Method (`factory-method.ts`)

**Vấn đề:** `notify()` luôn validate người nhận rồi gửi. Nếu bên trong viết `new EmailNotifier()` thì muốn gửi SMS phải sửa hoặc copy cả hàm.

**Giải pháp:**

- `Notifier` là product: `send(recipient, message)` trả về mã gửi. Hai product cụ thể là `EmailNotifier` và `SmsNotifier`.
- `NotificationService` là creator. `notify()` giữ workflow cố định và gọi `createNotifier()`, một method `protected abstract`.
- `EmailNotificationService` và `SmsNotificationService` chỉ override `createNotifier()`.

**Ghi nhớ:** Factory Method = Template Method (Day 1) áp dụng cho bước **tạo object**. Thêm kênh Zalo = thêm 1 notifier + 1 service, không sửa `notify()`.

**Phân biệt với "simple factory":** hàm `createNotifier(type: "email" | "sms")` chứa `switch` là simple factory, không phải pattern GoF. Nó vẫn hữu ích, nhưng thêm kênh mới thì phải sửa `switch`.

## Step 2 — Abstract Factory (`abstract-factory.ts`)

**Vấn đề:** payment và shipping phải đi theo cặp cùng region: Việt Nam dùng MoMo (VND) + GHN, Mỹ dùng Stripe (USD) + UPS. Nếu client tự chọn từng class, rất dễ ghép nhầm MoMo với UPS.

**Giải pháp:**

- `RegionFactory` có hai method: `createPaymentGateway()` và `createShippingCarrier()`.
- `VietnamFactory` tạo `MoMoGateway` + `GhnCarrier`; `UsFactory` tạo `StripeGateway` + `UpsCarrier`.
- Các class cụ thể **không được export**. Client chỉ thấy interface, nên không thể ghép lệch họ.

| Factory Method            | Abstract Factory                                     |
| ------------------------- | ---------------------------------------------------- |
| Tạo **1** product         | Tạo **một họ** product đi cùng nhau                  |
| Dựa vào kế thừa (lớp con) | Dựa vào composition (inject factory)                 |
| `createNotifier()`        | `createPaymentGateway()` + `createShippingCarrier()` |

**Trade-off:** thêm region mới thì dễ (thêm 1 factory). Thêm **loại product** mới (ví dụ `TaxCalculator`) thì phải sửa interface và mọi factory.

## Step 3 — Builder (`builder.ts`)

**Vấn đề:** `new Order(id, customerId, items, address, coupon)` có nhiều tham số, dễ truyền sai thứ tự, khó biết field nào bắt buộc. Thêm field tùy chọn lại phải sửa mọi chỗ gọi.

**Giải pháp:**

- `OrderBuilder` có các bước được đặt tên: `withId`, `forCustomer`, `addItem`, `shipTo`, `withCoupon`. Mỗi bước `return this` nên gọi nối tiếp được (fluent).
- `addItem` và `withCoupon` kiểm tra input ngay khi gọi (quantity nguyên dương, coupon có tồn tại).
- `build()` kiểm tra các field bắt buộc, tính `total` (có giảm giá) và trả về `Order` đã `Object.freeze`. Không thể tồn tại một `Order` không hợp lệ.

```ts
new OrderBuilder()
  .withId("ORD-001")
  .forCustomer("alice")
  .addItem("COFFEE-1KG", 2, 100)
  .shipTo("12 Le Loi")
  .withCoupon("SALE10")
  .build(); // total = 180
```

**Lưu ý:** builder là object có state. Dùng một builder cho một order, đừng tái sử dụng sau `build()`. Với object nhỏ, một object literal + type là đủ, không cần Builder.

## Step 4 — Prototype (`prototype.ts`)

**Vấn đề:** khách bấm "Mua lại" một giỏ đã lưu rồi sửa số lượng. `{ ...saved }` chỉ là **shallow copy**: mảng `items` vẫn dùng chung, sửa bản copy làm hỏng luôn giỏ đã lưu.

**Giải pháp:**

- `Prototype<T>` có `clone(): T`.
- `OrderTemplate.clone()` dùng `structuredClone(this.items)`, nên bản copy hoàn toàn độc lập.
- Object tự biết cách copy chính nó. Client không cần biết bên trong có những field nào.

**Ghi nhớ:** `structuredClone` không copy được function và class instance (instance sẽ thành object thường). Field có kiểu phức tạp thì tự copy trong `clone()`.

## Step 5 — Singleton (`singleton.ts`)

**Vấn đề:** mã đơn phải tăng liên tục trong toàn app. Nếu mỗi nơi tự `new` một generator thì sẽ có hai đơn cùng là `ORD-001`.

**Giải pháp:**

- Constructor `private`: không ai gọi `new OrderIdGenerator()` được (TypeScript báo lỗi).
- `static getInstance()` tạo instance ở lần gọi đầu, các lần sau trả về đúng instance đó.
- `resetForTesting()` xóa instance để mỗi test bắt đầu từ `ORD-001`.

**Trade-off:** Singleton là **global state**. Test bị ảnh hưởng lẫn nhau (vì thế mới cần `resetForTesting`), và dependency bị ẩn: nhìn constructor của `CheckoutService` không thấy nó dùng generator. Trong TypeScript, một module export `const idGenerator = new OrderIdGenerator()` đã là singleton. Inject dependency qua constructor (như Day 1) thường dễ test hơn.

**Production:** singleton chỉ là "một instance trong **một process**". Chạy 3 server thì có 3 bộ đếm và ID sẽ trùng. ID thật nên dùng sequence của database, UUID hoặc Snowflake ID.

## Step 6 — Ghép lại (`domain/checkout.ts`)

`CheckoutService` nhận `RegionFactory` và `NotificationService` qua constructor. `checkout(template, couponCode?)` làm các bước:

1. **Singleton** `OrderIdGenerator.getInstance().next()` cấp mã đơn.
2. **Builder** dựng `Order` từ template, có coupon nếu truyền vào.
3. **Abstract Factory**: `createPaymentGateway().charge(total)` rồi `createShippingCarrier().ship(id)`.
4. **Factory Method**: `notifications.notify(...)` gửi thông báo cho khách.
5. Trả về `Receipt { order, currency, paymentReference, trackingCode }`.

**Prototype** dùng ở phía gọi: `saved.clone()` để "Mua lại" mà không sửa template gốc.

**Giới hạn:** giống Day 1, nếu đã charge tiền nhưng bước ship hoặc notify bị lỗi thì dữ liệu không nhất quán. Production cần idempotency key và outbox.

## Step 7 — Demo (`main.ts`)

```
Charging 350000 VND via MoMo
GHN picked up ORD-001
Email to alice@example.com: Order ORD-001 paid, tracking GHN-ORD-001
First order: ORD-001 350000 VND
Charging 765000 VND via MoMo
GHN picked up ORD-002
Email to alice@example.com: Order ORD-002 paid, tracking GHN-ORD-002
Reorder: ORD-002 765000 VND
Saved template quantity: 1
```

Lần mua lại tăng cà phê lên 3 và dùng `SALE10`: (3 × 250 000 + 2 × 50 000) × 0.9 = 765 000. Template gốc vẫn có quantity 1.

## Step 8 — Test (`tests/patterns.test.ts`)

10 test chạy bằng vitest. `beforeEach` gọi `OrderIdGenerator.resetForTesting()` và tắt `console.log`.

- Factory Method (2): mỗi lớp con tạo đúng notifier (`EMAIL-` / `SMS-`); từ chối recipient rỗng
- Abstract Factory (2): Vietnam = MoMo + GHN + VND; US = Stripe + UPS + USD
- Builder (2): build đúng total và object bị freeze; từ chối order không có item
- Prototype (1): clone là deep copy
- Singleton (2): mọi nơi dùng chung một instance và một bộ đếm; `resetForTesting` tạo instance mới
- CheckoutService (1): ghép cả 5 pattern

## Bài tập nâng cao

- [ ] Factory Method: thêm `ZaloNotificationService` + test, không sửa `NotificationService`
- [ ] Abstract Factory: thêm `SingaporeFactory` (PayNow + NinjaVan, SGD)
- [ ] Builder: thêm `withNote(text)` giới hạn 200 ký tự; coupon giảm số tiền cố định
- [ ] Prototype: thêm `PrototypeRegistry` lưu các template theo tên ("weekly-coffee")
- [ ] Singleton: bỏ Singleton, inject `IdGenerator` qua constructor của `CheckoutService` và so sánh độ dễ test

## Checklist cuối ngày

- [ ] `npm start` chạy thành công, `npm test` pass 10/10
- [ ] Giải thích được Factory Method khác Abstract Factory và khác simple factory ở đâu
- [ ] Giải thích được vì sao `{ ...obj }` không đủ cho Prototype
- [ ] Nêu được 2 nhược điểm của Singleton và cách thay thế

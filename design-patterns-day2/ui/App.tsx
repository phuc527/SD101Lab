import { useRef, useState, type ReactNode } from "react";
import {
  EmailNotificationService,
  SmsNotificationService,
  type NotificationService,
} from "../src/patterns/factory-method";
import {
  UsFactory,
  VietnamFactory,
  type RegionFactory,
} from "../src/patterns/abstract-factory";
import { OrderBuilder } from "../src/patterns/builder";
import { OrderTemplate } from "../src/patterns/prototype";
import { OrderIdGenerator } from "../src/patterns/singleton";
import { CheckoutService } from "../src/domain/checkout";
import { run, type Line } from "./run";

const SERVICES: Record<string, () => NotificationService> = {
  EmailNotificationService: () => new EmailNotificationService(),
  SmsNotificationService: () => new SmsNotificationService(),
};

const REGIONS: Record<string, () => RegionFactory> = {
  VietnamFactory: () => new VietnamFactory(),
  UsFactory: () => new UsFactory(),
};

const FAMILIES: Record<string, [string, string, string]> = {
  VietnamFactory: ["MoMoGateway", "GhnCarrier", "VND"],
  UsFactory: ["StripeGateway", "UpsCarrier", "USD"],
};

const savedTemplate = () =>
  new OrderTemplate(
    "alice@example.com",
    [
      { sku: "COFFEE-1KG", quantity: 1, unitPrice: 250_000 },
      { sku: "FILTER-100", quantity: 2, unitPrice: 50_000 },
    ],
    "12 Le Loi, District 1, HCMC",
  );

const TABS = [
  ["Factory Method", FactoryMethodPanel],
  ["Abstract Factory", AbstractFactoryPanel],
  ["Builder", BuilderPanel],
  ["Prototype", PrototypePanel],
  ["Singleton", SingletonPanel],
  ["CheckoutService", CheckoutPanel],
] as const;

export function App() {
  const [tab, setTab] = useState(0);
  const Panel = TABS[tab][1];

  return (
    <div className="wrap">
      <header>
        <h1>Day 2 · Creational Design Patterns</h1>
        <p className="muted">
          Đọc song song với <code>README.md</code>. Mỗi nút gọi code thật trong{" "}
          <code>src/</code>; console hiển thị <code>console.log</code> và lỗi
          thật.
        </p>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map(([name], i) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
          >
            <span className="n">{i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      <Panel />
    </div>
  );
}

function useConsole() {
  const [lines, setLines] = useState<Line[]>([]);
  const exec = async (label: string, fn: () => unknown) => {
    const out = await run(label, fn);
    setLines((prev) => [...prev, ...out]);
    return out;
  };
  return { lines, exec, clear: () => setLines([]) };
}

function Step(props: {
  title: string;
  problem: ReactNode;
  solution: ReactNode;
  code: string;
  lines: Line[];
  children: ReactNode;
}) {
  return (
    <section className="step">
      <div className="explain">
        <h2>{props.title}</h2>
        <p>
          <span className="label">Vấn đề</span>
          <br />
          {props.problem}
        </p>
        <p>
          <span className="label">Giải pháp</span>
          <br />
          {props.solution}
        </p>
        <pre>{props.code}</pre>
      </div>
      <div className="play">
        {props.children}
        <Console lines={props.lines} />
      </div>
    </section>
  );
}

function Console({ lines }: { lines: Line[] }) {
  return (
    <div className="console" aria-live="polite">
      {lines.length === 0 && (
        <div className="cmd">Console trống. Bấm một nút để chạy.</div>
      )}
      {lines.map((l, i) => (
        <div key={i} className={l.kind}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function Picker<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="row">
      {props.options.map((o) => (
        <button
          key={o}
          className="btn"
          aria-pressed={props.value === o}
          onClick={() => props.onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function FactoryMethodPanel() {
  const { lines, exec } = useConsole();
  const [name, setName] = useState("EmailNotificationService");
  const [to, setTo] = useState("alice@example.com");
  const notifier =
    name === "EmailNotificationService" ? "EmailNotifier" : "SmsNotifier";

  return (
    <Step
      title="Step 1 · Factory Method"
      problem={
        <>
          <code>notify()</code> có chung bước validate → gửi, nhưng nếu viết{" "}
          <code>new EmailNotifier()</code> bên trong thì không đổi kênh được.
        </>
      }
      solution={
        <>
          Lớp cha giữ workflow và gọi <code>createNotifier()</code> (abstract).
          Mỗi lớp con quyết định tạo object nào.
        </>
      }
      code={`abstract class NotificationService {\n  protected abstract createNotifier(): Notifier;\n  notify(to, msg) {\n    // validate...\n    return this.createNotifier().send(to, msg);\n  }\n}`}
      lines={lines}
    >
      <Picker options={Object.keys(SERVICES)} value={name} onChange={setName} />
      <div className="row">
        <label htmlFor="f-to">recipient</label>
        <input id="f-to" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          className="btn primary"
          onClick={() =>
            exec(`new ${name}().notify("${to}", "Order paid")`, () =>
              SERVICES[name]().notify(to, "Order paid"),
            )
          }
        >
          notify()
        </button>
      </div>
      <div className="flow">
        <span className="node fixed">notify()</span>
        <span className="arrow">→</span>
        <span className="node on">createNotifier() → {notifier}</span>
        <span className="arrow">→</span>
        <span className="node fixed">send()</span>
      </div>
      <p className="legend">
        Ô viền đứt là code lớp cha, ô đậm là phần lớp con quyết định. Xóa
        recipient để thấy validate chặn lại.
      </p>
    </Step>
  );
}

function AbstractFactoryPanel() {
  const { lines, exec } = useConsole();
  const [name, setName] = useState("VietnamFactory");
  const [amount, setAmount] = useState(250000);
  const [gateway, carrier, currency] = FAMILIES[name];

  return (
    <Step
      title="Step 2 · Abstract Factory"
      problem={
        <>
          Payment và shipping phải đi cùng nhau theo region. Tự chọn từng class
          có thể ghép nhầm MoMo (VND) với UPS (Mỹ).
        </>
      }
      solution={
        <>
          Một <code>RegionFactory</code> tạo cả họ sản phẩm. Client chỉ biết
          interface, đổi factory là đổi cả họ.
        </>
      }
      code={`interface RegionFactory {\n  createPaymentGateway(): PaymentGateway;\n  createShippingCarrier(): ShippingCarrier;\n}\nconst factory = new ${name}();`}
      lines={lines}
    >
      <Picker options={Object.keys(REGIONS)} value={name} onChange={setName} />
      <div className="flow">
        <span className="node on">{gateway}</span>
        <span className="node on">{carrier}</span>
        <span className="node fixed">{currency}</span>
      </div>
      <div className="row">
        <label htmlFor="a-amt">amount</label>
        <input
          id="a-amt"
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn primary"
          onClick={() =>
            exec(`factory.createPaymentGateway().charge(${amount})`, () =>
              REGIONS[name]().createPaymentGateway().charge(amount),
            )
          }
        >
          charge()
        </button>
        <button
          className="btn primary"
          onClick={() =>
            exec(`factory.createShippingCarrier().ship("ORD-001")`, () =>
              REGIONS[name]().createShippingCarrier().ship("ORD-001"),
            )
          }
        >
          ship()
        </button>
      </div>
      <p className="legend">
        Các class MoMoGateway, UpsCarrier… không được export: client không thể
        tự ghép lệch họ.
      </p>
    </Step>
  );
}

function BuilderPanel() {
  const { lines, exec } = useConsole();
  const builder = useRef(new OrderBuilder());
  const [calls, setCalls] = useState<string[]>([]);
  const [sku, setSku] = useState("COFFEE-1KG");
  const [qty, setQty] = useState(2);
  const [price, setPrice] = useState(100);
  const [address, setAddress] = useState("12 Le Loi");

  const call = async (label: string, fn: (b: OrderBuilder) => unknown) => {
    const out = await exec(`.${label}`, () => fn(builder.current));
    if (out.at(-1)?.kind === "ok" && !label.startsWith("build")) {
      setCalls((c) => [...c, `.${label}`]);
    }
  };

  return (
    <Step
      title="Step 3 · Builder"
      problem={
        <>
          Constructor{" "}
          <code>new Order(id, customer, items, address, coupon…)</code> quá
          nhiều tham số, dễ truyền sai thứ tự, khó biết field nào bắt buộc.
        </>
      }
      solution={
        <>
          Gọi từng bước có tên rõ ràng. <code>build()</code> kiểm tra mọi điều
          kiện một lần và trả về <code>Order</code> đã freeze.
        </>
      }
      code={`new OrderBuilder()\n${calls.map((c) => `  ${c}`).join("\n") || "  // bấm các nút bên phải"}\n  .build();`}
      lines={lines}
    >
      <div className="row">
        <button
          className="btn"
          onClick={() => call(`withId("ORD-001")`, (b) => b.withId("ORD-001"))}
        >
          withId
        </button>
        <button
          className="btn"
          onClick={() =>
            call(`forCustomer("alice")`, (b) => b.forCustomer("alice"))
          }
        >
          forCustomer
        </button>
        <button
          className="btn"
          onClick={() =>
            call(`withCoupon("SALE10")`, (b) => b.withCoupon("SALE10"))
          }
        >
          withCoupon(SALE10)
        </button>
        <button
          className="btn"
          onClick={() =>
            call(`withCoupon("FREE")`, (b) => b.withCoupon("FREE"))
          }
        >
          withCoupon(FREE)
        </button>
      </div>
      <div className="row">
        <input
          aria-label="sku"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
        <input
          aria-label="quantity"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
        <input
          aria-label="unit price"
          type="number"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <button
          className="btn"
          onClick={() =>
            call(`addItem("${sku}", ${qty}, ${price})`, (b) =>
              b.addItem(sku, qty, price),
            )
          }
        >
          addItem
        </button>
      </div>
      <div className="row">
        <input
          aria-label="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => call(`shipTo("${address}")`, (b) => b.shipTo(address))}
        >
          shipTo
        </button>
      </div>
      <div className="row">
        <button
          className="btn primary"
          onClick={() => call("build()", (b) => b.build())}
        >
          build()
        </button>
        <button
          className="btn"
          onClick={() => {
            builder.current = new OrderBuilder();
            setCalls([]);
          }}
        >
          new OrderBuilder()
        </button>
      </div>
      <p className="legend">
        Bấm build() trước khi đủ field để thấy lỗi. Thử quantity = 0 hoặc coupon
        FREE.
      </p>
    </Step>
  );
}

function PrototypePanel() {
  const { lines, exec } = useConsole();
  const saved = useRef(savedTemplate());
  const copy = useRef<OrderTemplate | null>(null);
  const [mode, setMode] = useState("");
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);

  const qty = (t: OrderTemplate | null) => t?.items[0].quantity ?? "—";

  return (
    <Step
      title="Step 4 · Prototype"
      problem={
        <>
          Khách bấm “Mua lại” rồi sửa số lượng. Copy bằng{" "}
          <code>{"{ ...saved }"}</code> chỉ là shallow copy: mảng{" "}
          <code>items</code> vẫn dùng chung, sửa bản copy làm hỏng giỏ đã lưu.
        </>
      }
      solution={
        <>
          Object tự biết cách copy chính nó: <code>clone()</code> dùng{" "}
          <code>structuredClone(items)</code> nên hai bản độc lập.
        </>
      }
      code={`const reorder = saved.clone();\nreorder.items[0].quantity += 1;\nsaved.items[0].quantity; // không đổi`}
      lines={lines}
    >
      <div className="row">
        <button
          className="btn primary"
          onClick={() => {
            copy.current = saved.current.clone();
            setMode("clone()");
            exec("const copy = saved.clone()", () => undefined);
          }}
        >
          saved.clone()
        </button>
        <button
          className="btn"
          onClick={() => {
            copy.current = { ...saved.current } as OrderTemplate;
            setMode("{ ...saved }");
            exec("const copy = { ...saved } // shallow", () => undefined);
          }}
        >
          {"{ ...saved }"}
        </button>
        <button
          className="btn"
          disabled={!copy.current}
          onClick={async () => {
            await exec("copy.items[0].quantity += 1", () => {
              copy.current!.items[0].quantity += 1;
            });
            refresh();
          }}
        >
          copy.items[0].quantity += 1
        </button>
      </div>
      <div className="states">
        <div>
          <span className="label">saved · COFFEE qty</span>
          <div className="big">{qty(saved.current)}</div>
        </div>
        <div>
          <span className="label">copy {mode && `(${mode})`}</span>
          <div className="big">{qty(copy.current)}</div>
        </div>
      </div>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            saved.current = savedTemplate();
            copy.current = null;
            setMode("");
            refresh();
          }}
        >
          Reset
        </button>
      </div>
      <p className="legend">
        Dùng {"{ ...saved }"} rồi tăng quantity: saved cũng tăng theo. Đó là bug
        Prototype giải quyết.
      </p>
    </Step>
  );
}

function SingletonPanel() {
  const { lines, exec } = useConsole();
  const [, rerender] = useState(0);
  const first = useRef<OrderIdGenerator | null>(null);
  const caller = (who: string) => async () => {
    await exec(`OrderIdGenerator.getInstance().next() // ${who}`, () => {
      const instance = OrderIdGenerator.getInstance();
      first.current ??= instance;
      console.log(`same instance as first call: ${instance === first.current}`);
      return instance.next();
    });
    rerender((n) => n + 1);
  };

  return (
    <Step
      title="Step 5 · Singleton"
      problem="Mã đơn phải tăng liên tục trong toàn app. Nếu mỗi nơi tự new một generator thì sẽ có hai đơn ORD-001."
      solution={
        <>
          Constructor <code>private</code>, chỉ lấy object qua{" "}
          <code>getInstance()</code>. Mọi nơi gọi đều nhận cùng một instance.
        </>
      }
      code={`class OrderIdGenerator {\n  private static instance?: OrderIdGenerator;\n  private constructor() {}\n  static getInstance() {\n    this.instance ??= new OrderIdGenerator();\n    return this.instance;\n  }\n}\n\nnew OrderIdGenerator(); // TS error: private`}
      lines={lines}
    >
      <span className="label">Hai nơi khác nhau trong app cùng xin ID</span>
      <div className="row">
        <button className="btn primary" onClick={caller("CheckoutPage")}>
          CheckoutPage
        </button>
        <button className="btn primary" onClick={caller("AdminPanel")}>
          AdminPanel
        </button>
      </div>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            OrderIdGenerator.resetForTesting();
            first.current = null;
            exec("OrderIdGenerator.resetForTesting()", () => undefined);
          }}
        >
          resetForTesting()
        </button>
      </div>
      <p className="legend">
        Hai nút dùng chung bộ đếm. Tab CheckoutService cũng dùng chung instance
        này. resetForTesting() cho thấy cái giá: state toàn cục phải được dọn
        giữa các test.
      </p>
    </Step>
  );
}

function CheckoutPanel() {
  const { lines, exec } = useConsole();
  const [region, setRegion] = useState("VietnamFactory");
  const [channel, setChannel] = useState("EmailNotificationService");
  const saved = useRef(savedTemplate());
  const service = () =>
    new CheckoutService(REGIONS[region](), SERVICES[channel]());

  return (
    <Step
      title="Step 6–7 · CheckoutService"
      problem="Ghép cả 5 pattern vào một luồng thanh toán."
      solution={
        <>
          <b>Singleton</b> cấp ID → <b>Builder</b> dựng Order từ template →{" "}
          <b>Abstract Factory</b> charge + ship → <b>Factory Method</b> gửi
          thông báo. <b>Prototype</b> dùng cho “Mua lại”.
        </>
      }
      code={`const checkout = new CheckoutService(\n  new ${region}(), new ${channel}());\nawait checkout.checkout(saved);\n\nconst reorder = saved.clone();\nreorder.items[0].quantity = 3;\nawait checkout.checkout(reorder, "SALE10");`}
      lines={lines}
    >
      <span className="label">Region</span>
      <Picker
        options={Object.keys(REGIONS)}
        value={region}
        onChange={setRegion}
      />
      <span className="label">Notification</span>
      <Picker
        options={Object.keys(SERVICES)}
        value={channel}
        onChange={setChannel}
      />
      <div className="row">
        <button
          className="btn primary"
          onClick={() =>
            exec("checkout.checkout(saved)", () =>
              service().checkout(saved.current),
            )
          }
        >
          checkout(saved)
        </button>
        <button
          className="btn primary"
          onClick={() =>
            exec(`checkout(clone with qty 3, "SALE10")`, () => {
              const reorder = saved.current.clone();
              reorder.items[0].quantity = 3;
              return service().checkout(reorder, "SALE10");
            })
          }
        >
          Mua lại (qty 3, SALE10)
        </button>
      </div>
      <p className="legend">
        Order ID tăng dần qua mọi lần checkout vì dùng chung Singleton. Template
        đã lưu không bị sửa khi mua lại.
      </p>
    </Step>
  );
}

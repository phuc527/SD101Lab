import { useRef, useState, type ReactNode } from "react";
import {
  CardPayment,
  PayPalPayment,
  PaymentService,
  type PaymentStrategy,
} from "../src/patterns/strategy";
import {
  DigitalOrderProcessor,
  StandardOrderProcessor,
} from "../src/patterns/template-method";
import {
  OrderEventEmitter,
  type OrderCreatedHandler,
} from "../src/patterns/observer";
import { OrderStateMachine, type OrderStatus } from "../src/patterns/state";
import { ChangeStatusCommand, CommandInvoker } from "../src/patterns/command";
import { OrderService } from "../src/domain/order";
import { run, type Line } from "./run";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
];

const STRATEGIES: Record<string, () => PaymentStrategy> = {
  CardPayment: () => new CardPayment(),
  PayPalPayment: () => new PayPalPayment(),
};

const TABS = [
  ["Strategy", StrategyPanel],
  ["Template Method", TemplatePanel],
  ["Observer", ObserverPanel],
  ["State", StatePanel],
  ["Command", CommandPanel],
  ["OrderService", ServicePanel],
] as const;

export function App() {
  const [tab, setTab] = useState(0);
  const Panel = TABS[tab][1];

  return (
    <div className="wrap">
      <header>
        <h1>Day 1 · Behavioral Design Patterns</h1>
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

function StrategyPanel() {
  const { lines, exec } = useConsole();
  const [name, setName] = useState("CardPayment");
  const [amount, setAmount] = useState(250);

  return (
    <Step
      title="Step 1 · Strategy"
      problem={
        <>
          Chuỗi <code>if (method === "card") … else if …</code>. Mỗi provider
          mới phải sửa cùng một hàm.
        </>
      }
      solution={
        <>
          <code>PaymentService</code> nhận <code>PaymentStrategy</code> qua
          constructor và chỉ gọi <code>strategy.pay()</code>.
        </>
      }
      code={`const service = new PaymentService(new ${name}());\nawait service.execute(${amount});`}
      lines={lines}
    >
      <Picker
        options={Object.keys(STRATEGIES)}
        value={name}
        onChange={setName}
      />
      <div className="row">
        <label htmlFor="s-amt">amount</label>
        <input
          id="s-amt"
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn primary"
          onClick={() =>
            exec(`new PaymentService(new ${name}()).execute(${amount})`, () =>
              new PaymentService(STRATEGIES[name]()).execute(amount),
            )
          }
        >
          execute(amount)
        </button>
      </div>
      <p className="legend">Thử amount = 0 để thấy lỗi.</p>
    </Step>
  );
}

const PROCESSORS = {
  StandardOrderProcessor: () => new StandardOrderProcessor(),
  DigitalOrderProcessor: () => new DigitalOrderProcessor(),
};
type ProcessorName = keyof typeof PROCESSORS;

function TemplatePanel() {
  const { lines, exec } = useConsole();
  const [name, setName] = useState<ProcessorName>("StandardOrderProcessor");
  const [id, setId] = useState("ORD-001");
  const [failed, setFailed] = useState<boolean | null>(null);

  return (
    <Step
      title="Step 2 · Template Method"
      problem={
        <>
          Mọi loại đơn đều đi <code>validate → execute → log</code>, chỉ khác
          bước giữa.
        </>
      }
      solution={
        <>
          <code>process()</code> ở lớp cha cố định thứ tự. Ô viền đứt là{" "}
          <code>private</code>, ô viền liền là <code>execute</code> mà lớp con
          tự viết.
        </>
      }
      code={`abstract class OrderProcessor {\n  async process(orderId) {\n    this.validate(orderId); // private\n    await this.execute(orderId); // abstract\n    this.log(orderId); // private\n  }\n}`}
      lines={lines}
    >
      <Picker
        options={Object.keys(PROCESSORS) as ProcessorName[]}
        value={name}
        onChange={setName}
      />
      <div className="row">
        <label htmlFor="t-id">orderId</label>
        <input id="t-id" value={id} onChange={(e) => setId(e.target.value)} />
        <button
          className="btn primary"
          onClick={async () => {
            const out = await exec(`new ${name}().process("${id}")`, () =>
              PROCESSORS[name]().process(id),
            );
            setFailed(out.at(-1)?.kind === "err");
          }}
        >
          process(id)
        </button>
      </div>
      <div className="flow">
        <span
          className={`node fixed ${failed === null ? "" : failed ? "bad" : "on"}`}
        >
          validate()
        </span>
        <span className="arrow">→</span>
        <span className={`node ${failed === false ? "on" : ""}`}>
          execute()
        </span>
        <span className="arrow">→</span>
        <span className={`node fixed ${failed === false ? "on" : ""}`}>
          log()
        </span>
      </div>
      <p className="legend">Xóa trắng orderId để thấy validate chặn lại.</p>
    </Step>
  );
}

const SUBSCRIBERS: { name: string; handler: OrderCreatedHandler }[] = [
  { name: "Email", handler: (e) => console.log(`Email sent for ${e.orderId}`) },
  {
    name: "Audit",
    handler: (e) => console.log(`Audit logged for ${e.orderId}`),
  },
  {
    name: "Push",
    handler: (e) => console.log(`Push notification for ${e.orderId}`),
  },
  {
    name: "Failing handler",
    handler: () => {
      throw new Error("SMTP timeout");
    },
  },
];

function ObserverPanel() {
  const { lines, exec } = useConsole();
  // One real emitter; each value is the unsubscribe function returned by subscribe().
  const emitter = useRef(new OrderEventEmitter());
  const unsubs = useRef(new Map<string, () => void>());
  const [active, setActive] = useState<string[]>([]);

  const toggle = (name: string) => {
    const off = unsubs.current.get(name);
    if (off) {
      off();
      unsubs.current.delete(name);
      exec(`unsubscribe() // ${name}`, () => undefined);
    } else {
      const sub = SUBSCRIBERS.find((s) => s.name === name)!;
      unsubs.current.set(name, emitter.current.subscribe(sub.handler));
      exec(`subscribe(${name})`, () => undefined);
    }
    setActive([...unsubs.current.keys()]);
  };

  return (
    <Step
      title="Step 3 · Observer"
      problem={
        <>
          Sau thanh toán cần email, audit, push. Gọi thẳng cả ba khiến{" "}
          <code>OrderService</code> phụ thuộc vào tất cả.
        </>
      }
      solution={
        <>
          <code>publish()</code> chạy mọi handler bằng{" "}
          <code>Promise.allSettled</code>. Handler lỗi không chặn handler khác;
          cuối cùng mới throw.
        </>
      }
      code={`const unsubscribe = events.subscribe(handler);\nawait events.publish({ orderId, total });\nunsubscribe();`}
      lines={lines}
    >
      <span className="label">Bấm để subscribe / unsubscribe</span>
      <div className="row">
        {SUBSCRIBERS.map((s) => (
          <button
            key={s.name}
            className="btn"
            aria-pressed={active.includes(s.name)}
            onClick={() => toggle(s.name)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className="btn primary"
          onClick={() =>
            exec(`publish({ orderId: "ORD-001", total: 250 })`, () =>
              emitter.current.publish({ orderId: "ORD-001", total: 250 }),
            )
          }
        >
          publish(event)
        </button>
      </div>
      <p className="legend">
        Bật “Failing handler” (bài tập nâng cao): các handler khác vẫn chạy.
      </p>
    </Step>
  );
}

const TRANSITIONS_CODE = `PENDING:   ["PAID", "CANCELLED"]
PAID:      ["SHIPPED", "CANCELLED"]
SHIPPED:   ["COMPLETED"]
COMPLETED: []
CANCELLED: []`;

function StatePanel() {
  const { lines, exec } = useConsole();
  const machine = useRef(new OrderStateMachine());
  const [status, setStatus] = useState<OrderStatus>("PENDING");

  return (
    <Step
      title="Step 4 · State"
      problem="If/else kiểm tra trạng thái rải khắp code."
      solution={
        <>
          Một bảng <code>transitions</code> duy nhất;{" "}
          <code>transitionTo(next)</code> throw nếu bước đó không có trong bảng.
        </>
      }
      code={TRANSITIONS_CODE}
      lines={lines}
    >
      <span className="label">status</span>
      <div className="big">{status}</div>
      <span className="label">transitionTo(…)</span>
      <div className="states">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn ${s === status ? "cur" : ""}`}
            onClick={async () => {
              await exec(`transitionTo("${s}")`, () =>
                machine.current.transitionTo(s),
              );
              setStatus(machine.current.status);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            machine.current = new OrderStateMachine();
            setStatus(machine.current.status);
            exec("new OrderStateMachine()", () => machine.current.status);
          }}
        >
          new OrderStateMachine()
        </button>
      </div>
    </Step>
  );
}

function CommandPanel() {
  const { lines, exec } = useConsole();
  const status = useRef("PENDING");
  const invoker = useRef(new CommandInvoker());
  const [history, setHistory] = useState<ChangeStatusCommand[]>([]);
  const [, rerender] = useState(0);
  const refresh = () => {
    setHistory(invoker.current.getHistory() as ChangeStatusCommand[]);
    rerender((n) => n + 1);
  };

  return (
    <Step
      title="Step 5 · Command"
      problem="Cần lịch sử, queue, retry, undo nên không gọi thẳng hàm nghiệp vụ."
      solution={
        <>
          Mỗi thao tác là một object. <code>CommandInvoker</code> chỉ lưu vào
          history khi chạy thành công; <code>undo()</code> khôi phục status cũ.
        </>
      }
      code={`const cmd = new ChangeStatusCommand(\n  () => status, (s) => (status = s), "PAID");\nawait invoker.execute(cmd);\ncmd.undo();`}
      lines={lines}
    >
      <span className="label">status</span>
      <div className="big">{status.current}</div>
      <span className="label">invoker.execute(new ChangeStatusCommand(…))</span>
      <div className="row">
        {STATUSES.map((next) => (
          <button
            key={next}
            className="btn"
            onClick={async () => {
              const cmd = new ChangeStatusCommand(
                () => status.current,
                (s) => (status.current = s),
                next,
              );
              await exec(`invoker.execute(cmd → ${next})`, () =>
                invoker.current.execute(cmd),
              );
              refresh();
            }}
          >
            {next}
          </button>
        ))}
      </div>
      <span className="label">
        invoker.getHistory() · bấm undo trên từng lệnh
      </span>
      <ol className="history">
        {history.length === 0 && <li className="muted">(rỗng)</li>}
        {history.map((cmd, i) => (
          <li key={i}>
            ChangeStatusCommand #{i + 1}{" "}
            <button
              className="btn small"
              onClick={async () => {
                await exec(`history[${i}].undo()`, () => cmd.undo());
                refresh();
              }}
            >
              undo()
            </button>
          </li>
        ))}
      </ol>
      <p className="legend">
        undo hai lần trên cùng lệnh sẽ throw. History không bị xóa khi undo.
      </p>
    </Step>
  );
}

function ServicePanel() {
  const { lines, exec, clear } = useConsole();
  const [name, setName] = useState("CardPayment");
  const make = (n: string) => {
    const events = new OrderEventEmitter();
    SUBSCRIBERS.slice(0, 3).forEach((s) => events.subscribe(s.handler));
    return new OrderService(STRATEGIES[n](), events);
  };
  const service = useRef(make(name));
  const [status, setStatus] = useState("Chưa có order");
  const sync = () => {
    try {
      setStatus(service.current.getStatus("ORD-001"));
    } catch {
      setStatus("Chưa có order");
    }
  };
  const reset = (n = name) => {
    service.current = make(n);
    clear();
    sync();
  };

  return (
    <Step
      title="Step 6–7 · OrderService"
      problem="Ghép các pattern thành một luồng nghiệp vụ."
      solution={
        <>
          <code>pay()</code>: <b>Strategy</b> thu tiền → <b>State</b> sang PAID
          → <b>Observer</b> publish event.
        </>
      }
      code={`await orders.create("ORD-001", 250);\nconst ref = await orders.pay("ORD-001");\norders.transition("ORD-001", "SHIPPED");`}
      lines={lines}
    >
      <Picker
        options={Object.keys(STRATEGIES)}
        value={name}
        onChange={(n) => {
          setName(n);
          reset(n);
        }}
      />
      <div className="row">
        <button
          className="btn primary"
          onClick={async () => {
            await exec(`create("ORD-001", 250)`, () =>
              service.current.create("ORD-001", 250),
            );
            sync();
          }}
        >
          create
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            await exec(`pay("ORD-001")`, () => service.current.pay("ORD-001"));
            sync();
          }}
        >
          pay
        </button>
        {(["SHIPPED", "COMPLETED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            className="btn"
            onClick={async () => {
              await exec(`transition("ORD-001", "${s}")`, () =>
                service.current.transition("ORD-001", s),
              );
              sync();
            }}
          >
            → {s}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => reset()}>
          Reset
        </button>
        <span className="legend">ORD-001: {status}</span>
      </div>
      <p className="legend">Thử pay hai lần, hoặc SHIPPED trước khi pay.</p>
    </Step>
  );
}

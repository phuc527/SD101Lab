# Tree Shaking Lab — Vì sao bundle FE phình to và cách sửa

Lab này build từng ví dụ bằng **Vite thật** (production, minify), rồi so sánh bản ❌ `bad.ts` với bản ✅ `good.ts`: bundle nặng bao nhiêu KB và file nào trong `lib/` bị kéo vào.

## Step 0 — Setup

Yêu cầu: Node.js 20+.

```bash
npm install
npm run measure    # build 10 bundle (5 case × bad/good), in bảng so sánh
npm test           # vitest: kiểm chứng good luôn nhẹ hơn bad
npm run typecheck
```

```
lib/                     # "thư viện" giả lập, có kích thước thật
  icons.ts               # 300 icon (kiểu lucide/heroicons) — ESM, pure
  format.ts              # formatPrice/formatDate/timeAgo — ESM, dùng Intl
  legacy-format.cjs      # formatDate kiểu moment — CommonJS
  locales-data.cjs       # bảng tháng/thứ của 74 locale (~50 KB)
  string-utils.ts        # cùng helper, viết kiểu class static và kiểu function
  chart.ts               # chart + 400 palette, có side effect top-level
  index.ts               # barrel re-export format + icons + chart
cases/NN-ten-case/
  bad.ts                 # cách viết làm hỏng tree shaking
  good.ts                # cách sửa
measure.ts               # build + đo
```

## Tree shaking là gì?

Tree shaking = bundler **bỏ code không dùng** khỏi bundle production. Nó hoạt động nhờ ESM (`import`/`export`) **tĩnh**: chỉ cần đọc code (không chạy) là biết module A dùng export nào của module B. Export nào không ai dùng thì bị loại.

Bundler chỉ được bỏ code khi **chứng minh được** bỏ đi không làm đổi hành vi. Nên mọi thứ khiến nó "không chắc" đều làm nó giữ lại code:

| Nguyên nhân | Bundler nghĩ gì |
| --- | --- |
| Truy cập động `obj[name]` | "name có thể là bất kỳ export nào → giữ hết" |
| Side effect ở top-level module | "import module này có thể đổi global state → không bỏ được" |
| CommonJS `module.exports = {...}` | "export được gán lúc runtime → không phân tích được" |
| Class / object gom method | "method có thể gọi qua `this`, kế thừa, `Class[name]` → giữ cả class" |

**Vì sao lại lag?** Mỗi KB JS thừa tốn 3 lần: **tải** qua mạng, **parse/compile**, rồi **execute** top-level code. Trên điện thoại tầm trung, parse + compile JS thường chậm hơn cả tải. Kết quả là trang hiện chậm (LCP) và bấm không phản hồi (INP/TBT) trong lúc main thread đang bận xử lý code user không bao giờ dùng.

> Thư viện trong lab cố ý nhỏ (vài chục KB) để build nhanh. Ngoài đời con số lớn hơn nhiều: `moment` + toàn bộ locale ~70 KB gzip, `lodash` (CJS) ~25 KB gzip dù chỉ dùng `debounce`, import nguyên một icon set có thể lên hàng trăm KB.

## Kết quả (`npm run measure`)

| Case | ❌ bad (gzip) | ✅ good (gzip) | File lọt vào bundle bad |
| --- | --- | --- | --- |
| 01 namespace dynamic | 8.3 KB | 0.1 KB | cả 300 icon |
| 02 barrel side effect | 10.3 KB | 0.1 KB | `chart.ts`, `chart-palettes.ts` |
| 03 commonjs | 11.1 KB | 0.1 KB | `legacy-format.cjs`, `locales-data.cjs` |
| 04 class static | 0.5 KB | 0.2 KB | cả 6 method của `StringUtils` |
| 05 lazy import | 10.5 KB initial | 0.9 KB initial | `chart.ts` (good: tách chunk riêng) |

Cột `slow 4G` trong output là ước lượng thời gian **chỉ để tải** (~200 KB/s), chưa tính parse.

## Case 01 — Truy cập động qua namespace

```ts
// ❌ bad
import * as Icons from "../../lib/icons";
const name = (n: string) => Icons[`Icon${n}`];
```

`Icons[...]` với key tính lúc runtime → bundler không biết icon nào được dùng → giữ cả 300.

```ts
// ✅ good
import { IconCart, IconHeart } from "../../lib/icons";
```

**Lưu ý:** `import * as Icons` **không** có lỗi; `Icons.IconCart` (key tĩnh) vẫn shake được. Lỗi nằm ở chỗ truy cập **động**. Cần tra theo tên (ví dụ icon lấy từ CMS)? Hãy tự viết một map chỉ chứa những icon cho phép: `const ICONS = { cart: IconCart, heart: IconHeart }`.

## Case 02 — Barrel file + side effect

```ts
// ❌ bad: chỉ cần formatPrice
import { formatPrice } from "../../lib"; // lib/index.ts re-export cả chart.ts
```

Trong `chart.ts`:

```ts
const PALETTE_INDEX = buildPaletteIndex(PALETTES); // chạy ngay khi import
```

Bundler không biết `buildPaletteIndex()` có đụng tới global hay không → phải giữ, kéo theo 400 palette. Dù app không dùng chart.

**Fix phía app:** import thẳng `from "../../lib/format"`.

**Fix phía thư viện** (nếu bạn viết lib, đây mới là fix gốc):

1. Đánh dấu lời gọi là pure: `const PALETTE_INDEX = /*#__PURE__*/ buildPaletteIndex(PALETTES);`
2. Hoặc khởi tạo lười bên trong function được export, không chạy ở top-level.
3. Khai báo trong `package.json` của lib: `"sideEffects": false` (hoặc liệt kê file có side effect thật, ví dụ `["*.css", "./polyfill.js"]`). ⚠️ Nếu khai `false` mà module có side effect thật (polyfill, đăng ký global, import CSS) thì side effect đó sẽ **biến mất** ở production.

Barrel không xấu tự thân. Nó thành bẫy khi một file bên trong có side effect, và làm dev server chậm vì phải load mọi module được re-export.

## Case 03 — CommonJS

```ts
// ❌ bad
import { formatDate } from "../../lib/legacy-format.cjs";
```

`module.exports = { ... }` là phép gán **lúc runtime**, nên bundler phải giữ nguyên module và mọi thứ nó `require`, ở đây là bảng 74 locale.

```ts
// ✅ good: thư viện ESM + Intl có sẵn trong trình duyệt
import { formatDate } from "../../lib/format";
```

**Ngoài đời:** `lodash` → `lodash-es` hoặc native; `moment` → `date-fns` / `dayjs` / `Intl`. Trước khi cài thư viện, kiểm tra trên bundlephobia.com xem nó có ESM và có "tree-shakeable" không.

## Case 04 — Class với static method

```ts
// ❌ bad: chỉ dùng slugify nhưng kéo cả truncate, escapeHtml, levenshtein...
import { StringUtils } from "../../lib/string-utils";
StringUtils.slugify("...");
```

Bundler không bỏ từng method khỏi class (method có thể được gọi qua `this`, qua class con, hay `StringUtils[name]`). Object literal kiểu `export default { a, b, c }` cũng bị giống vậy.

```ts
// ✅ good
import { slugify } from "../../lib/string-utils";
```

Quy tắc: thư viện helper nên **export từng function**, đừng gom vào class hay `export default {...}`.

## Case 05 — Code được dùng thật nhưng chưa cần ngay

Tree shaking chỉ bỏ code **không bao giờ dùng**. Chart ở đây **có** dùng, nhưng chỉ khi user bấm "Xem báo cáo". Import tĩnh bắt mọi user tải và parse nó ngay từ đầu.

```ts
// ✅ good: code splitting bằng import() động
button.addEventListener("click", async () => {
  const { renderChart } = await import("../../lib/chart");
  renderChart(el, data);
});
```

Bundle ban đầu: 10.5 KB → 0.9 KB gzip. Tổng code **không giảm** (chart nằm ở chunk riêng); nó chỉ được dời tới lúc thật sự cần. React thì dùng `React.lazy(() => import("./Chart"))` + `<Suspense>`; route-level splitting cũng theo cùng ý tưởng.

## Checklist khi review PR FE

- [ ] Không `obj[dynamicKey]` trên `import * as X`
- [ ] Import thẳng file/subpath khi barrel có module nặng hoặc có side effect
- [ ] Không thêm dependency chỉ có bản CommonJS (check bundlephobia)
- [ ] Lib nội bộ: export function rời; có `"sideEffects"` trong `package.json`; side effect top-level được đánh `/*#__PURE__*/` hoặc dời vào function
- [ ] Màn hình / modal / chart / editor nặng mà ít dùng → `import()` / `React.lazy`
- [ ] Kiểm tra bundle thật sau khi build: `npx vite-bundle-visualizer` hoặc `rollup-plugin-visualizer`

## Bài tập

1. Sửa `lib/chart.ts` bằng `/*#__PURE__*/`, chạy lại `npm run measure`. Case 02 bad nhẹ đi bao nhiêu? Sau đó test nào fail, và vì sao fail đó là đúng?
2. Thêm `lib/package.json` với `{ "sideEffects": false }` (nhớ revert bài 1 trước). Case 02 thay đổi thế nào?
3. Đổi case 01 good thành `import * as Icons` + `Icons.IconCart` (key tĩnh). Bundle có phình lại không?
4. Mở DevTools → Network → throttle "Slow 4G", và tab Performance với CPU 4× slowdown trên một app thật của bạn. Đâu là chunk JS lớn nhất? Nó thuộc case nào ở trên?

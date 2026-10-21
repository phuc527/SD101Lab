// Chart chỉ cần khi user bấm "Xem báo cáo", nhưng import tĩnh
// -> chart + 400 palette nằm trong bundle chính, user nào cũng phải tải và parse.
// Tree shaking KHÔNG cứu được: code này có được dùng thật.
import { renderChart } from "../../lib/chart";

document.querySelector("#report")?.addEventListener("click", () => {
  renderChart(document.querySelector("#chart")!, [3, 7, 4, 9]);
});

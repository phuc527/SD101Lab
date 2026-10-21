// import() động -> bundler tách chart ra chunk riêng, chỉ tải khi bấm.
// Bundle ban đầu nhỏ lại; chi phí dời sang lúc thật sự cần.
document.querySelector("#report")?.addEventListener("click", async () => {
  const { renderChart } = await import("../../lib/chart");
  renderChart(document.querySelector("#chart")!, [3, 7, 4, 9]);
});

// Chỉ cần formatPrice, nhưng import qua barrel.
// chart.ts trong barrel có side effect top-level -> bị kéo vào bundle cùng 400 palette.
import { formatPrice } from "../../lib";

console.log(formatPrice(199_000));

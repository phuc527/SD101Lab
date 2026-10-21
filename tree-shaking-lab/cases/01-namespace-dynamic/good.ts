// Import tĩnh đúng thứ cần -> bundler giữ đúng 2 icon.
// (`import * as Icons` + `Icons.IconCart` vẫn OK; chỉ truy cập ĐỘNG mới phá tree shaking.)
import { IconCart, IconHeart } from "../../lib/icons";

console.log(IconCart, IconHeart);

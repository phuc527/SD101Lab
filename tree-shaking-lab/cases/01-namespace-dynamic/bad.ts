// App chỉ cần 2 icon, nhưng tra icon theo tên động.
// `Icons[name]` -> bundler không biết name là gì -> giữ cả 300 icon.
import * as Icons from "../../lib/icons";

const name = (n: string) => Icons[`Icon${n}` as keyof typeof Icons];
console.log(name("Cart"), name("Heart"));

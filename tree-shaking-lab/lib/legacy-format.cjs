// CommonJS kiểu thư viện cũ (moment, lodash bản CJS...).
// `module.exports` là một object được gán lúc runtime -> bundler không phân tích
// tĩnh được export nào dùng, export nào không -> phải giữ CẢ module + mọi require.
const LOCALES = require("./locales-data.cjs");

function formatDate(date, locale) {
  const l = LOCALES[locale] || LOCALES.en;
  return date.getDate() + " " + l.months[date.getMonth()] + " " + date.getFullYear();
}

function weekdayName(date, locale) {
  return (LOCALES[locale] || LOCALES.en).weekdays[date.getDay()];
}

module.exports = { formatDate, weekdayName, LOCALES };

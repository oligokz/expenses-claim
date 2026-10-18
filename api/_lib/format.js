/** 5000 -> "5,000.00". Every amount shown in the app, emails and PDFs. */
const money = (n) =>
  Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

module.exports = { money };

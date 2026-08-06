// Excel .iqy(Webクエリ)用エンドポイント。
// .iqyはHTMLの<table>しか読めないため、既存のexport_* RPC(JSON)をHTML表に変換して返す。
// これでExcelが「ダブルクリック→自動更新テーブル」を作れる(=SharePointの仕組みと同型)。
// 鍵(token)はURLに入り、export_* RPCがRLS的に本人ぶんだけ返す＝service_role不使用で安全。
const SUPABASE_URL = "https://tnfwipbgfgjaymlszeid.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek";

const FN = {
  meisai: "export_meisai",
  pay: "export_payments",
  summary: "export_summary",
  companies: "export_companies",
};

function esc(v) {
  if (v == null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function page(inner) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<table border="1">' +
    inner +
    "</table></body></html>"
  );
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const q = req.query || {};
    const token = q.token || "";
    const sheet = q.sheet || "meisai";
    const fn = FN[sheet] || FN.meisai;
    if (!token) return res.status(200).send(page("<tr><td>token がありません</td></tr>"));

    const url =
      SUPABASE_URL +
      "/rest/v1/rpc/" +
      fn +
      "?token=" +
      encodeURIComponent(token) +
      "&apikey=" +
      SUPABASE_ANON;
    const r = await fetch(url);
    const data = await r.json();
    const rows = Array.isArray(data) ? data : [];

    if (!rows.length) return res.status(200).send(page("<tr><td>データがありません</td></tr>"));

    const cols = Object.keys(rows[0]);
    let html =
      "<thead><tr>" + cols.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>";
    for (const row of rows) {
      html += "<tr>" + cols.map((c) => "<td>" + esc(row[c]) + "</td>").join("") + "</tr>";
    }
    html += "</tbody>";
    return res.status(200).send(page(html));
  } catch (e) {
    return res.status(200).send(page("<tr><td>エラー: " + esc(e && e.message) + "</td></tr>"));
  }
};

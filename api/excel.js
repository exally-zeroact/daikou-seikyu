// Excel .iqy(Webクエリ)用エンドポイント。
// .iqyはHTMLの<table>しか読めないため、既存のexport_* RPC(JSON)をHTML表に変換して返す。
// これでExcelが「ダブルクリック→自動更新テーブル」を作れる(=SharePointの仕組みと同型)。
// 鍵(token)はURLに入り、export_* RPCがRLS的に本人ぶんだけ返す＝service_role不使用で安全。
const SUPABASE_URL = "https://tnfwipbgfgjaymlszeid.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek";

// ★名前の取り違えで別の表を出さない（2026-11-02）★ .iqy は "pay"、Webクエリを埋め込んだ xlsx は
// "payments"（daikou-seikyu.html の sh.fn.replace("export_", "")）を投げる。前は "payments" が無く、
// 知らない名前は黙って明細に倒れた＝入金シートを更新すると明細の行で上書きされた。
// 両方の名前を持ち、知らない名前は明細に倒さずエラー行にする。
const FN = {
  meisai: "export_meisai",
  pay: "export_payments",
  payments: "export_payments",
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
    if (!Object.prototype.hasOwnProperty.call(FN, sheet)) {
      return res
        .status(200)
        .send(page("<tr><td>エラー: 知らない表の名前です（" + esc(sheet) + "）</td></tr>"));
    }
    const fn = FN[sheet];
    if (!token) return res.status(200).send(page("<tr><td>token がありません</td></tr>"));

    const url =
      SUPABASE_URL +
      "/rest/v1/rpc/" +
      fn +
      "?token=" +
      encodeURIComponent(token) +
      "&apikey=" +
      SUPABASE_ANON;
    // ★読み切れたかを数える（2026-11-02）★ 倉庫は1回に返す行に上限がある（max_rows）。
    // 上限を超えると黙って途中までになる＝Excel に欠けた表が出る。count=exact で全件数を貰い、
    // 行数が足りなければ途中の表は出さずにエラー行にする。エラーの時も「データがありません」に化けさせない。
    // 判じ方は状態の番号に頼らない（切れた時は 206＝r.ok は true）。0件は Content-Range が "*/0" で来る。
    const r = await fetch(url, { headers: { Prefer: "count=exact" } });
    if (!r.ok) {
      return res
        .status(200)
        .send(page("<tr><td>エラー: 倉庫を読めませんでした（" + esc(r.status) + "）</td></tr>"));
    }
    const data = await r.json();
    if (!Array.isArray(data)) {
      return res.status(200).send(page("<tr><td>エラー: 倉庫の答えの形が違います</td></tr>"));
    }
    const m = /\/(\d+)\s*$/.exec(String(r.headers.get("content-range") || ""));
    if (!m) {
      return res.status(200).send(page("<tr><td>エラー: 全部の件数が分かりません</td></tr>"));
    }
    const total = Number(m[1]);
    const rows = data;
    if (rows.length < total) {
      return res
        .status(200)
        .send(
          page(
            "<tr><td>エラー: 全部を読めませんでした（全" +
              total +
              "行のうち" +
              rows.length +
              "行）</td></tr>"
          )
        );
    }

    if (!rows.length) {
      // ★止めた 鍵を「データがありません」で 黙らせない★ 2026-11-03（外から読む口で 鍵を 作り直す・止める が できた）
      //   古い export_* は 無い 鍵にも 200 [] を 返す＝0件の 時だけ 鍵が 在るかを 訊く。答えの 列は 変えない。
      //   訊けなかった 時は 今まで 通り（止まったと 言い切れない 物を 止まったと 言わない）。鍵は body で 渡す。
      let aru = null;
      try {
        const k = await fetch(SUPABASE_URL + "/rest/v1/rpc/kagi_aru", {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON,
            Authorization: "Bearer " + SUPABASE_ANON,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: token }),
        });
        if (k.ok) aru = await k.json();
      } catch (_) {
        aru = null;
      }
      if (aru === false)
        return res
          .status(200)
          .send(
            page(
              "<tr><td>エラー: この鍵は止まっています（アプリの設定で鍵を作り直し、新しい鍵で取り直してください）</td></tr>"
            )
          );
      return res.status(200).send(page("<tr><td>データがありません</td></tr>"));
    }

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

import { test, expect } from "@playwright/test";
import { STOPS, boot } from "./stops.js";

// ============================================================
// ★列の揃え★（指示役 2026-08-18 A1）
//   見出し＝中央 ／ 数字・日付＝右 ／ 言葉＝左 ／ 1文字＝中央 ／ ラベル＝左・値＝右
//   ★これは「列（横に並ぶ物）」の決まり★。カード（縦に積む物）は中央のままでよい。
//
//   ★直す前に 描き終わった画面から数えた姿（2026-08-18・幅390）★
//     集計の見出し  「会社」＝左 ／「請求」「入金」「残」＝右   → ★見出しなのに中央が1つも無い★
//     一覧の金額 ¥1,200 ＝ ★左★（数字が左＝桁が揃わない）
//     一覧の日付 8/14   ＝ ★左★
//     ＝ 揃えを決めている所が ★CSSの中に散らばって12か所★あった
//     ⇒ 今は daikou-seikyu.html の「★列の揃えは ここだけで決める★」1か所だけ
//
//   ★測り方★ ソースを grep しない。★描き終わった画面から getComputedStyle で列ごとに数える★
//   ★幅 375 / 390 / 412 の3つで実測する★
// ============================================================

test.setTimeout(240000);

// 「列の中」＝ここに挙げた物。増えたらここへ足す（＝見ていない所を作らない）
const COL_SEL = [
  "table td",
  "table th",
  ".li-date",
  ".li-dest",
  ".li-meta",
  ".li-amt",
  ".pay-co",
  ".pay-sub",
  ".pay-amt",
  ".pay-rem",
  ".dnd-name",
  ".dnd-w",
].join(",");

// ★2026-08-21 A2で 一覧の日付が「日ごとの見出し」へ移った★
//   見出しは列ではない（横に並ぶ物ではない）ので 列の決まりは当てない。
//   ただし ★日付を1つも見ないまま緑にしない★ ため、ここも数える。
const DAY_HEAD = "#listBody .li-day .d";

function grabAlign(arg) {
  const { where, sel } = arg;
  const out = [];
  // 「¥1,200」だけでなく「残 ¥3,700」のように ★短くて 数字で終わる字★ も数字の列とみなす
  //   （長い文（例「2026年8月・3件・入金 ¥3,200」）は言葉のまま）
  const isNum = (t) =>
    /^[¥￥]?-?[\d,]+(\.\d+)?(円|件|社|台|人|km|mm|%)?$/.test(t) ||
    (t.length <= 14 && /\d/.test(t) && /[¥￥]?[\d,]+(円)?$/.test(t));
  // 「8/14」も「8/14（木）」も日付として数える（2026-08-21 一覧の日ごとの見出し）
  const isDate = (t) => /^\d{1,4}[/年-]\d{1,2}([/月-]\d{1,2}日?)?(（.）)?$/.test(t);
  const scr = document.querySelector(".scr.on");
  const modal = [...document.querySelectorAll(".modal, .modal-back, .sheet-modal")].find((m) => {
    const r = m.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(m).display !== "none";
  });
  const roots = [scr || document.body];
  if (modal) roots.push(modal);

  const rec = (el, kind) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return null;
    const t = (el.tagName === "INPUT" ? el.value : el.textContent || "").trim();
    if (!t) return null;
    return {
      where,
      kind,
      t: t.slice(0, 20),
      al: s.textAlign,
      w: Math.round(r.width),
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 30),
      num: isNum(t),
      date: isDate(t),
      one: [...t].length === 1,
      th: el.tagName === "TH",
    };
  };

  for (const root of roots) {
    // ① 列の中（表のセル・一覧の行・入金の行・列の並べ替え）
    root.querySelectorAll(sel).forEach((el) => {
      const g = rec(el, "列");
      if (g) out.push(g);
    });
    // ② 列の外でも「狭い箱に数字か日付だけ」＝列と同じ扱い（新しく足した列を見逃さない）
    root.querySelectorAll("*").forEach((el) => {
      if (el.matches(sel) || el.closest(sel)) return;
      if (
        el.closest(
          "button, a, summary, label, select, .pay-summary, .load-card, .tpl-card, .nav-item, .seg, .edit-chips, .list-sum, .li-day"
        )
      )
        return;
      const kids = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!kids.length || el.children.length) return;
      const g = rec(el, "狭い箱");
      if (!g || g.w > 220) return;
      if (!g.num && !g.date) return;
      out.push(g);
    });
  }
  // 日ごとの見出しの日付（列ではない＝揃えは見ないが、見た数には入れる）
  for (const root of roots)
    root.querySelectorAll("#listBody .li-day .d").forEach((el) => {
      const g = rec(el, "日の見出し");
      if (g) out.push(Object.assign(g, { headOnly: true }));
    });
  return out;
}

for (const W of [375, 390, 412])
  test(`★列の揃え・幅${W}★`, async ({ page }) => {
    await boot(page, W);

    const found = [];
    const perStop = [];
    // ★ログイン前の画面には「列」が無い★（色は screen-ink が見る）。
    //   ここで開くと 入り直しが要って 後ろの画面まで巻き込むので、この見張りでは開かない。
    for (const s of STOPS.filter((x) => x.name !== "ログイン前")) {
      await s.open(page);
      const got = await page.evaluate(grabAlign, { where: s.name, sel: COL_SEL });
      perStop.push(`${s.name}:${got.length}`);
      found.push(...got);
      if (s.close) await s.close(page);
    }

    // ★何も見ていない緑を作らない★
    expect(
      found.length,
      "★列の字を1つも見ていない（0本の緑は未検査）★ 開いた所ごとの数: " + perStop.join(" ")
    ).toBeGreaterThan(40);
    expect(found.filter((f) => f.th).length, "★表の見出し(th)を1つも見ていない★").toBeGreaterThan(
      2
    );
    expect(found.filter((f) => f.num).length, "★数字の列を1つも見ていない★").toBeGreaterThan(8);
    expect(found.filter((f) => f.date).length, "★日付の列を1つも見ていない★").toBeGreaterThan(2);

    const want = (f) => {
      if (f.th) return "center"; // 見出し＝中央
      if (f.num || f.date) return "right"; // 数字・日付＝右
      if (f.one) return "center"; // 1文字＝中央
      return "left"; // 言葉＝左
    };
    const same = (a, b) =>
      a === b || (b === "left" && a === "start") || (b === "right" && a === "end");

    const ng = found.filter((f) => !f.headOnly && !same(f.al, want(f)));
    expect(
      ng,
      "★列の揃えが決まりと違う（見出し=中央/数字・日付=右/言葉=左/1文字=中央）:\n  " +
        ng
          .map((f) => `${f.where} ${f.tag}.${f.cls} 「${f.t}」 今=${f.al} ほしい=${want(f)}`)
          .join("\n  ")
    ).toEqual([]);

    const n = {};
    for (const f of found) n[f.al] = (n[f.al] || 0) + 1;
    console.log(
      `[screen-align] w=${W} 列の字${found.length}個（見出し${found.filter((f) => f.th).length}・数字${found.filter((f) => f.num).length}・日付${found.filter((f) => f.date).length}） / ` +
        Object.entries(n)
          .map(([k, v]) => `${k}:${v}`)
          .join(" ")
    );
  });

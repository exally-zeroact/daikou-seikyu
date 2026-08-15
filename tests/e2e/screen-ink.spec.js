import { test, expect } from "@playwright/test";

// ============================================================
// ★画面の文字は「薄い黒」★（司さん 2026-08-15「全てやけど文字は薄い黒にせな見にくい」）
//
//   ★直す前に実機の画面から数えた姿★
//     body の文字色が ★#0A5FD0（青）★ ＝ 画面じゅうの文字が青を受け継いでいた
//     金額 ¥1,200 … ★#0B57D0（リンクと同じ青）★
//     行き先 今治市喜田村 … ★#0A5FD0★（一番 目立つ）
//     会社名 株式会社 生野組 … ★#5A6B82（一番 薄い）★
//     ＝ ★押せる物と 読むだけの物が 同じ青★／★探す物が 一番 薄い★
//
//   ★決まり★
//     本文・値・金額 … ★#333333（薄い黒）★  ラベル・副 … #555555 / #666666
//     ★色を付けてよいのは「押せる物」と「選ばれている物」だけ★
//
//   ★ここで測るのは「描き終わった画面の色」★（ソースの文字列を grep しない）
//   ★幅 375 / 390 / 412 の3つで実測する★
// ============================================================

test.setTimeout(240000);

// 押せる/選ばれている物にだけ許す青（事務所の青）
const BLUE = ["#0A5FD0", "#0B57D0", "#007AFF"];
// 読ませる字の濃さ（これより薄い＝読みにくい）。空の時の案内だけ例外。
const INK = "#333333";

function seed() {
  const uid = "u_ink";
  const co1 = "株式会社 生野組";
  const co2 = "飛勝工業株式会社";
  const dests = ["今治市喜田村", "今治市東鳥生町", "西条市郷桜井", "今治市小泉", "今治市東門町"];
  const rows = dests.map((d, i) => ({
    id: "m" + i,
    user_id: uid,
    company: i % 2 ? co2 : co1,
    date: "2026-08-" + String(14 - (i % 3)).padStart(2, "0"),
    destination: d,
    amount: [1200, 12000, 900, 1234567, 4800][i],
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
  }));
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows,
        companies: [co1, co2].map((n, i) => ({
          id: "c" + i,
          user_id: uid,
          name: n,
          items: ["日付", "行き先", "金額"],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
        issuer: [
          {
            user_id: uid,
            config: {
              issuer: "合同会社ZEROact\nZERO代行\n登録番号：T3500003003293",
              bank: "伊予銀行　今治支店　普通　4160657",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        payments: [],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

const SCREENS = ["input", "list", "billing", "settings"];

for (const W of [375, 390, 412])
  test(`★画面の文字が薄い黒・幅${W}★`, async ({ page }) => {
    await page.setViewportSize({ width: W, height: 850 });
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });

    const found = [];
    for (const scr of SCREENS) {
      const nav = page.locator(`.nav-item[data-scr="${scr}"]`);
      if (await nav.count()) {
        await nav.click();
        await page.waitForTimeout(500);
      }
      found.push(
        ...(await page.evaluate((scrName) => {
          const out = [];
          const hex = (c) => {
            const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            return m
              ? "#" +
                  [1, 2, 3]
                    .map((i) => Number(m[i]).toString(16).padStart(2, "0"))
                    .join("")
                    .toUpperCase()
              : c;
          };
          const walk = (el) => {
            for (const n of el.childNodes) {
              if (n.nodeType === 3) {
                const t = n.textContent.trim();
                if (!t) continue;
                const p = n.parentElement;
                const r = p.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                const s = getComputedStyle(p);
                if (s.visibility === "hidden" || s.display === "none") continue;
                // ★押せる/選ばれている＝その要素自身★（親が押せるだけでは色を付けてよい理由にならない。
                //   一覧の行はまるごと押せるので、親で判定すると 中の金額まで青にできてしまう）
                const cls = (p.className || "").toString();
                const self =
                  ["BUTTON", "A", "SELECT", "SUMMARY", "OPTION"].includes(p.tagName) ||
                  /(^|[\s-])btn|chip|seg|tab|link|caret|add-line|clear|nav-ic|nav-lb|toggle|sw-/.test(
                    cls
                  );
                const activeNav = !!p.closest(".nav-item.active, .on, [aria-selected='true']");
                out.push({
                  scr: scrName,
                  t: t.slice(0, 24),
                  col: hex(s.color),
                  cls: cls.slice(0, 26),
                  tag: p.tagName.toLowerCase(),
                  ok: self && (!/nav-ic|nav-lb/.test(cls) || activeNav),
                });
              } else if (n.nodeType === 1) walk(n);
            }
          };
          walk(document.querySelector(".scr.on") || document.body);
          return out;
        }, scr))
      );
    }

    expect(found.length, "★文字を1つも見ていない（0本の緑は未検査）★").toBeGreaterThan(80);

    // ① 押せない物に青が付いていたら赤
    const blueOnRead = found.filter((f) => BLUE.includes(f.col) && !f.ok);
    expect(
      blueOnRead,
      "★読むだけの字に 押せる色（青）が付いている:\n  " +
        blueOnRead.map((f) => `${f.scr} ${f.tag}.${f.cls} 「${f.t}」 ${f.col}`).join("\n  ")
    ).toEqual([]);

    // ② 金額に青が付いていたら赤（司さんが最初に言った所）
    const money = found.filter((f) => /^[¥￥][\d,]+$/.test(f.t));
    expect(money.length, "★金額を1つも見ていない★").toBeGreaterThan(2);
    const blueMoney = money.filter((f) => BLUE.includes(f.col));
    expect(
      blueMoney,
      "★金額がリンクと同じ青:\n  " + blueMoney.map((f) => `${f.t} ${f.col}`).join("\n  ")
    ).toEqual([]);

    // ③ 土台（body）が薄い黒か＝ここが青だと 画面じゅうが青を受け継ぐ
    const bodyCol = await page.evaluate(() => {
      const c = getComputedStyle(document.body).color.match(/\d+/g);
      return (
        "#" +
        c
          .slice(0, 3)
          .map((x) => Number(x).toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase()
      );
    });
    expect(bodyCol, "★body の文字色が薄い黒ではない★").toBe(INK);

    const n = {};
    for (const f of found) n[f.col] = (n[f.col] || 0) + 1;
    console.log(
      `[screen-ink] w=${W} 文字${found.length}個 / ` +
        Object.entries(n)
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => `${c}:${v}`)
          .join(" ")
    );
  });

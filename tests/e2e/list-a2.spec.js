import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★一覧の6つ★（司さん 2026-08-15 実機 → 指示役 2026-08-18/21）
//   ①金額が青 → 薄い黒（08-18 済）
//   ②主役が逆（行き先が濃く・会社名が薄い）→ ★会社名を主役・行き先を副★
//   ③一番上の説明文が途中から見えている → ★開いた時に頭が出る★
//   ④件数と合計が無い → ★頭に「◯件／合計 ¥◯」・絞り込みで数え直る★
//   ⑤同じ日付を何度も読ませる → ★日ごとにまとめ、日ごとの合計★
//   ⑥1画面に10件しか入らない（1件58px）→ ★1件を1行に近づける（潰さない）★
//
//   ★直す前に実測した姿（幅390・2026-08-21）★
//     1件58px／画面に12件／行き先=13px #333333（主役）／会社名=10px #555555（副）
//     件数と合計＝無し／日ごとの区切り＝0／説明文に「（idで特定）」＝中の言葉
//
//   ★検算は 画面に描かれた文字を1行ずつ足す★（中の値どうしで閉じない）
// ============================================================

test.setTimeout(240000);

const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");

async function open(page, W) {
  await page.setViewportSize({ width: W, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await nav(page, "list");
}

for (const W of [375, 390, 412])
  test(`★一覧＝会社名が主役・日ごと・件数と合計・1行に近い（幅${W}）★`, async ({ page }) => {
    await open(page, W);

    const m = await page.evaluate(() => {
      const hex = (c) => {
        const x = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return x
          ? "#" +
              [1, 2, 3]
                .map((i) => Number(x[i]).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase()
          : c;
      };
      const items = [...document.querySelectorAll("#listBody .list-item")];
      const g = (el) => {
        const s = getComputedStyle(el);
        return { t: el.textContent.trim(), col: hex(s.color), fs: parseFloat(s.fontSize) };
      };
      return {
        件数: items.length,
        ピッチ:
          items.length > 1
            ? Math.round(
                items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top
              )
            : 0,
        会社名: g(items[0].querySelector(".li-meta")),
        行き先: g(items[0].querySelector(".li-dest")),
        金額: g(items[0].querySelector(".li-amt")),
        合計欄: document.getElementById("listSum").textContent.trim(),
        日の見出し: [...document.querySelectorAll("#listBody .li-day")].map((d) =>
          d.textContent.trim()
        ),
        行の金額: items.map((it) => it.querySelector(".li-amt").textContent.trim()),
        日ごとの行: [...document.querySelectorAll("#listBody > *")].map((el) =>
          el.classList.contains("li-day") ? "日" : "行"
        ),
        画面の字: document.body.innerText,
        scrollY: window.scrollY,
        説明文が見えているか: (() => {
          const s = document.querySelector("#scr-list .scr-sub");
          const r = s.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        })(),
      };
    });

    // ②主役が逆になっていないか（会社名の方が大きく・濃い）
    expect(
      m.会社名.fs,
      `★会社名が主役になっていない（会社名${m.会社名.fs}px / 行き先${m.行き先.fs}px）★`
    ).toBeGreaterThan(m.行き先.fs);
    expect(m.会社名.col, "★会社名が薄い（探す物が一番 薄い）★").toBe("#333333");
    expect(m.行き先.col, "★行き先が本文より濃い／青い★").toBe("#555555");

    // ④件数と合計（★描かれた文字を足して検算★）
    const sumFromRows = m.行の金額.reduce((t, s) => t + Number(s.replace(/[^\d]/g, "")), 0);
    expect(m.合計欄, "★件数が出ていない★").toContain(`${m.件数}件`);
    expect(m.合計欄, `★合計が画面の行の足し算と違う（行の合計=${yen(sumFromRows)}）★`).toContain(
      yen(sumFromRows)
    );

    // ⑤日ごとにまとまっているか＋日ごとの合計が その日の行の足し算と合うか
    expect(
      m.日の見出し.length,
      "★日ごとの区切りが無い（同じ日付を何度も読ませている）★"
    ).toBeGreaterThan(1);
    const perDay = await page.evaluate(() => {
      const out = [];
      let cur = null;
      for (const el of document.querySelectorAll("#listBody > *")) {
        if (el.classList.contains("li-day")) {
          cur = { head: el.textContent.trim(), amounts: [] };
          out.push(cur);
        } else if (cur) {
          const a = el.querySelector(".li-amt");
          if (a) cur.amounts.push(a.textContent.trim());
        }
      }
      return out;
    });
    for (const d of perDay) {
      const s = d.amounts.reduce((t, x) => t + Number(x.replace(/[^\d]/g, "")), 0);
      expect(d.head, `★その日の合計が 行の足し算と違う: ${d.head}★`).toContain(yen(s));
      expect(d.head, `★その日の件数が違う: ${d.head}★`).toContain(`${d.amounts.length}件`);
    }

    // ⑥1件を1行に近づける（潰さない＝字は12px以上）
    expect(m.ピッチ, `★1件が高すぎる（${m.ピッチ}px）★`).toBeLessThanOrEqual(52);
    expect(m.行き先.fs, "★字を小さくして潰している★").toBeGreaterThanOrEqual(12);

    // ③開いた時に頭が出ている
    expect(m.scrollY, "★開いた時に途中まで送られている★").toBe(0);
    expect(m.説明文が見えているか, "★一番上の説明文が画面から切れている★").toBe(true);

    // ★中の言葉を客に見せない★
    expect(m.画面の字.includes("idで特定"), "★中の言葉（id）が出ている★").toBe(false);
    expect(/(^|[^A-Za-z])id: /.test(m.画面の字), "★中の言葉（id:）が出ている★").toBe(false);

    console.log(
      `[list-a2] w=${W} 1件${m.ピッチ}px / ${m.件数}件 / 日の見出し${m.日の見出し.length}本 / ${m.合計欄}`
    );
  });

test("★絞り込むと 件数と合計が数え直る★", async ({ page }) => {
  await open(page, 390);
  const before = await page.locator("#listSum").textContent();
  await page.selectOption("#listCompany", { index: 1 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    sum: document.getElementById("listSum").textContent.trim(),
    rows: [...document.querySelectorAll("#listBody .li-amt")].map((a) => a.textContent.trim()),
    co: [...document.querySelectorAll("#listBody .li-meta")].map((a) => a.textContent.trim()),
  }));
  const s = after.rows.reduce((t, x) => t + Number(x.replace(/[^\d]/g, "")), 0);
  expect(after.sum, "★絞り込んだのに数が変わっていない★").not.toBe(before.trim());
  expect(after.sum).toContain(`${after.rows.length}件`);
  expect(after.sum, "★絞り込み後の合計が 画面の行と合わない★").toContain(yen(s));
  expect(after.sum, "★絞り込み中だと分からない★").toContain("絞り込み中");
  console.log(`[list-a2] 絞り込み: ${before.trim()} → ${after.sum}`);
});

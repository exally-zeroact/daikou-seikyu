import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★入力の7つ＋入金バッジ★（司さん 2026-08-15 実機 → 指示役 2026-08-18/21）
//   ①値が青（会社名・日付）→ ★薄い黒★
//   ②金額の欄に薄い「0」→ ★プレースホルダに0を置かない★（空欄が0に見える）
//   ③行き先が空欄のまま → ★よく行く所を先に出す（押すと入る）★
//   ④「保存する（Excel／DBに追加）」→ ★「DB」は身内の言葉★／ボタンの色を1つに
//   ⑤上の説明が3行 → ★記入ガイドは1行（詳しくは畳む）★
//   ⑥日付だけ中央寄せ → ★数字・日付は右★（A1の決まり）
//   ⑦入金バッジが 29 と 31 で画面によって違う → ★数え直す時を1つに★
//
//   ★直す前に実測した姿（幅390・2026-08-21）★
//     入力欄の値 #0A5FD0（青）／金額の placeholder="0"／案内3行／日付=中央
// ============================================================

test.setTimeout(240000);

const hexFn = () => {
  window.__hex = (c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m
      ? "#" +
          [1, 2, 3]
            .map((i) => Number(m[i]).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
      : c;
  };
};

async function open(page, W) {
  await page.setViewportSize({ width: W, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.evaluate(hexFn);
  const co = page.locator("#scr-input select").first();
  await co.selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(600);
}

for (const W of [375, 390, 412])
  test(`★入力＝値は薄い黒・0を置かない・よく行く所・案内1行・日付は右（幅${W}）★`, async ({
    page,
  }) => {
    await open(page, W);
    const m = await page.evaluate(() => {
      const H = window.__hex;
      const inputs = [...document.querySelectorAll("#scr-input input, #scr-input select")]
        .filter((el) => el.getBoundingClientRect().width > 0 && el.type !== "date")
        .map((el) => ({
          cls: (el.className || "").toString(),
          col: H(getComputedStyle(el).color),
          ph: el.placeholder || "",
        }));
      const sub = document.querySelector("#scr-input .scr-sub");
      const ds = document.querySelector(".date-show");
      return {
        欄: inputs,
        案内の高さ: Math.round(sub.getBoundingClientRect().height),
        案内の行の高さ: Math.round(parseFloat(getComputedStyle(sub).lineHeight)),
        日付の表示: ds
          ? {
              al: getComputedStyle(ds).textAlign,
              col: H(getComputedStyle(ds).color),
              空: ds.classList.contains("empty"), // 空の時の案内（薄い灰）は例外
            }
          : null,
        よく行く所: [...document.querySelectorAll(".dest-chip")].map((b) => b.textContent.trim()),
        画面の字: document.body.innerText,
        ボタンの色: [...document.querySelectorAll("#scr-input button")]
          .filter((b) => b.getBoundingClientRect().width > 0)
          .map((b) => ({
            t: b.textContent.trim().slice(0, 12),
            bg: H(getComputedStyle(b).backgroundColor),
            col: H(getComputedStyle(b).color),
          })),
      };
    });

    // ①値は薄い黒（青で書かない）
    const blue = m.欄.filter((x) => ["#0A5FD0", "#0B57D0", "#007AFF"].includes(x.col));
    expect(blue, "★入力欄の値が青い: " + JSON.stringify(blue)).toEqual([]);
    for (const x of m.欄)
      expect(x.col, `★入力欄の値が薄い黒ではない: ${x.cls} ${x.col}★`).toBe("#333333");

    // ②金額の欄に「0」を置かない
    const zero = m.欄.filter((x) => x.ph === "0");
    expect(zero, "★空欄が0に見える（placeholderに0）: " + JSON.stringify(zero)).toEqual([]);

    // ③よく行く所（押すと入る）が出ている
    expect(
      m.よく行く所.length,
      "★よく行く所が1つも出ていない（空欄のまま埋めさせている）★"
    ).toBeGreaterThan(0);

    // ④「DB」を人に見せない
    expect(m.画面の字.includes("DB"), "★身内の言葉「DB」が出ている★").toBe(false);

    // ⑤案内は1行ぶんの高さ（3行 読ませない）
    expect(
      m.案内の高さ,
      `★記入ガイドが長い（${m.案内の高さ}px＝${Math.round(m.案内の高さ / m.案内の行の高さ)}行）★`
    ).toBeLessThanOrEqual(m.案内の行の高さ * 2);

    // ⑥日付は右（A1の決まり）
    expect(m.日付の表示.al, "★日付だけ中央寄せのまま★").toBe("right");
    // 空の時の案内（「日付を選ぶ」）は薄い灰でよい。値が入っている時は薄い黒。
    if (m.日付の表示.空) {
      expect(
        ["#0A5FD0", "#0B57D0", "#007AFF"].includes(m.日付の表示.col),
        "★日付の案内が青い★"
      ).toBe(false);
    } else {
      expect(m.日付の表示.col, "★日付の値が薄い黒ではない★").toBe("#333333");
    }

    console.log(
      `[input-a3] w=${W} 欄${m.欄.length}本 全部#333333 / よく行く所${m.よく行く所.length}個 / 案内${m.案内の高さ}px / 日付=${m.日付の表示.al}`
    );
  });

test("★よく行く所を押すと そのまま入る★", async ({ page }) => {
  await open(page, 390);
  const chip = page.locator(".dest-chip").first();
  const want = (await chip.textContent()).trim();
  await chip.click();
  await page.waitForTimeout(300);
  const got = await page.evaluate(
    () => document.querySelector("#entryBody .sugg-wrap .entry-inp").value
  );
  expect(got, "★押しても行き先に入っていない★").toBe(want);
  console.log(`[input-a3] 「${want}」を押す → 欄に「${got}」`);
});

test("★入金バッジと入金画面の数が食い違わない（29と31）★", async ({ page }) => {
  await open(page, 390);
  const badge1 = (await page.locator("#payBadge").textContent()).trim();
  await nav(page, "payment");
  const rows = await page.evaluate(
    () =>
      [...document.querySelectorAll("#payBody .pay-pill")].filter(
        (p) => !p.classList.contains("paid")
      ).length
  );
  const badge2 = (await page.locator("#payBadge").textContent()).trim();
  expect(badge2, `★入金画面の未入金＋一部入金は${rows}件なのに バッジは${badge2}★`).toBe(
    String(rows)
  );
  expect(
    badge1,
    `★画面を替える前のバッジ(${badge1})と後(${badge2})で違う＝数え直す時が揃っていない★`
  ).toBe(badge2);

  // ★入金画面を開かずに 明細が増えても、バッジが数え直る★
  //   （前は「数え直す時」が画面ごとに違って 29 と 31 が同時に出ていた）
  await page.evaluate(() => {
    window.DB.push({
      id: "zz1",
      account_id: window.CURRENT_ACCOUNT,
      会社名: "新しい会社株式会社",
      日付: "2026-09-01",
      行き先: "波方",
      金額: 4000,
      備考: "",
      距離: "",
      人数: "",
      名前: "",
      _created: "2026-09-01T00:00:00.000Z",
    });
  });
  await nav(page, "list"); // ★入金画面には行かない★
  const badge3 = (await page.locator("#payBadge").textContent()).trim();
  expect(
    Number(badge3),
    `★明細が1件 増えたのに バッジが数え直っていない（前${badge2} → 今${badge3}）★`
  ).toBe(Number(badge2) + 1);
  console.log(
    `[input-a3] バッジ=${badge2} / 入金画面の行=${rows}（一致）／明細を増やすと ${badge3} に数え直る`
  );
});

test("★絞り込んでも「どちらの数か」が画面に出る（29と31の元）★", async ({ page }) => {
  await open(page, 390);
  await nav(page, "payment");
  const all = await page.evaluate(() => document.getElementById("payCount").textContent.trim());
  const badge = (await page.locator("#payBadge").textContent()).trim();
  expect(all, "★入金画面に件数が出ていない★").toContain("件");
  expect(all, `★バッジ(${badge})の数が画面に出ていない★`).toContain(`${badge}件`);

  // 状態で絞り込む＝画面の一覧は減るが、バッジは全期間のまま。
  // ★どちらの数かが 画面に書いてあること★（前は 29 と 31 が説明なしに並んでいた）
  await page.selectOption("#payStatus", "unpaid");
  await page.waitForTimeout(500);
  const filtered = await page.evaluate(() => ({
    line: document.getElementById("payCount").textContent.trim(),
    rows: document.querySelectorAll("#payBody .pay-pill").length,
    badge: document.getElementById("payBadge").textContent.trim(),
  }));
  expect(filtered.line, "★絞り込み中だと分からない★").toContain("絞り込み中");
  expect(filtered.line, "★今 見えている件数が出ていない★").toContain(`${filtered.rows}件`);
  if (Number(filtered.badge) !== filtered.rows)
    expect(
      filtered.line,
      `★バッジ(${filtered.badge})と画面(${filtered.rows})が違うのに 全期間の数が書いていない★`
    ).toContain(`全期間 ${filtered.badge}件`);
  console.log(
    `[input-a3] 絞り込み前「${all}」→ 絞り込み後「${filtered.line}」（バッジ=${filtered.badge}）`
  );
});

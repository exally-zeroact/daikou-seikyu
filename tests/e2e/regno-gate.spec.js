import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★登録番号が無い／形が違う紙を出させない★ 2026-08-11
//
//   ★実測した事（直す前）★
//     登録番号の行を消して「PDFで保存」を押すと
//       ボタンは押せる／警告なし／「PDFを作成しました」／3MBのPDFが出る
//       出たPDFに「登録番号」0行・T+13桁 0行
//     ＝★適格請求書の要件を満たさない紙が 何も言われずに出る★（年1,300通）
//
//   ★ここで守ること★
//     ・空／形が違う（T無し・12桁・14桁・全角）なら ★押させない＋理由を出す★
//       （押せて何も起きない、にしない）
//     ・理由に ★どこで入れるか★（設定▸自社情報）を書く
//     ・正しい時は今までどおり出て、★出たPDFの中に T+13桁が在る★
//     ・★今 入っている自社情報が1文字も消えない★（専用の欄に移しても紙は同じ）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「請求」 2. 月 3. 会社 4.「📄 PDFで保存 / 送る」5.「📊 Excelに書き出し」
// ============================================================

const OUT = process.env.REGNO_OUT || path.join("test-results", "regno");
const CO = "飛勝工業株式会社";
// ★本番に今 入っている物と同じ形（6行）★
const HONBAN_ISSUER =
  "合同会社ZEROact\nZERO代行\n〒794-0018\n今治市本町7-3-40　00コーポ1号\nTEL090-5716-1946\n登録番号：T3500003003293";

function seed(issuerText) {
  const uid = "u_regno";
  const co = "飛勝工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "g@x.com": { id: uid, email: "g@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "g@x.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: co,
            date: "2026-05-06",
            destination: "本社〜北浜",
            amount: 12000,
            note: "",
            distance: null,
            people: 1,
            name: "",
            extra: null,
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: co,
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: { issuer: issuerText, bank: "伊予銀行　今治支店　普通　4160657" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    })
  );
}

async function open(page, issuerText) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, issuerText);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
}

test("★形の判定★ 空・T無し・桁違い・全角 を弾き、正しい物だけ通す", async ({ page }) => {
  await open(page, HONBAN_ISSUER);
  const r = await page.evaluate(() => {
    const f = window.regnoNg;
    const T = (v) => (f({ regno: v }) ? "弾く" : "通す");
    return {
      "正しい T+13桁": T("T3500003003293"),
      空: T(""),
      未設定: window.regnoNg({}) ? "弾く" : "通す",
      "T が無い": T("3500003003293"),
      "12桁": T("T350000300329"),
      "14桁": T("T35000030032931"),
      全角のT: T("Ｔ3500003003293"),
      全角の数字: T("T３５００００３００３２９３"),
      前後に空白: T("  T3500003003293  "),
      小文字t: T("t3500003003293"),
    };
  });
  expect(r).toEqual({
    "正しい T+13桁": "通す",
    空: "弾く",
    未設定: "弾く",
    "T が無い": "弾く",
    "12桁": "弾く",
    "14桁": "弾く",
    全角のT: "弾く",
    全角の数字: "弾く",
    前後に空白: "通す", // 前後の空白は落として見る
    小文字t: "弾く",
  });
});

test("★登録番号が無いと 紙を出させない（押させない＋理由）★", async ({ page }) => {
  const naiIssuer = HONBAN_ISSUER.split("\n").slice(0, 5).join("\n"); // 登録番号の行だけ消す
  await open(page, naiIssuer);

  const pdf = page.getByRole("button", { name: /PDFで保存/ });
  const print = page.getByRole("button", { name: /印刷/ });
  const excel = page.getByRole("button", { name: /Excelに書き出し/ });
  await expect(pdf, "★PDFのボタンが押せてしまう★").toBeDisabled();
  await expect(print, "★印刷のボタンが押せてしまう★").toBeDisabled();
  await expect(excel, "★Excelのボタンが押せてしまう★").toBeDisabled();

  // ★理由が読める形で出ている（どこで入れるかまで）★
  const why = page.locator("#regnoWarn");
  await expect(why).toBeVisible();
  await expect(why).toContainText("登録番号");
  await expect(why).toContainText("自社情報");

  // 潰れていないか（幅を持って読める）
  const box = await why.boundingBox();
  expect(box.width, "理由が潰れている").toBeGreaterThan(120);
  expect(box.height, "理由が読めない高さ").toBeGreaterThan(10);

  // ★目で見ても「押せない」と分かるか★（押せないのに押せそうな色のままにしない）
  const look = await page.evaluate(() => {
    const b = document.getElementById("btnInvPdf");
    const cs = getComputedStyle(b);
    return { opacity: Number(cs.opacity), filter: cs.filter, cursor: cs.cursor };
  });
  expect(look.opacity, "★押せないのに 濃いまま★ " + JSON.stringify(look)).toBeLessThan(0.7);
  expect(look.cursor, "★指の形が「押せる」のまま★").toBe("not-allowed");
});

test("★正しければ今までどおり出て、出た紙の中に T+13桁が在る★", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await open(page, HONBAN_ISSUER);

  const pdf = page.getByRole("button", { name: /PDFで保存/ });
  await expect(pdf).toBeEnabled();
  await expect(page.locator("#regnoWarn")).toBeHidden();

  const dl = page.waitForEvent("download", { timeout: 120000 });
  await pdf.click();
  const f = path.join(OUT, "ok.pdf");
  await (await dl).saveAs(f);
  expect(fs.statSync(f).size).toBeGreaterThan(50000);

  // ★出たPDFの中身を見る（画面で見えるだけにしない）★
  const bytes = fs.readFileSync(f);
  const text = await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    const c = await pg.getTextContent();
    return c.items.map((i) => i.str).join("\n");
  }, Array.from(bytes));
  expect(/T\d{13}/.test(text), "★出たPDFに T+13桁が無い★\n" + text.slice(0, 400)).toBe(true);
  expect(text).toContain("登録番号");
});

test("★専用の欄に移しても 自社情報は1文字も消えない★", async ({ page }) => {
  await open(page, HONBAN_ISSUER);
  const r = await page.evaluate((moto) => {
    const s = window.currentIssuer();
    // 画面に出す時の行（＝紙に刷る行）
    const lines = window.issuerForEngine().lines;
    return { moto: moto.split("\n"), ima: lines, regno: window.regnoOf(s) };
  }, HONBAN_ISSUER);

  expect(r.regno, "登録番号が専用の欄に移っていない").toBe("T3500003003293");
  // ★紙に出る行は 元と1行も違わない★
  expect(
    r.ima,
    "★紙の行が変わった★\n元: " + r.moto.join(" / ") + "\n今: " + r.ima.join(" / ")
  ).toEqual(r.moto);
});

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★紙の文字の濃さは「全体の色」から作らない。固定する★（指示役 2026-08-15）
//
//   ★なぜ★
//     直す前の紙は 本文・明細・金額が ★#0A5FD0（＝アプリの青そのもの）★だった。
//     ＝★会社が全体の色を変えたら 文字の色も一緒に動く★。
//     薄い色を選ばれた瞬間、★読めない請求書が客先へ出る★。
//     紙は光っていない。白黒コピー・FAX・7年保存で 薄い字と薄い罫は飛ぶ。
//
//   ★決め★
//     本文・明細・金額 ＝ ★#1A1A1A★（画面の #333333 より濃く）
//     副（住所・注記・ラベル） ＝ #444444 まで
//     罫線 ＝ 濃さで #999999 前後（★色で作らない★）
//     ★全体の色を使ってよいのは タイトル（と見出しの線）だけ★
//
//   ★測り方★
//     ★描き終わった紙の画素から色を読む★（ソースの grep でも、PDFの中の指定でもない）。
//     文字の位置は pdf.js の文字座標から取り、その箱の中の
//     ★一番 濃い画素★＝その字のインク とする。
//
//   ★合格★
//     全体の色を 濃い/薄い/中間 の3つに変えて紙を出し、
//     ★本文・明細・金額が 3枚とも #1A1A1A★／★変わるのはタイトルだけ★
// ============================================================

test.setTimeout(300000);

const INK = "#1A1A1A";
const ACCENTS = [
  ["#0A5FD0", "今の青"],
  ["#7FB2FF", "薄い色"],
  ["#B0006E", "濃い別色"],
];

function seed() {
  const uid = "u_pi";
  const co = "株式会社 生野組";
  const rows = [0, 1, 2].map((i) => ({
    id: "m" + i,
    user_id: uid,
    company: co,
    date: "2026-05-0" + (i + 1),
    destination: "本社〜北浜〜曽根崎",
    amount: [12000, 8601, 9407][i],
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  }));
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows,
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
            config: {
              issuer:
                "合同会社ZEROact\nZERO代行\n〒794-0018\n今治市本町7-3-40　00コーポ1号\nTEL090-5716-1946\n登録番号：T3500003003293",
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

// 紙の画素から、指定した文字のインク色を読む
async function inkOf(page, pdfPath, wants) {
  return await page.evaluate(
    async ({ arr, wants }) => {
      const hex = (r, g, b) =>
        "#" +
        [r, g, b]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      const S = 3;
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const pg = await doc.getPage(1);
      const v = pg.getViewport({ scale: S });
      const c = document.createElement("canvas");
      c.width = Math.ceil(v.width);
      c.height = Math.ceil(v.height);
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: v }).promise;
      const tc = await pg.getTextContent();
      const out = {};
      // 空白（半角・全角）を落として探す。紙はタイトルの字間を空けて刷るため
      const norm = (t) => String(t).replace(/[\s\u3000]/g, ""); // \u3000 = zenkaku space
      for (const want of wants) {
        const w = norm(want);
        const it = tc.items.find((i) => norm(i.str) === w) || tc.items.find((i) => norm(i.str).includes(w));
        if (!it) {
          out[want] = "(見つからない)";
          continue;
        }
        const [, , , dd, e, f] = it.transform;
        const X = e * S,
          Y = v.height - f * S,
          W = (it.width || 0) * S,
          H = (it.height || dd) * S;
        const d = x.getImageData(
          Math.max(0, Math.floor(X)),
          Math.max(0, Math.floor(Y - H)),
          Math.max(1, Math.ceil(W)),
          Math.max(1, Math.ceil(H))
        ).data;
        // ★字の芯の色＝濃い画素の中で「一番よく出る色」★
        //   一番濃い1画素だけを見ると、なめらか描き(アンチエイリアス)の縁を拾って
        //   本当より濃い色（#181818 など）が返る＝毎回ちがう数になる。
        const cnt = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (L > 235) continue; // 紙の地は数えない（薄い色のタイトルも拾えるように）
          const k = hex(d[i], d[i + 1], d[i + 2]);
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        let best = null,
          n = 0;
        for (const [k, v] of cnt) if (v > n) ((n = v), (best = k));
        out[want] = best || "(白紙)";
      }
      return out;
    },
    { arr: Array.from(fs.readFileSync(pdfPath)), wants }
  );
}

// 紙の中に「その色の画素」が何個あるか（線の色を数える）
async function countPx(page, pdfPath, hexes) {
  return await page.evaluate(
    async ({ arr, hexes }) => {
      const S = 3;
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const pg = await doc.getPage(1);
      const v = pg.getViewport({ scale: S });
      const c = document.createElement("canvas");
      c.width = Math.ceil(v.width);
      c.height = Math.ceil(v.height);
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: v }).promise;
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const want = hexes.map((h) => [
        h,
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ]);
      const out = {};
      for (const [h] of want) out[h] = 0;
      for (let i = 0; i < d.length; i += 4) {
        for (const [h, r, g, b] of want) {
          if (d[i] === r && d[i + 1] === g && d[i + 2] === b) {
            out[h]++;
            break;
          }
        }
      }
      return out;
    },
    { arr: Array.from(fs.readFileSync(pdfPath)), hexes }
  );
}

test("★全体の色を3つに変えても 本文・明細・金額の濃さが動かない★", async ({ page }) => {
  const OUT = path.join("test-results", "paper-ink");
  fs.mkdirSync(OUT, { recursive: true });

  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", "株式会社 生野組");
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });

  // 紙の中の代表を4つ測る：明細の文字／明細の金額／合計／タイトル
  // ★紙の中の文字は1字ずつ刷られている事がある★（タイトル「請 求 書」）ので
  //   探す語は 実物の文字の切れ方に合わせる（12,000＝明細の金額／請＝タイトルの1字目）
  const WANTS = ["本社〜北浜〜曽根崎", "12,000", "合計", "請"];
  const got = [];
  for (const [acc, label] of ACCENTS) {
    await page.evaluate((a) => {
      window.PAPER_ACCENT = a;
    }, acc);
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: /PDFで保存/ }).click();
    const f = path.join(OUT, "acc" + acc.slice(1) + ".pdf");
    await (await dl).saveAs(f);
    const ink = await inkOf(page, f, WANTS);
    const linePx = await countPx(page, f, ACCENTS.map(([a]) => a));
    got.push({ acc, label, ink, linePx });
    console.log(
      `[paper-ink] ${label} ${acc} → ` +
        WANTS.map((w) => `${w}:${ink[w]}`).join(" / ")
    );
  }

  expect(got.length, "★1枚も出していない★").toBe(3);

  // ① 本文・明細・金額・合計は 3枚とも #1A1A1A
  for (const w of ["本社〜北浜〜曽根崎", "12,000", "合計"]) {
    const cols = got.map((g) => g.ink[w]);
    expect(
      [...new Set(cols)],
      `★「${w}」の濃さが 全体の色で動いている: ${got.map((g) => g.label + "=" + g.ink[w]).join(" / ")}`
    ).toEqual([INK]);
  }

  // ② タイトルの字も 墨（司さん 2026-08-15「請求書って文字も同じ黒にして」）
  const titles = got.map((g) => g.ink["請"]);
  expect(
    [...new Set(titles)],
    `★タイトルの字が墨ではない: ${got.map((g) => g.label + "=" + g.ink["請"]).join(" / ")}`
  ).toEqual([INK]);

  // ③ ★差し替えが本当に効いている事の裏取り★
  //   文字が全部 墨になったので「変わる物」が無くなった＝
  //   ★何も見ていないのに緑★になり得る。全体の色は ★線★ に残っているので、
  //   その色の画素が 紙に在る事／他の色の画素が0である事 を数える。
  for (const g of got) {
    expect(
      g.linePx[g.acc],
      `★全体の色 ${g.acc} の線が紙に1画素も無い＝差し替えが効いていない★`
    ).toBeGreaterThan(50);
    for (const [other] of ACCENTS) {
      if (other === g.acc) continue;
      expect(g.linePx[other], `★${g.label} の紙に 別の色 ${other} の線が残っている★`).toBe(0);
    }
  }
});

test("★紙に 薄い灰青が1つも残っていない★", async () => {
  // 直す前に紙で使っていた薄い灰青。文字にも罫にも使わない。
  const NG = ["#5A6B82", "#6B7787", "#6F8096", "#A8855F", "#0A5FD0"];
  const src = fs.readFileSync("invoice-pdf.js", "utf8");
  // 「文字の色」を決めている所だけ見る（線の色は別）
  const bad = [];
  src.split("\n").forEach((L, i) => {
    const code = L.replace(/\/\/.*$/, "");
    if (!/color\s*:/.test(code)) return;
    for (const ng of NG) if (code.toUpperCase().includes(ng)) bad.push(`${i + 1}: ${L.trim()}`);
  });
  expect(bad, "★紙の文字色に 薄い灰青／全体の色が直書きされている:\n  " + bad.join("\n  ")).toEqual(
    []
  );
});

import { test, expect } from "@playwright/test";

// ============================================================
// ★紙の塊が 重ならない・紙から 落ちない★（2026-11-04 司さん「字を小さくして行を増やして」）
//   行数の上限を 決め打ち（17・22）から「使える縦÷行送り」の 計算に 変えた。
//   計算が 抜けると ★合計が 明細の 表に 重なる★／★自社情報に 重なる★／★紙の下から 落ちる★。
//
//   ★測り方★ 実際に 刷って InvoicePDF.lastBlocks()（塊ごとの 外接の 箱・PDF の y は上向き）を 見る。
//     ①同じ ページで 横に 重なる 2つの 塊が、縦にも 重なっていない（判子は 社名に 重ねる作り＝外す）
//     ②どの 塊も 下端が y≥20（紙の 端から 7mm）
//   5つの 型 × 条件（標準／期限と番号／ロゴ最大／繰越／内訳3つ／全部）× 行数 4〜40 を 刷る。
//   ★直す前の 本番の 作りでは 繰越の 会社で 赤だった（対立役が 測った：合計が 自社情報に 21〜36pt 入る）★
// ============================================================

test.setTimeout(600000);

function seed() {
  const uid = "u_kasanari";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: [],
        companies: [],
        issuer: [],
        payments: [],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

const TYPES = [
  { key: "elegant_logo", pdfDesign: "elegant", headerStyle: "B", logoMode: "show" },
  { key: "elegant_plain", pdfDesign: "elegant", headerStyle: "B", logoMode: "hide" },
  { key: "classic_diag_logo", pdfDesign: "classic", headerStyle: "A", logoMode: "show" },
  { key: "classic_diag_plain", pdfDesign: "classic", headerStyle: "A", logoMode: "hide" },
  { key: "classic_center", pdfDesign: "classic", headerStyle: "B", logoMode: "hide" },
];
const CONDS = ["標準", "期限と番号", "ロゴ最大", "繰越", "内訳3つ", "全部"];
const NS = [4, 10, 15, 20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 40];

const RUN = async ({ type, conds, ns }) => {
  const img = (w, h, color) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  };
  const LOGO = img(250, 100, "#3366aa"); // 横長 2.5:1（よくある形）
  const LOGO_TALL = img(120, 120, "#3366aa"); // 正方形＝一番 高くなる
  const HANKO = img(120, 120, "#c0392b");
  const GROUPS = ["日中", "夜間", "深夜"];
  const out = [];
  for (const cond of conds) {
    const all = cond === "全部";
    const iss = {
      lines: [
        "見本運送合同会社",
        "〒000-0000",
        "見本県見本市見本町1-2-3 見本ビル4階",
        "TEL 000-0000-0000",
        "FAX 000-0000-0001",
        "登録番号：T9000000000009",
      ],
      bank: [
        "お振込先",
        "見本銀行　本店　普通　0000000",
        "名義　ミホンウンソウ（ド",
        "振込手数料はご負担ください",
      ],
      alignIssuer: "auto",
      lineIssuer: "auto",
      posGrand: "auto",
      posLead: "auto",
      posDue: all || cond === "期限と番号" ? "left" : "auto",
      dateEra: "seireki",
      showInvoiceNo: all || cond === "期限と番号",
      paymentDue: all || cond === "期限と番号" ? "2026年12月31日" : "",
      taxMode: "内税",
      carry:
        all || cond === "繰越"
          ? { maeSeikyu: 123456, nyukin: 100000, kurikoshi: 23456, seikyuGaku: 223456, riyu: [] }
          : null,
      hanko: HANKO,
      hankoSizeMm: 21,
      logo: type.logoMode === "show" ? (all || cond === "ロゴ最大" ? LOGO_TALL : LOGO) : null,
      logoSizeMm: all || cond === "ロゴ最大" ? 46 : 40,
      pdfDesign: type.pdfDesign,
      headerStyle: type.headerStyle,
      logoMode: type.logoMode,
      templateId: type.key,
      pdfFont: "BIZ UDPゴシック",
      fontScale: 1,
      blkFs: null,
    };
    const notes = all || cond === "内訳3つ";
    const master = {
      X: {
        items: ["日付", "行き先", "金額", "備考"],
        widths: {},
        noteSummary: notes,
        noteGroups: notes ? GROUPS : [],
      },
    };
    for (const n of ns) {
      const rows = [];
      for (let i = 0; i < n; i++)
        rows.push({
          会社名: "X",
          日付: "2026-08-" + String((i % 28) + 1).padStart(2, "0"),
          行き先: "本社〜北浜〜曽根崎",
          金額: 6600 + i,
          備考: GROUPS[i % 3],
        });
      await window.InvoicePDF.buildOne(master, "X", rows, "2026-08", iss, "2026-08-01");
      const blocks = window.InvoicePDF.lastBlocks();
      const pages = Math.max(...blocks.map((b) => b.page)) + 1;
      const bad = [];
      for (const b of blocks) {
        const bot = b.y - b.h;
        if (bot < 20) bad.push(`p${b.page + 1} ${b.key} 下端 y=${bot.toFixed(1)}<20`);
      }
      for (let i = 0; i < blocks.length; i++)
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i],
            b = blocks[j];
          if (a.page !== b.page) continue;
          if (a.key === "hanko" || b.key === "hanko") continue;
          const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const yo = Math.min(a.y, b.y) - Math.max(a.y - a.h, b.y - b.h);
          if (xo > 0.5 && yo > 0.5)
            bad.push(`p${a.page + 1} ${a.key}×${b.key} 縦に ${yo.toFixed(1)}pt 重なる`);
        }
      out.push({ cond, n, pages, blocks: blocks.length, bad });
    }
  }
  return out;
};

for (const type of TYPES)
  test(`★紙の塊が重ならない・落ちない（${type.key}）★`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.InvoicePDF && window.InvoicePDF.buildOne, null, {
      timeout: 30000,
    });

    const res = await page.evaluate(RUN, { type, conds: CONDS, ns: NS });
    expect(res.length, "★刷った数が足りない（0件の緑は未検査）★").toBe(CONDS.length * NS.length);
    // 1枚に 収まった 一番 多い 行数（司さんへの 答えの 元）
    const one = {};
    for (const r of res) if (r.pages === 1) one[r.cond] = Math.max(one[r.cond] || 0, r.n);
    console.log(
      `[kami-kasanari] ${type.key} 1枚に収まった最大の行数（刷った行数の中で）: ${JSON.stringify(one)}`
    );
    for (const r of res)
      expect(r.blocks, `★塊を 1つも 見ていない ${r.cond} n=${r.n}★`).toBeGreaterThan(5);
    const bad = res.filter((r) => r.bad.length);
    expect(
      bad.map((r) => `${r.cond} n=${r.n}（${r.pages}枚）: ${r.bad.join(" / ")}`),
      "★塊が 重なる／紙から 落ちる★"
    ).toEqual([]);
  });

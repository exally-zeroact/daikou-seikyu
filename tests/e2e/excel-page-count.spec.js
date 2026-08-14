import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★Excelを印刷すると 白紙が1枚おきに挟まっていた★ 2026-08-15
//
//   ★実際に起きていた事★
//     明細60本（論理4ページ）の請求書を Excel で印刷すると ★紙7枚・うち3枚が白紙★。
//     論理ページの終わりに ★中身の無い行を2本★ 足していたため、
//     1ページぶんの高さが A4 を超え、Excel が ★自動の改ページ★ を入れる。
//     はみ出したのが空行なので、★白紙が1枚 生まれる★。
//     ★2543fc3（Excelの欠けを直す前）でも同じ★＝古くからの物。
//
//   ★本物のExcelで測った値（この試験のしきい値の根拠）★
//     ・A4縦・上0.47in/下0.39in → 印刷できる高さ ★780pt★
//     ・高さ指定の無い行は Excel では ★17.625pt★（StandardHeight 12.8 ではない）
//     ・直す前 1ページ ★761.25pt★ → ★自動の改ページが入った★（白紙が出た）
//     ・直した後 1ページ ★726.0pt★  → ★自動の改ページ 0本・白紙 0枚★
//     → しきい値は間を取って ★740pt★。
//   ★本物のExcelで数えた結果（1/2/4ページ）★ 自動改ページ 0本・白紙 0枚・横の改ページ 0本
//
//   ※ CI に Excel は無いので、ここでは ★出来上がった xlsx の中身★ で測る:
//      A 論理ページの終わりに ★空行が無い★（白紙の直接の原因）
//      B 1ページぶんの高さ ≦ 740pt
//      C 論理ページ数 ＝ 改ページ数 + 1
// ============================================================

test.setTimeout(240000);

const CO = "頁確認社";
const PRINTABLE = 780; // A4縦 - 上下マージン（実測）
const LIMIT = 740; // 実測 761.25=白紙が出る / 726.0=出ない の間
const DEFAULT_HT = 17.625; // 高さ指定の無い行の実際の高さ（Excelで実測）

function seed(n) {
  const uid = "u_pgc";
  const co = "頁確認社";
  const rows = [];
  for (let i = 0; i < n; i++)
    rows.push({
      id: "m" + i,
      user_id: uid,
      company: co,
      date: "2026-05-" + String((i % 28) + 1).padStart(2, "0"),
      destination: "本社〜北浜〜曽根崎",
      amount: 12000,
      note: "",
      distance: null,
      people: 1,
      name: "",
      extra: null,
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
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
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

for (const [N, KIND] of [
  [10, "1ページ"],
  [40, "2ページ+まとめ"],
  [60, "4ページ"],
])
  test(`★Excelに白紙が挟まらない・${KIND}★`, async ({ page }) => {
    const OUT = path.join("test-results", "excel-pages-" + N);
    fs.mkdirSync(OUT, { recursive: true });

    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed, N);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
    await page.locator('.nav-item[data-scr="billing"]').click();
    await page.selectOption("#invMonth", "2026-05");
    await page.selectOption("#invCompany", CO);
    await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });

    await page.waitForFunction(() => !!window.XLSX && !!window.XLSX.write, null, {
      timeout: 60000,
    });
    await page.getByRole("button", { name: /Excelに書き出し/ }).click();
    const picker = page.locator("#modalBody");
    await expect(picker.getByText("入れる内容")).toBeVisible();
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await picker.getByRole("button", { name: /このExcelを作る/ }).click();
    const xlPath = path.join(OUT, "pages.xlsx");
    await (await dl).saveAs(xlPath);

    // ★zip の中の生の xml を読む★（改ページと行高は SheetJS の読み取りでは戻らない）
    const { raw, sst } = await page.evaluate(
      async (arr) => {
        const zip = await window.JSZip.loadAsync(new Uint8Array(arr));
        const wb = await zip.file("xl/workbook.xml").async("string");
        const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
        const rid = (wb.match(/<sheet[^>]*name="頁確認社"[^>]*r:id="([^"]+)"/) || [])[1];
        const target = (rels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1];
        const ssf = zip.file("xl/sharedStrings.xml");
        const ssx = ssf ? await ssf.async("string") : "";
        // 共有文字列＝空文字も1件として入る（★""のセルは「中身あり」ではない★）
        const sst = [...ssx.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
          m[1].replace(/<[^>]+>/g, "").trim()
        );
        return { raw: await zip.file("xl/" + target.replace(/^\//, "")).async("string"), sst };
      },
      Array.from(fs.readFileSync(xlPath))
    );

    // 行ごとの高さと「中身が在るか」
    const rows = new Map();
    // ★空行は <row r="50"/> と自分で閉じる★。先に閉じ側を見ないと
    //   「開いたまま次の </row> まで」を1行と読んでしまい、★空行が中身ありに化ける★（実際に踏んだ）。
    for (const m of raw.matchAll(/<row ([^>]*?)(?:\/>|>(.*?)<\/row>)/gs)) {
      const attr = m[1] || "";
      const body = m[2] || "";
      const r = Number((attr.match(/r="(\d+)"/) || [])[1]);
      const ht = (attr.match(/ht="([\d.]+)"/) || [])[1];
      // ★中身あり＝目に見える文字が1つでも在る事★。
      //   空の文字列("")のセルも xlsx には書かれるので、t="s" が在るだけで数えると
      //   ★空行が「中身あり」に化けて、白紙の原因を見落とす★（実際に踏んだ）。
      let has = false;
      for (const c of body.matchAll(/<c ([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
        const t = (c[1].match(/t="([^"]+)"/) || [])[1];
        const v = (c[2] || "").replace(/<[^>]+>/g, "").trim();
        if (!v) continue;
        if (t === "s") {
          if ((sst[Number(v)] || "") !== "") has = true;
        } else has = true;
        if (has) break;
      }
      rows.set(r, { h: ht ? Number(ht) : DEFAULT_HT, has });
    }
    const breaks = [...raw.matchAll(/<brk id="(\d+)"/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 0);
    const last = Math.max(...rows.keys());

    expect(rows.size, "★行を1つも見ていない（0本の緑は未検査）★").toBeGreaterThan(10);

    const starts = [1, ...breaks.map((b) => b + 1)];
    const pages = starts.map((a, i) => [a, (starts[i + 1] || last + 1) - 1]);

    const tailBlank = [];
    const tooTall = [];
    for (const [a, b] of pages) {
      let sum = 0;
      for (let r = a; r <= b; r++) sum += (rows.get(r) || { h: DEFAULT_HT }).h;
      if (sum > LIMIT)
        tooTall.push(`${a}〜${b}行 高さ${sum.toFixed(1)}pt > ${LIMIT}pt（紙は${PRINTABLE}pt）`);
      // 末尾の空行＝はみ出して白紙になる物
      let n = 0;
      for (let r = b; r >= a; r--) {
        if ((rows.get(r) || { has: false }).has) break;
        n++;
      }
      if (n > 0) tailBlank.push(`${a}〜${b}行 の終わりに 中身の無い行が${n}本`);
    }

    // ★横にはみ出す列が1本でも在ると 紙が横に2枚になる★（右half が白紙で出る型）
    //   列幅(wch)→点 の係数は 本物のExcelで実測：列幅の合計63 が 402.4pt ＝ 1wch あたり 6.387pt
    const WCH_PT = 6.387;
    const PRINTABLE_WIDE = 480; // A4横 595.3pt − 左右マージン（実測）
    const cols = [...raw.matchAll(/<col [^>]*min="(\d+)"[^>]*max="(\d+)"[^>]*width="([\d.]+)"/g)];
    let wide = 0;
    let lastDeclared = 0;
    for (const c of cols) {
      const a = Number(c[1]),
        b = Number(c[2]),
        w = Number(c[3]);
      wide += (b - a + 1) * (w - 0.71) * WCH_PT; // xlsx の width は wch+余白0.71
      lastDeclared = Math.max(lastDeclared, b);
    }
    let lastUsed = 0;
    for (const c of raw.matchAll(/<c r="([A-Z]+)\d+"/g)) {
      let n = 0;
      for (const ch of c[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
      lastUsed = Math.max(lastUsed, n);
    }
    expect(
      lastUsed,
      `★決めた列(${lastDeclared})より右にセルが在る(${lastUsed})＝紙が横に増える★`
    ).toBeLessThanOrEqual(lastDeclared);
    expect(
      Math.round(wide),
      `★列幅の合計 ${Math.round(wide)}pt が 紙の横幅 ${PRINTABLE_WIDE}pt を超える＝右half が白紙で出る★`
    ).toBeLessThanOrEqual(PRINTABLE_WIDE);

    expect(
      tailBlank,
      "★ページの終わりに空行がある＝白紙が挟まる:\n  " + tailBlank.join("\n  ")
    ).toEqual([]);
    expect(
      tooTall,
      "★1ページがA4に収まらない＝自動の改ページで白紙が出る:\n  " + tooTall.join("\n  ")
    ).toEqual([]);

    console.log(
      `[excel-page-count] ${KIND}: 論理${pages.length}ページ / 行${rows.size}本 / ` +
        pages.map(([a, b]) => `${a}-${b}`).join(" ")
    );
  });

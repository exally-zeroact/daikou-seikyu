import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★Excelの文字は「セルに在る」だけでは紙に出ない★ 2026-08-14
//
//   ★実際に踏んだ2つ★
//     ① 合計欄のラベル「消費税（10%・内税）」が、列幅13に対して要る幅≒20で
//        ★「費税（10%・内税」に欠けて印刷された★。
//        中央揃えは 右隣(金額)が埋まっていると ★左右とも切り落とす★（左へはみ出さない）。
//        → 文字を読む試験では ★絶対に捕まらない★。cell.v は欠けていない（欠けるのは紙だけ）。
//     ② 結合したセルは ★左上の値しか出ない★。右端に書いた
//        「次ページへ続く →」「自社情報フッター」は ★Excelでは丸ごと消える★。
//
//   ★だから測るのは「文字が在るか」ではなく★
//     A. 値が結合の ★左上★ に在るか（右端に書いていないか）
//     B. その文字に要る幅 ≦ 使える幅（自分の列＋結合した列の合計）か
//
//   幅の数え方：Excelの列幅(wch)は半角字数。全角=2・半角=1で数え、文字サイズで割り増す。
// ============================================================

test.setTimeout(180000);

const CO = "内税社";
const UID = "u_fit";

// 明細の本数を変えて 1ページ／複数ページ の両方を測る
// （★複数ページでしか出ない「このページの小計」「次ページへ続く →」を1ページだけで測ると 見ないまま緑になる★）
function seed(n) {
  const uid = "u_fit";
  const co = "内税社";
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
              // ★自社情報フッター★＝結合の右端に書いていた所。ここが空だと ②を測れない
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

// 全角=2・半角=1 で数えた「要る幅」（Excelの列幅wchと同じ単位）
function needWch(s, sz) {
  let n = 0;
  for (const ch of String(s)) n += /[\x20-\x7E｡-ﾟ]/.test(ch) ? 1 : 2;
  return (n * (sz || 11)) / 11;
}

for (const [N, KIND] of [
  [1, "1ページ"],
  [60, "複数ページ"],
])
  test(`★Excelの文字が 紙で欠けない・${KIND}（幅と結合を実測）★`, async ({ page }) => {
    const OUT = path.join("test-results", "excel-fit-" + N);
    fs.mkdirSync(OUT, { recursive: true });

    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed, N);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
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
    const xlPath = path.join(OUT, "fit.xlsx");
    await (await dl).saveAs(xlPath);

    // 出来上がったファイルから セル・結合・列幅を取り出す
    const sheets = await page.evaluate(
      async (arr) => {
        const wb = window.XLSX.read(new Uint8Array(arr), { type: "array", cellStyles: true });
        return wb.SheetNames.map((n) => {
          const ws = wb.Sheets[n];
          const cells = [];
          for (const k of Object.keys(ws)) {
            if (k[0] === "!") continue;
            const c = ws[k];
            if (c.v == null || String(c.v).trim() === "") continue;
            const rc = window.XLSX.utils.decode_cell(k);
            cells.push({
              a: k,
              r: rc.r,
              c: rc.c,
              v: String(c.v),
              num: typeof c.v === "number",
              sz: (c.s && c.s.font && c.s.font.sz) || 11,
            });
          }
          return {
            name: n,
            cells,
            merges: (ws["!merges"] || []).map((m) => ({
              r1: m.s.r,
              c1: m.s.c,
              r2: m.e.r,
              c2: m.e.c,
            })),
            cols: (ws["!cols"] || []).map((x) => Number(x.wch) || 9),
          };
        });
      },
      Array.from(fs.readFileSync(xlPath))
    );

    expect(sheets.length, "シートが1枚も無い").toBeGreaterThan(0);

    const lost = [];
    const cut = [];
    let looked = 0;

    for (const sh of sheets) {
      const mergeOf = (r, c) =>
        sh.merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
      const wch = (c) => sh.cols[c] || 9;

      for (const cell of sh.cells) {
        looked++;
        const m = mergeOf(cell.r, cell.c);
        // A. 結合の左上以外に置かれた値＝Excelでは ★出ない★
        if (m && !(m.r1 === cell.r && m.c1 === cell.c)) {
          lost.push(
            `${sh.name} ${cell.a} 「${cell.v}」（結合 ${m.r1},${m.c1}〜${m.r2},${m.c2} の左上でない）`
          );
          continue;
        }
        if (cell.num) continue; // 数はセル幅を超えると ### になるが 桁は書式次第。文字だけ測る
        // B. 使える幅（自分の列＋結合した列）と 要る幅
        let have = 0;
        if (m) for (let c = m.c1; c <= m.c2; c++) have += wch(c);
        else have = wch(cell.c);
        // 右端まで空きが続く行末の文字は はみ出して読めるので除く
        const right = m ? m.c2 : cell.c;
        const blocked = sh.cells.some((o) => o.r === cell.r && o.c > right);
        if (!blocked) continue;
        const need = needWch(cell.v, cell.sz);
        if (need > have)
          cut.push(`${sh.name} ${cell.a} 「${cell.v}」 要る幅${need.toFixed(1)} > 使える幅${have}`);
      }
    }

    expect(looked, "★1つも見ていない（0本の緑は未検査）★").toBeGreaterThan(20);
    expect(lost, "★結合の左上に無い＝Excelでは消える文字:\n  " + lost.join("\n  ")).toEqual([]);
    expect(cut, "★列幅が足りず 紙で欠ける文字:\n  " + cut.join("\n  ")).toEqual([]);

    // 見た本数を残す（0本の緑と区別する）
    console.log(
      `[excel-label-fits] ${KIND}: シート${sheets.length}枚 / 文字と数 ${looked}個 を測った`
    );
  });

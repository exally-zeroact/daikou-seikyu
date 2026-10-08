import { test, expect } from "@playwright/test";

// ============================================================
// ★★読めなかった 物が 在る 時は 請求書を 作らない・入金／自社情報／番号を 書かない★★ 2026-10-08
//
//   司さんの 決め「お金の出力は 1人でも 計算できなければ 止めて 警告」
//   ★前★ 入金・自社情報・控え・番号の 台帳は 読めなくても toast だけで 画面が 動き、
//         ・既定の 自社情報（振込先・登録番号）で 請求書が 出る
//         ・台帳に 無い 事に なり 番号を 作り直して 倉庫の 凍結した 番号を 上書き
//         ・未入金に 見えた まま 入金を 上書き
//   ★物差し★ 4つ それぞれ 読めない ⇒ 請求書の ボタンが 止まり・作る 関数が 何も 返さず・
//             自社情報／入金／番号への 書き込みが 0回。全部 読める ⇒ ボタンは 押せる（止めすぎない）
//
//   ★★わざと壊して 赤に なるのを 見た（2026-10-08 実測）★★ 下の 試験の 頭に 書く
// ============================================================

const CO = "飛勝工業株式会社";
test.setTimeout(120000);

function seed() {
  const uid = "u_yomi";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "y@x.com": { id: uid, email: "y@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "y@x.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: CO_NA,
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
            id: "c2",
            user_id: uid,
            name: CO_NA,
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
              issuer: "合同会社ZEROact\n登録番号：T3500003003293",
              bank: "伊予銀行",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [{ user_id: uid, month: "2026-05", company: CO_NA, invoice_no: "202605-099" }],
        payments: [
          {
            id: "p1",
            user_id: uid,
            month: "2026-05",
            company: CO_NA,
            paid: 5000,
            paid_date: "2026-06-01",
            memo: "半分",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

async function open(page, ochiru, ooi, kaeru, hiki) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript((t) => {
    window.__FAKE_FAIL_TABLES__ = t;
    window.__FAKE_WRITES__ = {};
  }, ochiru);
  await page.addInitScript(`var CO_NA = ${JSON.stringify(CO)};(${seed.toString()})();`);
  // ★台帳の 前に 1000行 足す（1001行目が 目当ての 月）★
  if (ooi)
    await page.addInitScript(() => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      const mae = [];
      for (let i = 0; i < 1000; i++)
        mae.push({
          user_id: "u_yomi",
          month: "2025-01",
          company: "ダミー" + i,
          invoice_no: "202501-" + i,
        });
      db.tables.invoice_no = mae.concat(db.tables.invoice_no);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    });
  // ★倉庫の 中身を 変える（その 試験 だけ）★
  if (kaeru)
    await page.addInitScript(
      `(function(){var db=JSON.parse(localStorage.getItem("__fake_supa_db__"));(${kaeru.toString()})(db, ${JSON.stringify(hiki === undefined ? null : hiki)});localStorage.setItem("__fake_supa_db__",JSON.stringify(db));})();`
    );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 60000 });
}

const TORENAI = "取って来られません";

// ★★自社情報・控え・番号の 台帳 を 取って来られない ⇒ 請求書を 作らない・書かない★★
//   ★わざと壊して 赤（2026-10-08 実測）★ _buildInvoiceBytes・saveIssuer・issueInvoiceNo の 門を 外す ⇒ 赤
for (const t of ["issuer", "invoices", "invoice_no"]) {
  test("★" + t + " を 取って来られない ⇒ 請求書を 作らない・書かない★", async ({ page }) => {
    const err = [];
    page.on("pageerror", (e) => err.push(e.message));
    await open(page, [t]);
    await expect(page.locator("#btnInvPdf")).toBeDisabled();
    await expect(page.locator("#regnoWarn")).toContainText(TORENAI);
    const r = await page.evaluate(async (co) => {
      window.__FAKE_WRITES__ = {};
      const bytes = await _buildInvoiceBytes();
      await saveIssuer();
      let no = "投げなかった";
      try {
        await issueInvoiceNo("2026-05", co);
      } catch (e) {
        no = "投げた";
      }
      return {
        bytes: bytes,
        writes: window.__FAKE_WRITES__,
        no: no,
        out: document.getElementById("invoiceOut").textContent,
      };
    }, CO);
    console.log("★" + t + "★ " + JSON.stringify(r).slice(0, 300));
    expect(r.bytes, "★取って来られないのに 請求書を 作った★").toBeNull();
    if (t === "issuer") expect(r.writes.issuer || 0, "★自社情報を 既定で 上書き★").toBe(0);
    if (t === "invoice_no") {
      expect(r.writes.invoice_no || 0, "★台帳の 番号を 上書き★").toBe(0);
      expect(r.no).toBe("投げた");
    }
    expect(r.out, "★画面に 請求書を 描いた★").toContain(TORENAI);
    expect(err).toEqual([]);
  });
}

// ★★入金を 取って来られない だけ なら 請求書は 出す（司さん 10-08「入金が出来んだけでなぜ請求書をとめるんど」）★★
//   止めるのは 入金の 保存と 前回繰越を 載せる 会社 だけ
//   ★わざと壊して 赤（2026-10-08 実測）★ 請求書の 門に 入金を 戻す ⇒ ★赤★（ボタンが 止まる）
test("★入金を 取って来られない・繰越なしの 会社 ⇒ 請求書の ボタンは 押せる・入金は 書かない★", async ({
  page,
}) => {
  await open(page, ["payments"]);
  await expect(page.locator("#btnInvPdf")).toBeEnabled();
  const r = await page.evaluate(async (co) => {
    window.__FAKE_WRITES__ = {};
    await markPaidFull("2026-05", co, 12000);
    return {
      w: window.__FAKE_WRITES__.payments || 0,
      out: document.getElementById("invoiceOut").textContent,
    };
  }, CO);
  expect(r.w, "★取って来られない 入金を 上書き★").toBe(0);
  expect(r.out).not.toContain(TORENAI);
});
//   ★わざと壊して 赤（2026-10-08 実測）★ kurikoshiTomeru を 外す ⇒ ★赤★（繰越の 会社の 請求書が 押せる）
test("★入金を 取って来られない・前回繰越を 載せる 会社 ⇒ その 請求書は 止める★", async ({
  page,
}) => {
  await open(page, ["payments"], false, (db) => {
    db.tables.companies.forEach(
      (c) => (c.config = Object.assign({}, c.config, { carryover: true }))
    );
  });
  await expect(page.locator("#btnInvPdf")).toBeDisabled();
  await expect(page.locator("#regnoWarn")).toContainText("前回繰越");
  const bytes = await page.evaluate(() => _buildInvoiceBytes());
  expect(bytes).toBeNull();
});

// ★★入金の 門を 1つずつ★★（どれも その 門 1つを 外すと その 1本が 赤）
for (const [na, yobu, tou] of [
  ["savePay", (co) => savePay("2026-05", co, 12000), "入金の 保存"],
  ["bulkMarkPaid", () => bulkMarkPaid(), "入金の 保存"],
  ["undoPayState", (co) => undoPayState("2026-05", co, null), "入金の 保存"],
  ["exportReport（集計の Excel）", () => exportReport(), "集計の Excel の 作成"],
]) {
  test("★入金を 取って来られない ⇒ " + na + " は 止まる★", async ({ page }) => {
    await open(page, ["payments"]);
    const r = await page.evaluate(
      async ([src, co]) => {
        window.__FAKE_WRITES__ = {};
        const f = eval("(" + src + ")");
        await f(co);
        return {
          w: window.__FAKE_WRITES__.payments || 0,
          toast: document.getElementById("toast").textContent,
        };
      },
      [yobu.toString(), CO]
    );
    console.log("★" + na + "★ " + JSON.stringify(r));
    expect(r.w, "★取って来られない 入金を 書いた★").toBe(0);
    expect(r.toast, "★止めた 訳を 出していない★").toContain(tou);
    expect(r.toast).toContain(TORENAI);
  });
}

test("★全部 取って来られる ⇒ 請求書の ボタンは 押せる（止めすぎない）★", async ({ page }) => {
  await open(page, []);
  await expect(page.locator("#btnInvPdf")).toBeEnabled();
  const out = await page.evaluate(() => document.getElementById("invoiceOut").textContent);
  expect(out).not.toContain(TORENAI);
});

// ★★自社情報の 無い 新しい 客 ⇒ ZEROact の 字を 出さず「自社情報を入れてください」で 止める★★ 2026-10-08
//   司さん「自社情報を入れて下さいと警告をだせや」
//   ★わざと壊して 赤（2026-10-08 実測）★ 行が 無い 時の 既定を defaultIssuer に 戻す ⇒ ★赤★（ZEROact の 振込先・ボタンが 押せる）
test("★自社情報の 無い 客 ⇒ 警告・請求書は 作らない・ZEROact の 字は 無い★", async ({ page }) => {
  await open(page, [], false, (db) => {
    db.tables.issuer = [];
  });
  await expect(page.locator("#btnInvPdf")).toBeDisabled();
  await expect(page.locator("#regnoWarn")).toContainText("自社情報を入れてください");
  const r = await page.evaluate(async () => {
    const s = currentIssuer();
    window.__FAKE_WRITES__ = {};
    setIssuer("dateEra", "reiwa"); // 様式を 1つ 触る（前は ここで ZEROact の 字ごと 保存された）
    await new Promise((ok) => setTimeout(ok, 1500));
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      bank: s.bank,
      issuer: s.issuer,
      saved: JSON.stringify(db.tables.issuer || []),
      bytes: await _buildInvoiceBytes(),
    };
  });
  console.log("★自社情報 無し★ " + JSON.stringify(r).slice(0, 300));
  expect(r.bank + r.issuer, "★ZEROact の 字が 入っている★").not.toMatch(
    /ZEROact|4160657|T3500003003293/
  );
  expect(r.saved, "★ZEROact の 字が 他の 客の 行に 保存された★").not.toMatch(
    /4160657|T3500003003293/
  );
  expect(r.bytes, "★自社情報が 無いのに 請求書を 作った★").toBeNull();
});

// ★★請求番号が 台帳で 別の 会社に 出した 番号と 重なる ⇒ 出さず 知らせる★★ 2026-10-08（司さん「台帳ってなんど、ほんでなんで変わるんど」）
//   ★わざと壊して 赤（2026-10-08 実測）★ bangouTomeru を 外す ⇒ ★赤★（同じ 番号で 出る）
//   ★番号を 紙に 刷る 時（showInvoiceNo 入）だけ 止める★（刷らない 番号の ために 止めない・対立役 2026-10-08）
function kasanaru(db, sn) {
  // この 会社の 計算の 番号（2026-05-01）を 台帳で 別の 会社に 出した 事に する
  db.tables.invoice_no = [
    {
      user_id: "u_yomi",
      month: "2026-05",
      company: "前に 消した 会社",
      invoice_no: "2026-05-01",
    },
  ];
  db.tables.issuer[0].config.showInvoiceNo = sn;
  // 重ならない 月（6月）も 1件（Excel を 別の 月から 出す 試験に 使う）
  db.tables.meisai.push(Object.assign({}, db.tables.meisai[0], { id: "m6", date: "2026-06-03" }));
}
test("★番号を 刷る・別の 会社の 出した 番号と 重なる ⇒ 出さず 両方の 会社名を 出す★", async ({
  page,
}) => {
  await open(page, [], false, kasanaru, true);
  await expect(page.locator("#btnInvPdf")).toBeDisabled();
  await expect(page.locator("#regnoWarn")).toContainText("重なります");
  await expect(page.locator("#regnoWarn")).toContainText("前に 消した 会社");
  const bytes = await page.evaluate(() => _buildInvoiceBytes());
  expect(bytes).toBeNull();
});

// ★★番号を 刷らない（本番は これ）⇒ 重なっても 請求書は 出す・台帳には 書かない★★ 2026-10-08 対立役
//   ★わざと壊して 赤（2026-10-08 実測）★ bangouButsukari の showInvoiceNo を 見る 行を 外す ⇒ ★赤★（ボタンが 押せない）
//   issueInvoiceNo の「刷らない 時は 書かない」を 外す ⇒ ★赤★（別の 会社の 番号を 台帳に 書く）
test("★番号を 刷らない・重なる ⇒ 請求書は 出す・同じ 番号を 台帳に 書かない★", async ({ page }) => {
  await open(page, [], false, kasanaru, false);
  await expect(page.locator("#btnInvPdf")).toBeEnabled();
  await expect(page.locator("#regnoWarn")).toBeHidden();
  const r = await page.evaluate(async (co) => {
    window.__FAKE_WRITES__ = {};
    // ★紙の 門（_buildInvoiceBytes の 中と 同じ 判じ）が 止めない＝PDF の 部品は 試験では 読まない ので 門だけ 見る★
    const tomeru = bangouTomeru("2026-05", [co]);
    const no = await issueInvoiceNo("2026-05", co);
    return { tomeru: tomeru, no: no, w: window.__FAKE_WRITES__.invoice_no || 0 };
  }, CO);
  console.log("★刷らない 重なり★ " + JSON.stringify(r));
  expect(r.tomeru, "★刷らない 番号の ために 請求書を 止めた★").toBe(false);
  expect(r.no, "★番号が 計算の 1本で ない★").toBe("2026-05-01");
  expect(r.w, "★別の 会社に 出した 番号を 台帳に 2重に 書いた★").toBe(0);
});

// ★★番号の 台帳が 1000行を 越えても 黙って 切れない（凍結した 番号を 上書きしない）★★ 2026-10-08（対立役 B）
//   ★わざと壊して 赤（2026-10-08 実測）★ invoice_no の 読み込みを 1回の select に 戻す ⇒ ★赤★（番号を 書き直す）
test("★台帳 1001行（目当ての 月が 1001行目）⇒ 番号は 台帳の まま・書かない★", async ({ page }) => {
  await open(page, [], true);
  const r = await page.evaluate(async (co) => {
    window.__FAKE_WRITES__ = {};
    const no = await issueInvoiceNo("2026-05", co);
    return { no: no, w: window.__FAKE_WRITES__.invoice_no || 0 };
  }, CO);
  console.log("★1001行★ " + JSON.stringify(r));
  expect(r.no, "★1000行で 切れて 台帳の 番号を 見失った★").toBe("202605-099");
  expect(r.w, "★凍結した 番号を 書き直した★").toBe(0);
});

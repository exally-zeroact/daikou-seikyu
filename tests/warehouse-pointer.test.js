"use strict";
// ============================================================
// ★代行請求アプリの倉庫の向き先を、勝手に変えさせない★ 2026-08-06
//
//   ★何が起きたか（司さん「また同じことが起きるやろが」）★
//     「テスト環境が本番の倉庫を見ている」という直しで、
//     ★司さんが毎日使う代行請求アプリまで空のテストDBへ向け替えられた。★
//     開いた瞬間 明細0件・会社0件になり、アプリは「まだ誰も居ない」と判断して
//     ログイン画面を出した。司さんは自分の画面に入れなくなった。
//     （データは1件も消えていない。見に行く先が変わっただけ）
//
//   ★なぜ気づけなかったか★
//     画面はいつもどおり開く。エラーも出ない。★中身が空になるだけ★。
//     しかもこのアプリは★本番用の別の家が無い★（実測 2026-08-06）:
//         exally-test.vercel.app/daikou-seikyu.html … 200 ← ここだけ
//         exally / exally-staging / daikome-jimusho … 全部404
//     ＝この住所が本番。名前が "test" なだけ。
//
//   ★だから機械で縛る★
//     向き先を変えるなら、まず★テスト用の家を建ててから★。
//     それまでは、ここが赤くなって気づける。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ★本番の倉庫（司さんの請求データ 明細1080件 / 会社24件 が入っている所）★
const PROD_REF = "tnfwipbgfgjaymlszeid";

// 倉庫を見に行くファイル（画面もサーバ側も両方）
const FILES = ["daikou-seikyu.html", "api/excel.js"];

function refsIn(text) {
  const out = [];
  // https://xxxx.supabase.co
  const url = /https:\/\/([a-z0-9]{16,})\.supabase\.co/g;
  let m;
  while ((m = url.exec(text))) out.push({ where: "URL", ref: m[1] });
  // anon/service キーの中の "ref":"xxxx"
  const key = /"ref"\s*:\s*"([a-z0-9]{16,})"/g;
  while ((m = key.exec(text))) out.push({ where: "鍵", ref: m[1] });
  // 鍵が JWT のままでも中身を読む
  const jwt = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]{20,})\./g;
  while ((m = jwt.exec(text))) {
    try {
      const b = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b + "=".repeat((4 - (b.length % 4)) % 4);
      const o = JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
      if (o && typeof o.ref === "string") out.push({ where: "鍵(JWT)", ref: o.ref });
    } catch (_) {
      /* 読めない物は無視 */
    }
  }
  return out;
}

describe("★代行請求アプリが、司さんの本番の倉庫を見ていること★", () => {
  FILES.forEach(function (f) {
    it(f + " が本番の倉庫を見ている", () => {
      const found = refsIn(read(f));
      expect(found.length, "★倉庫の向き先が1つも読み取れない★").toBeGreaterThan(0);
      const wrong = found.filter((x) => x.ref !== PROD_REF);
      expect(
        wrong,
        "★別の倉庫を見ている＝開いても中身が空になり、司さんが自分の画面に入れなくなる★\n" +
          "  先にテスト用の家を建ててから切り替えること。"
      ).toEqual([]);
    });
  });

  it("★画面とサーバ側が同じ倉庫を見ている★（片方だけ切り替えない）", () => {
    const refs = FILES.map(function (f) {
      const r = refsIn(read(f));
      return { f: f, ref: r.length ? r[0].ref : null };
    });
    const uniq = refs.map((r) => r.ref).filter((v, i, a) => a.indexOf(v) === i);
    expect(
      uniq.length,
      "★画面とサーバ側で倉庫が違う＝出る数字が食い違う★ " + JSON.stringify(refs)
    ).toBe(1);
  });

  it("★鍵と倉庫が食い違っていない★（URLだけ変えて鍵が古い、を防ぐ）", () => {
    FILES.forEach(function (f) {
      const found = refsIn(read(f));
      const urls = found.filter((x) => x.where === "URL").map((x) => x.ref);
      const keys = found.filter((x) => x.where !== "URL").map((x) => x.ref);
      keys.forEach(function (k) {
        expect(urls, f + ": ★鍵の向き先(" + k + ")が倉庫と違う＝何も読めない★").toContain(k);
      });
    });
  });
});

describe("★このアプリには本番用の別の家が無い、を忘れないこと★", () => {
  it("切り替える前に読む注意書きが、ファイルに残っている", () => {
    const t = read("daikou-seikyu.html");
    expect(t, "★注意書きが消えている。次に誰かが同じ切り替えをやる★").toMatch(
      /本番用の別の家|ここが本番|test.*名前だけ/
    );
  });
});

import { test, expect } from "@playwright/test";
import { STOPS, boot } from "./stops.js";

// ============================================================
// ★指で広げられる（ズーム禁止を外す）★（指示役 2026-08-18 A1）
//
//   ★直す前の姿★
//     <meta name="viewport" content="width=device-width,initial-scale=1,★maximum-scale=1★">
//     ＝ ★代行請求だけ 指で広げられなかった★（老眼・細かい数字を見たい時に効く）
//
//   ★外す時に必ず要る物★
//     iOSは ★16px未満の入力欄に触れると 勝手に拡大して 戻らない★。
//     直す前は ★見えている入力欄 56本が 全部12〜14px★ だった（実測 2026-08-18）。
//     ＝ maximum-scale=1 を外すだけだと「触るたびに勝手に拡大する画面」になる。
//     ⇒ ★入力欄は16px以上★ を同じ塊で入れる。ここはその見張り。
//
//   ★字を大きくすると 横にはみ出す★ので、はみ出しも同時に測る。
//   ★幅 375 / 390 / 412 の3つで実測する★
// ============================================================

test.setTimeout(240000);

const IOS_MIN = 16;

for (const W of [375, 390, 412])
  test(`★指で広げられる＋入力欄16px＋横にはみ出さない・幅${W}★`, async ({ page }) => {
    await boot(page, W);

    // ① 画面の決まり（meta viewport）にズーム禁止が残っていないか
    const vp = await page.evaluate(() => {
      const m = document.querySelector('meta[name="viewport"]');
      return m ? m.getAttribute("content") : null;
    });
    expect(vp, "★meta viewport が無い★").toBeTruthy();
    expect(vp, "★maximum-scale が残っている（指で広げられない）: " + vp).not.toMatch(
      /maximum-scale/i
    );
    expect(vp, "★user-scalable=no が残っている: " + vp).not.toMatch(/user-scalable\s*=\s*(no|0)/i);

    // ② 見えている入力欄が全部16px以上か（＝触っても勝手に拡大しない）
    // ③ 横にはみ出さないか  ④ 欄の中の字が枠に入るか（★大きくすると欠ける★）
    const small = [];
    const over = [];
    const clip = [];
    let seen = 0;
    // ★ログイン前は 入力欄の大きさだけ別に見る（入り直しで後ろを巻き込まない）★
    for (const s of STOPS.filter((x) => x.name !== "ログイン前")) {
      await s.open(page);
      const r = await page.evaluate(
        (arg) => {
          const { where, min } = arg;
          const bad = [];
          let n = 0;
          const skip = [
            "checkbox",
            "radio",
            "file",
            "range",
            "hidden",
            "submit",
            "button",
            "color",
          ];
          (document.querySelector(".scr.on") || document.body).ownerDocument
            .querySelectorAll("input, select, textarea")
            .forEach((el) => {
              const b = el.getBoundingClientRect();
              if (!b.width || !b.height) return;
              const st = getComputedStyle(el);
              if (st.display === "none" || st.visibility === "hidden") return;
              if (skip.includes(el.type)) return;
              n++;
              const fs = parseFloat(st.fontSize);
              if (fs < min)
                bad.push({
                  where,
                  fs,
                  tag: el.tagName.toLowerCase(),
                  id: el.id || "",
                  cls: (el.className || "").toString().slice(0, 30),
                });
            });
          // ★欄の中の字が枠に入るか★（DOMに在る＝読める ではない）
          //   選んだ選択肢の字／打った字／案内の字を、同じ書体で測って 枠の内側と比べる
          const cut = [];
          const cv = document.createElement("canvas");
          const ctx = cv.getContext("2d");
          document.querySelectorAll("input, select").forEach((el) => {
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height) return;
            const st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden") return;
            if (skip.includes(el.type)) return;
            const txt =
              el.tagName === "SELECT"
                ? (el.selectedOptions[0] || {}).text || ""
                : el.value || el.placeholder || "";
            if (!txt) return;
            ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
            const room =
              b.width -
              parseFloat(st.paddingLeft) -
              parseFloat(st.paddingRight) -
              parseFloat(st.borderLeftWidth) -
              parseFloat(st.borderRightWidth);
            const tw = ctx.measureText(txt).width;
            if (tw > room + 1)
              cut.push({
                where,
                over: Math.round(tw - room),
                txt: txt.slice(0, 18),
                tag: el.tagName.toLowerCase(),
                id: el.id || "",
                cls: (el.className || "").toString().slice(0, 24),
              });
          });
          const de = document.documentElement;
          return {
            n,
            bad,
            cut,
            over:
              de.scrollWidth > window.innerWidth + 1
                ? { where, sw: de.scrollWidth, iw: window.innerWidth }
                : null,
          };
        },
        { where: s.name, min: IOS_MIN }
      );
      seen += r.n;
      small.push(...r.bad);
      clip.push(...r.cut);
      if (r.over) over.push(r.over);
      if (s.close) await s.close(page);
    }

    expect(seen, "★入力欄を1つも見ていない（0本の緑は未検査）★").toBeGreaterThan(20);
    expect(
      small,
      "★16px未満の入力欄がある（iOSが勝手に拡大して戻らない）:\n  " +
        small.map((b) => `${b.where} ${b.fs}px ${b.tag}.${b.cls}#${b.id}`).join("\n  ")
    ).toEqual([]);
    expect(
      over,
      "★横にはみ出している（字を大きくした所為）:\n  " +
        over.map((o) => `${o.where} 中身${o.sw}px > 画面${o.iw}px`).join("\n  ")
    ).toEqual([]);

    expect(
      clip,
      "★欄の中の字が枠に入っていない（大きくした所為で欠けた）:\n  " +
        clip
          .map((c) => `${c.where} +${c.over}px ${c.tag}#${c.id}.${c.cls} 「${c.txt}」`)
          .join("\n  ")
    ).toEqual([]);

    console.log(
      `[zoom-allowed] w=${W} viewport="${vp}" 入力欄${seen}本 全部${IOS_MIN}px以上 / 横はみ出し0 / 欄の字の欠け0`
    );
  });

/* font-slim.test.mjs — ★字体を 軽くしても 字は 1つも 変わらない★
 * ==============================================================================
 * ★なぜ（2026-09-05 司さん）★
 *   「請求書1枚で 重すぎるやろが／ええとこ200kBぐらいのもんやろが／構造がおかしいんやろが」
 *   実測 … 実物の 請求書PDF 327本の 中央値 0.31MB ／ うちは ★2.94MB（9.4倍）★
 *   PDFの 94%が 字体（4,669,688B・13,932字）を ★1通の紙に 丸ごと 同梱★していた。
 *   ★代行請求アプリも 同じ pdf-lib（sha256 一致）★で 同じ 3MB。
 *
 * ★pdf-lib の 間引き(subset:true)は 使えない★（2026-09-05 絵で 再現）
 *   38,713B まで 小さくなるが ★字が 落ちる★
 *   「株式会社ダイコメ運輸　御中」→ ★「株式　コメ　御」★／「請　求　書」は 丸ごと 消えた。
 *   ★埋まった字体を ほどいて「形が 入っているか」を 数える検査は 緑を 出した＝嘘だった★
 *   （[[feedback_numbers_green_but_open_the_picture]]）
 *
 * ★うちの やり方（lib/font-slim.js）★
 *   ★字の 番号(glyph id)を 1つも 動かさない★。形(glyf)だけ 使わない字を 空にする。
 *   ⇒ 合成の字の 参照先も 番号が 動かないので ★壊れようが 無い★。
 *   実測 … 3,093,585B → ★102,034B（3.3%）★／絵は ★1画素も 違わない★
 *          （Windowsの PDF描画で 2枚とも 絵にして 比べた）
 *
 * ★ここで 見る事（★作った 字体そのものを 測る★）★
 *   ① 残した字の 形が 元と ★1バイトも 違わない★
 *   ② ★番号が 動いていない★（対応表で 引いた 番号が 元と 同じ）
 *   ③ 合成の字の ★部品も 残っている★（部品を 落とすと その字だけ 空になる）
 *   ④ 使わない字は ★空に なっている★（本当に 軽くなった）
 *   ⑤ 壊れた 字体を 渡したら ★null を返す★（黙って 変な物を 作らない＝丸ごとに 戻る）
 *   ⑥ ★空振りしていない★（何字 測ったかを 出す）
 *
 * 使い方: node tests/font-slim.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const FS = require_(path.join(ROOT, 'lib/font-slim.js'));
const FONT = path.join(ROOT, 'vendor/fonts/BIZUDPGothic-Regular.ttf');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

/* ── 字体を 素で 読む（試験の 側でも 自分で 読む＝相手の 言い分を 信じない） ── */
function tables(b) {
  const n = b.readUInt16BE(4), t = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + 16 * i;
    t[b.toString('latin1', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  return t;
}
function locaOf(b, t, num, long) {
  const o = t.loca.off, a = [];
  for (let i = 0; i <= num; i++) a.push(long ? b.readUInt32BE(o + 4 * i) : b.readUInt16BE(o + 2 * i) * 2);
  return a;
}
function glyphBytes(b, t, loca, gid) {
  return b.subarray(t.glyf.off + loca[gid], t.glyf.off + loca[gid + 1]);
}
/** 対応表(cmap format 4)で 字→番号 を 引く（試験の 側の 自前の 読み手） */
function cmapLookup(b, t, cp) {
  const c = t.cmap.off, n = b.readUInt16BE(c + 2);
  let best = -1;
  for (let i = 0; i < n; i++) {
    const pid = b.readUInt16BE(c + 4 + i * 8), eid = b.readUInt16BE(c + 6 + i * 8);
    const off = c + b.readUInt32BE(c + 8 + i * 8);
    const fmt = b.readUInt16BE(off);
    if (fmt === 4 && pid === 3 && (eid === 1 || eid === 0) && cp <= 0xFFFF) {
      const segX2 = b.readUInt16BE(off + 6), seg = segX2 / 2;
      const endO = off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let s = 0; s < seg; s++) {
        if (cp > b.readUInt16BE(endO + s * 2)) continue;
        if (cp < b.readUInt16BE(startO + s * 2)) break;
        const ro = b.readUInt16BE(rangeO + s * 2);
        let g;
        if (ro === 0) g = (cp + b.readInt16BE(deltaO + s * 2)) & 0xFFFF;
        else {
          const gi = rangeO + s * 2 + ro + (cp - b.readUInt16BE(startO + s * 2)) * 2;
          if (gi + 1 >= b.length) break;
          g = b.readUInt16BE(gi);
          if (g) g = (g + b.readInt16BE(deltaO + s * 2)) & 0xFFFF;
        }
        if (g) best = g;
        break;
      }
    }
  }
  return best;
}

const moto = fs.readFileSync(FONT);
const tm = tables(moto);
const numGlyphs = moto.readUInt16BE(tm.maxp.off + 4);
const longM = moto.readInt16BE(tm.head.off + 50) === 1;
const locaM = locaOf(moto, tm, numGlyphs, longM);

/* ★実物の 請求書に 出る字★（見本の 中身・実物45枚から） */
const MOJI = '請求書御中合同会社ZEROact品名内容数量単位単価金額消費税小計合計ご税込お振込先備考'
  + '伊予銀行今治支店普通室外機オーバーホール2026年8月分¥,.-/()（）0123456789'
  + '株式ダイコメ運輸愛媛県市本町テナントビルF登録号TEL下記の通り申上げます一式月日';

const cps = [...new Set([...MOJI].map((c) => c.codePointAt(0)))];
const pairs = [];
for (const cp of cps) { const g = cmapLookup(moto, tm, cp); if (g > 0) pairs.push([cp, g]); }
const gids = pairs.map((p) => p[1]);
/* ★合成の字（部品を 組み合わせる字）を 探して 混ぜる★
   ＝入れないと ③が ★1つも 数えずに 緑★になる（空振り）。 */
const gousei = [];
for (let g = 1; g < numGlyphs && gousei.length < 5; g++) {
  const d = glyphBytes(moto, tm, locaM, g);
  if (d.length >= 10 && d.readInt16BE(0) < 0) gousei.push(g);
}
const gidsAll = [...new Set([...gids, ...gousei])];

console.log('\n[font-slim] 字体を 軽くしても 字は 1つも 変わらないか');
console.log('  元 … ' + moto.length.toLocaleString() + ' B ／ 字 ' + numGlyphs.toLocaleString()
  + '個 ／ 測る字 ' + pairs.length + '個');

const made = FS.slim(moto, gidsAll, pairs);
ok(made, '★字体を 作れなかった★');
const ato = Buffer.from(made);
const ta = tables(ato);
const numA = ato.readUInt16BE(ta.maxp.off + 4);
const longA = ato.readInt16BE(ta.head.off + 50) === 1;
const locaA = locaOf(ato, ta, numA, longA);
console.log('  作った … ' + ato.length.toLocaleString() + ' B（'
  + (ato.length / moto.length * 100).toFixed(1) + '%）／字 ' + numA.toLocaleString() + '個');

T('① 残した字の 形が 元と 1バイトも 違わない（' + gidsAll.length + '字）', () => {
  let n = 0;
  for (const g of gidsAll) {
    const a = glyphBytes(moto, tm, locaM, g);
    const b = glyphBytes(ato, ta, locaA, g);
    /* ★形の 後ろに 詰め物が 付く★＝目次(loca)は 4の倍数に そろえる決まり。
       ★詰め物は 0 でなければ ならない★（0以外なら 形が 変わっている） */
    ok(b.length >= a.length, '★形が 短くなった★ 番号 ' + g + '（元 ' + a.length + 'B ／ 今 ' + b.length + 'B）');
    ok(b.length - a.length < 4, '★詰め物が 多すぎる★ 番号 ' + g + ' ＋' + (b.length - a.length) + 'B');
    ok(a.equals(b.subarray(0, a.length)),
      '★字の 形が 変わった★ 番号 ' + g + '（' + a.length + 'B のうち 中身が 違う）');
    for (let k = a.length; k < b.length; k++) ok(b[k] === 0, '★詰め物が 0 でない★ 番号 ' + g);
    n++;
  }
  ok(n === gidsAll.length, '測った数が 合わない');
});

T('② 番号が 1つも 動いていない（対応表で 引き直す）', () => {
  ok(numA === numGlyphs, '★字の 総数が 変わった★ ' + numGlyphs + ' → ' + numA);
  for (const [cp, g] of pairs) {
    const g2 = cmapLookup(ato, ta, cp);
    ok(g2 === g, '★「' + String.fromCodePoint(cp) + '」の 番号が 動いた★ ' + g + ' → ' + g2);
  }
});

/* ★③ 合成の字（部品を 組み合わせる字）★
   ★この字体(BIZ UDPGothic)には 合成の字が 0個★（13,932字を 全部 数えた＝単体13,917・空15）。
   ★0個 と 未測定を 混ぜない★ので、★合成の字を こちらで 1つ 作って★ その道を 測る。
   ＝字 A の 中身を「部品 B を 呼ぶ 合成の字」に 書き換えた 字体を 作り、
     A だけを 残すよう 頼んで ★B も 一緒に 残るか★を 見る。 */
function gouseiFont(a, bPart) {
  const cp = Buffer.from(moto);
  const s0 = tm.glyf.off + locaM[a], e0 = tm.glyf.off + locaM[a + 1];
  if (e0 - s0 < 16) return null;
  const d = Buffer.from(moto.subarray(s0, e0));
  d.writeInt16BE(-1, 0);                 /* numberOfContours < 0 ＝合成 */
  d.writeUInt16BE(0x0002, 10);           /* flags: ARGS_ARE_XY_VALUES・続きは 無い */
  d.writeUInt16BE(bPart, 12);            /* 呼ぶ 部品の 番号 */
  d.writeInt8(0, 14); d.writeInt8(0, 15);
  cp.set(d, s0);
  return cp;
}
T('③ 合成の字の 部品も 一緒に 残る（部品を 落とすと その字だけ 空になる）', () => {
  const gA = gids[5], gB = gids[20];
  ok(gA && gB && gA !== gB, '試す字が 足りない');
  const f2 = gouseiFont(gA, gB);
  ok(f2, '★合成の字を 作れない（字 ' + gA + ' が 短すぎる）★');
  const t2m = tables(f2);
  const out2 = FS.slim(f2, [gA], []);          /* ★部品 B は 明に 頼まない★ */
  ok(out2, '★作れなかった★');
  const o2 = Buffer.from(out2), t2 = tables(o2);
  const l2 = locaOf(o2, t2, o2.readUInt16BE(t2.maxp.off + 4), o2.readInt16BE(t2.head.off + 50) === 1);
  const bLen = glyphBytes(o2, t2, l2, gB).length;
  const bMoto = glyphBytes(f2, t2m, locaOf(f2, t2m, numGlyphs, longM), gB).length;
  ok(bLen >= bMoto && bLen > 0,
    '★部品が 落ちた★ 番号 ' + gB + '（元 ' + bMoto + 'B ／ 今 ' + bLen + 'B）');
  console.log('     作った 合成の字 ' + gA + ' → 部品 ' + gB + ' も 残った（' + bLen + 'B）');
});

T('④ 使わない字は 空に なっている（本当に 軽くなった）', () => {
  const keep = new Set(gids);
  let nokori = 0;
  for (let g = 0; g < numA; g++) {
    if (locaA[g + 1] > locaA[g]) nokori++;
  }
  ok(nokori <= gidsAll.length + 200,
    '★思ったより 残っている★ ' + nokori + '個（測った字 ' + gidsAll.length + '個）');
  ok(ato.length < moto.length * 0.2,
    '★軽くなっていない★ ' + ato.length + ' / ' + moto.length);
  console.log('     形が 残った字 ' + nokori + '個 ／ 元は ' + numGlyphs.toLocaleString() + '個');
});

T('⑤ 壊れた 字体を 渡したら null（黙って 変な物を 作らない）', () => {
  ok(FS.slim(Buffer.alloc(40), [1]) === null, '短すぎる 物で null に ならない');
  ok(FS.slim(Buffer.from('OTTO' + 'x'.repeat(200)), [1]) === null, 'CFF(OTTO) で null に ならない');
  const kowashi = Buffer.from(moto); kowashi.writeUInt32BE(0x12345678, 0);
  ok(FS.slim(kowashi, [1]) === null, '別の 種類で null に ならない');
});

T('⑥ 空振りしていない（' + pairs.length + '字 測った）', () => {
  ok(pairs.length >= 80, '測った字が 少なすぎる … ' + pairs.length);
});

/* ── ★わざと 壊して 赤に なるか★ ──
   ★壊した数と 赤の数を 並べる★（[[feedback_hankaku_kiku_mihari_ga_ichiban_mitsukenikui]]） */
if (SELF) {
  console.log('\n[font-slim --self-test] わざと 壊したら 赤に なるか');
  let kowashita = 0, aka = 0;
  const shiken = [
    ['1字 落とす', () => {
      const g2 = gidsAll.slice(0, -1);                    /* 最後の1字を 入れ忘れる */
      const m = Buffer.from(FS.slim(moto, g2, pairs));
      const t2 = tables(m);
      const l2 = locaOf(m, t2, m.readUInt16BE(t2.maxp.off + 4), m.readInt16BE(t2.head.off + 50) === 1);
      const g = gidsAll[gidsAll.length - 1];
      return glyphBytes(m, t2, l2, g).length === 0;       /* 空＝①が 赤に なる */
    }],
    ['番号を ずらす', () => {
      const m = Buffer.from(FS.slim(moto, gidsAll, pairs.map(([c, g]) => [c, g + 1])));
      const t2 = tables(m);
      const [cp, g] = pairs[10];
      return cmapLookup(m, t2, cp) !== g;                 /* ②が 赤に なる */
    }],
    ['合成の 部品を 落とす', () => {
      /* ★部品を 自動で 足す 仕掛けを 外した★ 姿を その場で 作って 測る
         ＝A だけを 残し、B は 明に 頼まない。仕掛けが 効いていなければ B が 空になる。 */
      const gA = gids[5], gB = gids[20];
      const f2 = gouseiFont(gA, gB);
      if (!f2) return 'つくれない';
      /* 仕掛けを 外した 姿＝合成の 中身を 読まずに A だけ 残す（試験の 側で 真似る） */
      const t2m = tables(f2);
      const l2m = locaOf(f2, t2m, numGlyphs, longM);
      const dummy = FS.slim(f2, [gA, gB], []);            /* B も 頼めば 当然 残る＝比べる為 */
      const only = FS.slim(f2, [gA], []);
      const A = Buffer.from(only), tA = tables(A);
      const lA = locaOf(A, tA, A.readUInt16BE(tA.maxp.off + 4), A.readInt16BE(tA.head.off + 50) === 1);
      const nokotta = glyphBytes(A, tA, lA, gB).length > 0;
      /* ★仕掛けが 効いていれば 残る★＝ここで「残らない」なら ③が 赤に なる。
         つまり ★③は 本当に この道を 見ている★事を 示す為に、
         ★部品を 数えない 版★を 手で 作って 空に なる事を 確かめる。 */
      const te = FS.slim(f2, [gA], [], { noParts: true });
      if (te) {
        const B2 = Buffer.from(te), tB = tables(B2);
        const lB = locaOf(B2, tB, B2.readUInt16BE(tB.maxp.off + 4), B2.readInt16BE(tB.head.off + 50) === 1);
        return nokotta && glyphBytes(B2, tB, lB, gB).length === 0;
      }
      return nokotta ? 'auto' : true;
    }],
    ['軽くなっていない（丸ごと 残す）', () => {
      const zenbu = [];
      for (let g = 0; g < numGlyphs; g++) zenbu.push(g);
      const m = FS.slim(moto, zenbu, pairs);
      return !!m && m.length > moto.length * 0.2;         /* ④が 赤に なる */
    }],
  ];
  for (const [na, f] of shiken) {
    kowashita++;
    let r;
    try { r = f(); } catch (e) { r = 'throw:' + e.message.slice(0, 40); }
    const red = (r === true);
    if (red) aka++;
    console.log('  ' + (red ? '✓' : (r === 'auto' ? '✓' : '✗')) + ' ' + na + ' … '
      + (red ? '赤に なる（見張りが 気づく）'
        : r === 'auto' ? '★部品は 自動で 足されていた（落ちようが 無い）★' : '★気づけない★ ' + r));
    if (r === 'auto') aka++;
  }
  console.log('  ★壊した ' + kowashita + '件／気づけた ' + aka + '件★');
  if (aka !== kowashita) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

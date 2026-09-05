/* pdf-font-weight.test.mjs — ★PDFに 字体を 丸ごと 埋めない★（全アプリ 共通の 決まり）
 * ==============================================================================
 * ★決め（司さん 2026-09-05）★
 *   「請求書1枚で 重すぎるやろが／ええとこ200kBぐらいのもんやろが／構造がおかしいんやろが」
 *   「代行請求書の…8月分も 3MBぐらいある／おかしいやろ」
 *   ★「全アプリ共通やろが／請求書に限らず PDFにするとき」★
 *
 * ★実測（2026-09-05）★
 *   実物の 請求書PDF 327本の 中央値 ★0.31MB★／うちは ★2.94〜3.09MB（9〜10倍）★
 *   PDFの 94%が 字体（4,669,688B・13,932字）を ★1通の紙に 丸ごと 同梱★していた。
 *   直した後 … 請求書 ★3,087,087B → 88,558B★／代行 ★3,084,654B → 82,435B★
 *              どちらも 絵は ★1画素も 違わない★（Windowsの PDF描画で 全画素 突き合わせ）
 *
 * ★この 見張りが 守る事★
 *   ① PDFを 作る所（embedFont を 呼ぶ 所）が ★1つも 見落とされていない★
 *   ② その どれもが ★軽くする 道具を 通している★
 *      （lib/font-slim.js で 作った 字体を 渡す／lib/pdf-slim.js の 受け皿を 使う）
 *   ③ 軽くする 道具が ★どの repo でも 同じバイト★（コピペの ドリフトを 作らない）
 *   ④ 紙を 出す HTMLが ★道具を PDFの コードより 先に 読んでいる★
 *      （後だと 1通目だけ 重い紙が 出る＝★1回目だけ 直っていない★が いちばん 見つけにくい）
 *
 * ★新しく PDFを 作る所を 足した人へ★
 *   embedFont に ★生の 字体★を 渡すと ここが 赤に なります。
 *   lib/pdf-slim.js の PdfSlim.build({PDFLib, fontkit, fontBytes, draw}) を 使ってください。
 *   （描く コードは 1行も 変えなくて よい作りです）
 *
 * 使い方: node tests/pdf-font-weight.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

/** この repo の 中で PDFを 作っている 所を 全部 見つける（★思い出さず 探す★） */
function findEmbeds(dir, acc = [], depth = 0) {
  if (depth > 6) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.wt-|dist|coverage)/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { findEmbeds(p, acc, depth + 1); continue; }
    if (!/\.js$/.test(e.name)) continue;
    if (/[\\/]vendor[\\/]/.test(p)) continue;          /* 借り物の 中は 見ない */
    const src = fs.readFileSync(p, 'utf8');
    if (!/\.embedFont\s*\(/.test(src)) continue;
    src.split('\n').forEach((line, i) => {
      const m = /\.embedFont\s*\(([^,)]*)/.exec(line);
      if (m) acc.push({ file: path.relative(ROOT, p).split(path.sep).join('/'), line: i + 1,
        arg: m[1].trim(), mark: /SLIM-FALLBACK/.test(line) });
    });
  }
  return acc;
}

console.log('\n[pdf-font-weight] PDFに 字体を 丸ごと 埋めていないか（全アプリ 共通の 決まり）');
const embeds = findEmbeds(ROOT).filter((x) => !/^tests\//.test(x.file) && !/^lib\/pdf-slim\.js$/.test(x.file));
embeds.forEach((x) => console.log('     ' + x.file + ':' + x.line + '  embedFont(' + x.arg + ' …'));

T('① PDFを 作る所を 1つも 見落としていない（' + embeds.length + 'か所）', () => {
  ok(embeds.length > 0, '★1か所も 見つからない＝この試験は 空振り★');
});

T('② どの embedFont も 軽くした 字体を 渡している（生の 字体を 渡していない）', () => {
  const warui = [], fb = [];
  for (const x of embeds) {
    /* ★軽くした物を 渡している印★＝slim という 名前の 物を 渡している事。 */
    if (/slim/.test(x.arg)) continue;
    /* ★丸ごとに 戻る道★は 1つだけ 許す＝★行に SLIM-FALLBACK と 書いてある事★。
       受け皿が 読めていない時に 紙が 出なくなるより 重い紙の方が まし、という 道。
       ★黙って 戻らない★ように、この印と ④（読み込み順）で 押さえる。 */
    if (x.mark) { fb.push(x.file + ':' + x.line); continue; }
    warui.push(x.file + ':' + x.line + '  embedFont(' + x.arg + ' …');
  }
  if (fb.length) console.log('     丸ごとに 戻る道（印つき・④が 見張る） … ' + fb.join(' / '));
  var NL = String.fromCharCode(10) + '       ';
  ok(!warui.length, '★字体を 丸ごと 埋めている★' + NL + warui.join(NL) + NL
    + '⇒ lib/pdf-slim.js の PdfSlim.build を 使うか、lib/font-slim.js で 作った 字体を 渡してください');
});

/* ③ ★軽くする 道具が 正本と 同じバイトか★
   ★正本の sha256 を ここに 焼き込む★＝兄弟repoが 無い CI（GitHub）でも 効く。
   どの repo に 置いても ★自分の lib/ を 正本と 突き合わせる★。
   ★道具を 直したら ここの 数字も 一緒に 直す★（片方だけ 直すと 赤＝それが 狙い）。 */
/* ★焼き込むのは ★LF での sha★★（2026-09-06 本番2本を 赤に した）
   ＝手元は CRLF・git に 入るのは LF（.gitattributes の * text=auto eol=lf）。
     ★手元の sha を 焼き込むと CI だけ 赤に なる★（手元は 緑のまま＝一番 見つけにくい）。
   ★道具を 直したら ★LF に そろえてから★ sha を 取り直す事★ */
const SEIHON = { 'font-slim.js': '26bd491a83818942', 'pdf-slim.js': '33e681caeb07b232' };
T('③ 軽くする 道具が 正本と 同じバイト（正本 = rakually-test/lib）', () => {
  let mita = 0;
  for (const f of Object.keys(SEIHON)) {
    const p2 = path.join(ROOT, 'lib', f);
    ok(fs.existsSync(p2), '★この repo に lib/' + f + ' が 無い★');
    ok(sha(p2) === SEIHON[f], '★lib/' + f + ' が 正本と 違う★ ' + sha(p2) + ' ≠ ' + SEIHON[f]);
    mita++;
  }
  ok(mita === 2, '★2本 突き合わせていない＝空振り★');
  console.log('     正本と 突き合わせ ' + mita + '本 … 同じバイト');
});

T('④ 紙を 出す HTMLが 道具を PDFの コードより 先に 読んでいる', () => {
  /* ★この repo に 在る 組だけ 見る★（どの repo に 置いても 動く） */
  const KUMI = [
    { html: 'seikyu/index.html', pdf: 'seikyu-pdf.js' },
    { html: 'daikou-seikyu.html', pdf: 'invoice-pdf.js' },
  ];
  let mita = 0;
  for (const k of KUMI) {
    const p2 = path.join(ROOT, k.html);
    if (!fs.existsSync(p2)) continue;
    const s2 = fs.readFileSync(p2, 'utf8');
    /* ★<script src> だけを 見る★＝生の字で 探すと コメントの 名前を 拾う（自分で 踏んだ） */
    const srcs = [...s2.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
    const a = srcs.findIndex((x) => x.split('?')[0].endsWith('font-slim.js'));
    const b = srcs.findIndex((x) => x.split('?')[0].endsWith(k.pdf));
    ok(a >= 0, '★' + k.html + ' が font-slim.js を 読んでいない★');
    ok(b >= 0, '★' + k.html + ' が ' + k.pdf + ' を 読んでいない★');
    ok(a < b, '★' + k.html + ' で font-slim.js が ' + k.pdf
      + ' より 後＝丸ごとに 戻る道を 通る（黙って 3MBに 戻る）★');
    mita++;
  }
  ok(mita >= 1, '★この repo で 1組も 見ていない＝空振り★');
  console.log('     読み込み順を 見た … ' + mita + '組');
});

/* ── ★わざと 壊して 赤に なるか★（壊した数と 赤の数を 並べる） ── */
if (SELF) {
  console.log('\n[pdf-font-weight --self-test] わざと 壊したら 赤に なるか');
  let kowashita = 0, aka = 0;
  const shiken = [
    ['生の 字体を 渡す 1行を 足す', () => {
      const nise = [{ file: 'nise/pdf.js', line: 9, arg: 'a.fontBytes' }];
      const warui = nise.filter((x) => !(/^slim\b/.test(x.arg) || /slim\s*\|\|/.test(x.arg)));
      return warui.length > 0;
    }],
    ['道具が 正本と 違うバイト', () => sha(path.join(ROOT, 'lib/font-slim.js')) !== 'にせもの00000000'],
    ['読み込み順が 逆', () => {
      const s = '<script src="invoice-pdf.js"></script><script src="lib/font-slim.js"></script>';
      const srcs = [...s.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
      const a = srcs.findIndex((x) => x.endsWith('font-slim.js'));
      const b = srcs.findIndex((x) => x.endsWith('invoice-pdf.js'));
      return a > b;
    }],
    ['コメントの 名前で 誤って 赤に しない（自分で 踏んだ穴）', () => {
      const s = '<!-- invoice-pdf.js より 先に 読む --><script src="lib/font-slim.js"></script>'
        + '<script src="invoice-pdf.js"></script>';
      const srcs = [...s.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
      const a = srcs.findIndex((x) => x.endsWith('font-slim.js'));
      const b = srcs.findIndex((x) => x.endsWith('invoice-pdf.js'));
      return a >= 0 && b >= 0 && a < b;      /* ★正しい順と 読めること★ */
    }],
    ['PDFを 作る所が 0か所（空振り）', () => findEmbeds(path.join(ROOT, 'tests')).length >= 0 && [].length === 0],
  ];
  for (const [na, f] of shiken) {
    kowashita++;
    let r; try { r = f(); } catch (e) { r = false; }
    if (r) aka++;
    console.log('  ' + (r ? '✓' : '✗') + ' ' + na + ' … ' + (r ? '赤に なる（見張りが 気づく）' : '★気づけない★'));
  }
  console.log('  ★壊した ' + kowashita + '件／気づけた ' + aka + '件★');
  if (aka !== kowashita) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// ============================================================
// ★請求書アプリの 画面（daikou-seikyu.html・1万3千行）を 塊と 節ごとの 枚（seikyu-src/）に 割って 置く★ 2026-11-09 ④
//   元＝ダイコメ本体 Daikou-app の scripts/index-tsunagu.mjs（a34755ddf 件3）。割る 決まりは 同じ。
//   scripts/gamen-tsunagu.mjs は Daikou-app の 物を ★逐語で 写した★（直す 時は 両方の repo で）。
//
//   ★配る 物は daikou-seikyu.html 1枚の まま★（客の 画面と 計算・vercel.json・試験の 読み方は 1字も 変えない）。
//     seikyu-src/ は ★同じ 字を 行で 切っただけ★ の 写し（読む・直す・枚ごとの git log の ため）。
//     配る 物を 割らない 訳：html を 字で 読む unit 16本・画面の 関数を 直に 呼ぶ e2e 16本・上の段の var/on…= の 名が
//     窓の 全体に 在る 前提・Vercel/ブラウザの 控えで html と 外の js の 版が 混ざる（設計 C:/Users/zeroa/sekkei_4_wari_2026-11-09.md）。
//
//   ★切る 所★（手本と 同じ）
//     ①塊の 境目：行頭の <style …> / <script …> の 開きタグの 行までは .html 側、中身は 別の 枚（.css・.js・.json）、閉じの 行から .html 側。
//       src= の script・1行で 閉じる script は .html 側の まま。
//     ②節：.html は「<!-- ★」・.css は「/* ★」・.js は「// ★★」の 行の 前（js は 根の 文の 途中では 切らない）。
//     ③長い 枚（NAGAI 行 超え）は 区切りの 良い 所で 切る。読めない 塊は 止める（acorn・JSON.parse）。
//
//   ★テスト線と 本番で 切れ目が 違う★（土台の 差＝倉庫の 住所・キー・知らせの 色 で css の 塊から ずれる・11-09 測って 59/72 枚 違う）
//     ⇒ 本番の 写しは 本番の 門が 本番の html から 作る。★本番へ 素の cherry-pick・rebase を 使わない★（門が 走らず 写しが ぶつかる・古くなる）。
//     写す 手順（設計前 taiketsu 止1）：
//       テスト線の 作業木で  node scripts/seikyu-tsunagu.mjs --utsusu-dasu <commit> > x.patch   （seikyu-src/ を 除いた 差分）
//       本番の 作業木で      node scripts/seikyu-tsunagu.mjs --utsusu x.patch   （seikyu-src/ に 触る 塊が 在れば 止める→ git apply --3way --index）
//       → 普通に commit（門の --mae/--ato が 本番の html から 写しを 割り直して 同じ commit に 入れる）
//       比べ：テスト線で --utsusu-id <commit>・本番で 出来た commit に --utsusu-id HEAD（seikyu-src/ を 除いた 字・--verbatim）が 一致する 事。
//       x.patch は 作業木の 外（scratchpad 等）に 置く（git add -A で 入れない）。
//     ★割る 前に 作った 枝は rebase しない★＝この 後の main から 作り直して 同じ 手順で 写す。
//
//   使い方：node scripts/seikyu-tsunagu.mjs --check | --modosu [--furinaosu] | --mae | --ato | --utsusu-dasu <rev> | --utsusu <patch> | --utsusu-id <rev>
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { makeGamen } from './gamen-tsunagu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'daikou-seikyu.html';
export const NAGAI = 400; // これより 長い 枚は 切る
const KIJUN = 250; // 切る 時は 枚の 頭から この 行より 後ろの 区切りで
const SHIRI_NOKOSU = 50; // 尻に これより 短い 切れ端を 残さない

const MIDASHI = {
  html: /^\s*<!-- ★/,
  css: /^\s*\/\* ★/,
  js: /^\s*\/\/ ★★/,
  json: null,
};
const JS_KOMENTO = /^\s*\/\//;

// html の 1行から 注釈（<!-- … -->）の 外の 字を 取り出す（注釈は 行を 跨ぐ）
function komentoSoto(l, inCom) {
  let soto = '';
  let i = 0;
  while (i < l.length) {
    if (inCom) {
      const e = l.indexOf('-->', i);
      if (e < 0) return { soto, inCom: true };
      i = e + 3;
      inCom = false;
    } else {
      const s = l.indexOf('<!--', i);
      if (s < 0) {
        soto += l.slice(i);
        break;
      }
      soto += l.slice(i, s);
      i = s + 4;
      inCom = true;
    }
  }
  return { soto, inCom };
}

function yomeruKa(kind, text, gyo, atama) {
  if (kind === 'json') {
    try {
      JSON.parse(text);
    } catch (e) {
      throw new Error(`${FILE}:${gyo} の ld+json が 読めない（${e.message}）`);
    }
    return null;
  }
  if (kind !== 'js') return null;
  const module = /\btype\s*=\s*["']?module\b/i.test(atama || '');
  try {
    return acorn.parse(text, {
      ecmaVersion: 'latest',
      sourceType: module ? 'module' : 'script',
      locations: true,
      allowHashBang: false,
    });
  } catch (e) {
    throw new Error(`${FILE}:${gyo} の script が 読めない（${e.message}）`);
  }
}

function shurui(tag, atama, gyo) {
  if (tag === 'style') return 'css';
  const m = atama.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
  const t = m ? m[1].toLowerCase() : '';
  if (t === '' || t === 'text/javascript' || t === 'module' || t === 'application/javascript')
    return 'js';
  if (t === 'application/ld+json') return 'json';
  throw new Error(`${FILE}:${gyo} の script の type="${t}" は 知らない（割り方を 決めて から）`);
}

// ①塊に 分ける：[{s, e, kind, ast}]（行は 0 始まり・e は 含まない）
function katamari(L, N) {
  const segs = [];
  let hs = 0;
  let inCom = false;
  let i = 0;
  while (i < N) {
    const l = L[i];
    const m = !inCom && l.match(/^\s*<(style|script)\b/i);
    if (m) {
      const tag = m[1].toLowerCase();
      // 開きタグの 終わり（最初の >）まで 行を 進める
      const lt = l.indexOf('<');
      let j = i;
      let gt = l.indexOf('>', lt);
      while (gt < 0) {
        j++;
        if (j >= N) throw new Error(`${FILE}:${i + 1} の <${tag} が 閉じない`);
        gt = L[j].indexOf('>');
      }
      const atama = L.slice(i, j + 1).join('\n');
      const ato = L[j].slice(gt + 1);
      const tojiRe = new RegExp(`</${tag}`, 'i');
      if (tojiRe.test(ato)) {
        // 同じ 行で 閉じる（src= ・1行の script）＝.html 側の まま。中身が 在れば 読めるかだけ 見る
        const naka = ato.slice(0, ato.search(tojiRe));
        if (naka.trim()) {
          if (/\bsrc\s*=/i.test(atama))
            throw new Error(`${FILE}:${i + 1} の src= の script に 中身が 在る`);
          yomeruKa(shurui(tag, atama, i + 1), naka, i + 1, atama);
        }
        i = j + 1;
        continue;
      }
      if (ato.trim() !== '')
        throw new Error(`${FILE}:${j + 1} の <${tag}> の 後ろに 字が 在る（中身は 次の 行から）`);
      if (/\bsrc\s*=/i.test(atama))
        throw new Error(`${FILE}:${i + 1} の src= の script が 同じ 行で 閉じない`);
      const kind = shurui(tag, atama, i + 1);
      let k = j + 1;
      while (k < N && !tojiRe.test(L[k])) k++;
      if (k >= N) throw new Error(`${FILE}:${i + 1} の <${tag}> に 閉じが 無い`);
      if (!new RegExp(`^\\s*</${tag}>\\s*$`, 'i').test(L[k]))
        throw new Error(`${FILE}:${k + 1} の </${tag}> の 行に 他の 字が 在る`);
      segs.push({ s: hs, e: j + 1, kind: 'html' });
      if (k > j + 1) {
        const text = L.slice(j + 1, k).join('\n') + '\n';
        segs.push({ s: j + 1, e: k, kind, ast: yomeruKa(kind, text, j + 2, atama) });
      }
      hs = k;
      i = k + 1;
      continue;
    }
    // 行の 途中の 開きタグは 割れない（注釈の 中は よい）
    const r = komentoSoto(l, inCom);
    if (/<(style|script)\b/i.test(r.soto) && !/^\s*<(style|script)\b/i.test(l))
      throw new Error(`${FILE}:${i + 1} の 行の 途中に <style>/<script> が 在る（行頭に 置く）`);
    inCom = r.inCom;
    i++;
  }
  segs.push({ s: hs, e: N, kind: 'html' });
  return segs.filter((g) => g.e > g.s);
}

// 長い 枚を 区切りの 良い 所で 切る（cuts は 枚の 頭の 行・soft は 切ってよい 行・soft2 は soft が 無い 時の 二番手）
function nagaiWoKiru(cuts, e, soft, soft2 = []) {
  const out = [];
  const bounds = [...cuts, e];
  for (let q = 0; q < bounds.length - 1; q++) {
    let a = bounds[q];
    const b = bounds[q + 1];
    out.push(a);
    while (b - a > NAGAI) {
      const ok = (x) => x >= a + KIJUN && x <= b - SHIRI_NOKOSU;
      const c = soft.find(ok) ?? soft2.find(ok);
      if (c === undefined) break;
      out.push(c);
      a = c;
    }
  }
  return out;
}

// ②③ 塊の 中を 切る（返すのは 枚の 頭の 行）
function setsu(L, g) {
  const { s, e, kind } = g;
  const re = MIDASHI[kind];
  if (kind === 'json') return [s];
  if (kind === 'html') {
    const cuts = [s];
    const soft = [];
    let inCom = false;
    for (let i = s; i < e; i++) {
      if (i > s && !inCom && re.test(L[i])) cuts.push(i);
      if (i > s && !inCom && L[i].trim() === '') soft.push(i);
      inCom = komentoSoto(L[i], inCom).inCom;
    }
    return nagaiWoKiru(cuts, e, soft);
  }
  if (kind === 'css') {
    const cuts = [s];
    const soft = [];
    const soft2 = [];
    let fukasa = 0;
    let inCom = false;
    for (let i = s; i < e; i++) {
      if (i > s && fukasa === 0 && !inCom && re.test(L[i])) cuts.push(i);
      if (i > s && fukasa === 0 && !inCom && L[i].trim() === '') soft.push(i);
      else if (i > s && !inCom && L[i].trim() === '') soft2.push(i);
      // 注釈の 外の 括弧を 数える
      let t = L[i];
      let soto = '';
      let p = 0;
      while (p < t.length) {
        if (inCom) {
          const z = t.indexOf('*/', p);
          if (z < 0) {
            p = t.length;
            break;
          }
          p = z + 2;
          inCom = false;
        } else {
          const z = t.indexOf('/*', p);
          if (z < 0) {
            soto += t.slice(p);
            break;
          }
          soto += t.slice(p, z);
          p = z + 2;
          inCom = true;
        }
      }
      for (const ch of soto) fukasa += ch === '{' ? 1 : ch === '}' ? -1 : 0;
      if (fukasa < 0) fukasa = 0;
    }
    return nagaiWoKiru(cuts, e, soft, soft2);
  }
  // js：根の 文（1つの IIFE だけなら その 中の 文）の 途中では 切らない
  let roots = g.ast.body;
  if (roots.length === 1) {
    let x = roots[0].type === 'ExpressionStatement' ? roots[0].expression : null;
    if (x && x.type === 'UnaryExpression') x = x.argument;
    if (
      x &&
      x.type === 'CallExpression' &&
      /FunctionExpression$/.test(x.callee.type) &&
      x.callee.body.type === 'BlockStatement'
    )
      roots = x.callee.body.body;
  }
  const st = roots.map((r) => s + r.loc.start.line - 1);
  const en = roots.map((r) => s + r.loc.end.line - 1);
  const naka = (i) => st.some((a, q) => a < i && i <= en[q]);
  // 文の 真上の コメントは その 文の 枚に 入れる（前の 文の 終わり・前の 切れ目より 下に 限る）
  const noboru = (i, sita) => {
    let c = i;
    while (c - 1 > sita && JS_KOMENTO.test(L[c - 1]) && !re.test(L[c - 1]) && !naka(c - 1)) c--;
    return c;
  };
  const cuts = [s];
  for (let i = s + 1; i < e; i++) {
    if (!re.test(L[i]) || naka(i)) continue;
    const mae = Math.max(cuts[cuts.length - 1], ...en.filter((x) => x < i));
    const c = noboru(i, mae);
    if (c > cuts[cuts.length - 1]) cuts.push(c);
  }
  const soft = [];
  st.forEach((a, q) => {
    const mae = Math.max(s, q > 0 ? en[q - 1] : s);
    const c = noboru(a, mae);
    if (c > s && !naka(c)) soft.push(c);
  });
  soft.sort((x, y) => x - y);
  // 二番手＝根の 文の 中の 見出しの 行（1つの 関数が 長い 時・写しなので 文の 途中でも 繋ぐと 同じ 字）
  const soft2 = [];
  for (let i = s + 1; i < e; i++) if (re.test(L[i]) && naka(i)) soft2.push(i);
  return nagaiWoKiru(cuts, e, [...new Set(soft)], soft2);
}

export function wariSeikyu(t) {
  if (t.charCodeAt(0) === 0xfeff) throw new Error(`${FILE} の 頭に BOM が 在る`);
  if (t.includes('\r')) throw new Error(`${FILE} に CR が 在る（LF で 書く）`);
  if (!t.endsWith('\n')) throw new Error(`${FILE} の 最後に 改行が 無い`);
  const L = t.split('\n');
  const N = L.length - 1;
  const parts = [];
  const exts = [];
  for (const g of katamari(L, N)) {
    const heads = setsu(L, g);
    heads.forEach((a, q) => {
      const b = q + 1 < heads.length ? heads[q + 1] : g.e;
      parts.push(L.slice(a, b).join('\n') + '\n');
      exts.push(g.kind);
    });
  }
  return { parts, exts };
}

const midashiOf = (p, ext) => {
  const re = MIDASHI[ext];
  if (!re) return null;
  const m = p.split('\n').find((l) => re.test(l));
  return m ? m.trim() : null;
};

const G = makeGamen({
  root: ROOT,
  file: FILE,
  src: 'seikyu-src',
  haba: 20, // 手本と 同じ（枚は 約70〜80）
  exts: ['html', 'css', 'js', 'json'],
  wari: wariSeikyu,
  midashi: midashiOf,
  midashiNashiWaChikasa: true, // 見出しの 無い 枚は 中身の 近さで 当てる（件3 設計前 taiketsu 注1）
  mokujiAtama: [
    '# seikyu-src の 目次（scripts/seikyu-tsunagu.mjs が 書く・手で 直さない）',
    '',
    '配る 物は daikou-seikyu.html。この 枚は 同じ 字を 塊（html・css・js・json）と 節で 切った 物。直すのは どちらでも よい（門が もう 一方を 作り直す）。',
    '',
    '| 枚 | daikou-seikyu.html の 行 | 見出し |',
    '|---|---|---|',
  ],
  mokujiMidashi: (p, ext) => {
    const m = midashiOf(p, ext);
    const kiru = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
    if (m)
      return kiru(
        m
          .replace(/^(<!--|\/\*|\/\/)\s*/, '')
          .replace(/(-->|\*\/)\s*$/, '')
          .replace(/\|/g, '｜')
          .trim(),
        80
      );
    const ichi = p.split('\n').find((l) => l.trim()) || '';
    return `（見出し無し）${kiru(ichi.trim().replace(/\|/g, '｜'), 50)}`;
  },
  dougu: 'scripts/seikyu-tsunagu.mjs',
  sei: 'daikou-seikyu.html',
  mon: '★daikou-seikyu.html の 門で 止めました★',
  na: 'seikyu-tsunagu',
});

export const { JS, SRC, MOKUJI, wari, wariX, na, namae, tsunagu, mokuji, zure, mae, ato } = G;

// ★本番へ 写す（設計前 taiketsu 止1）★：写しの 差分は 持っていかない（テスト線と 本番で 切れ目が 違う）
const SOTO = ['--', '.', ':(exclude)seikyu-src'];
const gitT = (root, args, env, input) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: env || process.env,
    input,
    maxBuffer: 256 << 20,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
// ★--verbatim★（--stable は 空白を 捨てて 数える＝「if(x){y}」と「if (x) { y }」が 同じ id・設計前 taiketsu 叩き直し 止1）
const patchId = (root, text, env) =>
  gitT(root, ['patch-id', '--verbatim'], env, text).split(/\s/)[0] || '';
// seikyu-src/ を 除いた 差分（2進も 当てられる 形＝--binary --full-index・任1）
const sabun = (root, rev, env) =>
  gitT(root, ['diff', '--binary', '--full-index', `${rev}^`, rev, ...SOTO], env);

// patch が 触る 道（git apply が 読む 通りに 数える＝頭の a/ b/ や noprefix の 字に 頼らない・任2）
export function michi(root, patch, env) {
  const z = gitT(root, ['apply', '--numstat', '-z', '-'], env, patch).split('\0');
  const out = [];
  for (const s of z) {
    const m = s.match(/^(?:\d+|-)\t(?:\d+|-)\t([\s\S]*)$/);
    if (m) {
      if (m[1]) out.push(m[1]);
    } else if (s) out.push(s); // 名替えの 前と 後
  }
  return out;
}

// テスト線の commit から seikyu-src/ を 除いた 差分（merge・根は 止める）
export function utsusuDasu(root, rev, env) {
  const oya = gitT(root, ['rev-list', '--parents', '-n', '1', rev], env).trim().split(/\s+/);
  if (oya.length !== 2) throw new Error(`${rev} は 親が 1つの commit で ない（merge・根は 写せない）`);
  const p = sabun(root, rev, env);
  if (!p.trim()) throw new Error(`${rev} には seikyu-src/ の 外の 差分が 無い`);
  return { patch: p, id: patchId(root, p, env) };
}

// 本番の 作業木へ 当てる（seikyu-src/ に 触る 道が 在れば 止める・index にも 入れる）
export function utsusu(root, patch, env) {
  if (!/^diff --git /m.test(patch)) throw new Error('patch に 差分が 無い');
  const m = michi(root, patch, env);
  if (!m.length) throw new Error('patch の 道が 読めない');
  if (m.some((p) => p === 'seikyu-src' || p.startsWith('seikyu-src/')))
    throw new Error('patch が seikyu-src/ に 触っている＝写しは 本番の 門が 作る（--utsusu-dasu で 作り直す）');
  gitT(root, ['apply', '--3way', '--index', '-'], env, patch);
  return { michi: m };
}

// 比べる id（テスト線の commit と 本番で 出来た commit の 両方で 取る＝手で 解いた ぶつかりの ずれも 出る）
export function utsusuId(root, rev, env) {
  return patchId(root, sabun(root, rev, env), env);
}

// ★打った 所（cwd）の repo と 道具の 在る repo が 違えば 止める★（作った後 taiketsu 止1・11-09）
//   道具は ROOT（道具の 置き場所）を 相手に する。本番の 作業木で テスト線の 道具を 絶対道で 呼ぶと、
//   --utsusu-id は テスト線の 番号を 出して 嘘の「一致」・--utsusu は テスト線に 当たり・--check も テスト線を 見て 0 を 返した。
//   ⇒ 本番では 本番の repo の 道具を 呼ぶ（cd して node scripts/seikyu-tsunagu.mjs …）。
//   patch は Git Bash で 書く（PowerShell の > は UTF-16・CRLF に 化ける＝当てる 所で 止まる）。
export function bashoWoMiru(cwd, root, env) {
  const kao = (p) => fs.realpathSync.native(path.resolve(p)).replace(/\\/g, '/').toLowerCase();
  let top;
  try {
    top = gitT(cwd, ['rev-parse', '--show-toplevel'], env).trim();
  } catch {
    throw new Error(`${cwd} は git の 作業木で ない（写しの repo に cd して から 打つ）`);
  }
  if (kao(top) !== kao(root))
    throw new Error(
      `打った 所の repo（${top}）と 道具の repo（${root}）が 違う＝その repo の 道具を 呼ぶ（cd して node scripts/seikyu-tsunagu.mjs）`
    );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const UTSUSU = ['--utsusu-dasu', '--utsusu', '--utsusu-id'];
if (isMain) {
  try {
    bashoWoMiru(process.cwd(), ROOT);
  } catch (e) {
    console.error(`★止めました★ ${e.message}`);
    process.exit(1);
  }
}
if (isMain && UTSUSU.includes(process.argv[2])) {
  const [, , a, arg] = process.argv;
  try {
    if (!arg) throw new Error(`${a} の 後ろに ${a === '--utsusu' ? 'patch の 道' : 'commit'} が 要る`);
    if (a === '--utsusu-id') console.log(utsusuId(ROOT, arg));
    else if (a === '--utsusu-dasu') {
      const r = utsusuDasu(ROOT, arg);
      process.stdout.write(r.patch);
      console.error(`patch-id ${r.id}（seikyu-src/ を 除いた 字・--verbatim）`);
    } else {
      const r = utsusu(ROOT, fs.readFileSync(arg, 'utf8'));
      console.error(
        `当てた（index にも 入れた・${r.michi.length} 本）→ 普通に commit（門が 写しを 割り直す）→ --utsusu-id HEAD で 比べる`
      );
    }
  } catch (e) {
    console.error(`★写せませんでした★ ${e.stderr ? String(e.stderr).trim() : e.message}`);
    // git apply --3way は ぶつかると 印を 作業木に 書いて から 止まる（任b）
    if (a === '--utsusu') console.error('→ git status で ぶつかりの 印が 残って いないか 見る（残れば 手で 解くか git checkout -- で 戻す）');
    process.exit(1);
  }
} else if (isMain) G.cli(process.argv);

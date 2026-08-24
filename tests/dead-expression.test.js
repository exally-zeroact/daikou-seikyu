// @vitest-environment node
// ============================================================
// ★誰にも渡らない式（書いたのに どこにも届かない行）を見つける★ 2026-08-25
//
//   ★踏んだ事（司さん 2026-08-25「前みたいに一覧から編集できん」）★
//     2026-08-21 に「（idで特定）」の見出しを消した時、こうなっていた:
//
//       document.getElementById("modalBody").innerHTML =
//         "";                       ← ★代入が ここで終わってしまった★
//       "</div>" + fields + "…";    ← ★誰にも渡らない ただの式★
//
//     ＝ 一覧から1件 押すと ★「明細を編集」と「閉じる」だけの空の画面★ が出て、
//       ★1件も直せない★。本番で4日 そのままだった。
//
//   ★なぜ どの見張りも捕まえなかったか★
//     ・★構文としては 正しい★ … html-script-syntax は通る
//     ・eslint は HTML の中の <script> を見ない
//     ・vitest の試験は HTML を ★文字として読む★だけ
//     ＝★「緑」は「動く」ではない★の 一番きつい形。
//
//   ★この見張りがする事★
//     HTML の中の <script> を解析して、
//     ★式なのに 誰にも渡っていない行（ExpressionStatement）★ を数える。
//     文字列の連結・数の計算・比較 など「書いても何も起きない」形だけを見る。
//     （関数呼び出し・代入・await などは 正しい式文なので 数えない）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parse } from 'acorn';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function inlineScripts(html) {
  const out = [];
  const RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = RE.exec(html))) {
    out.push({ code: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

// ★誰にも渡らない式★＝書いても何も起きない形だけを拾う
//   拾う  : 文字列や数の連結・計算・比較・ただの値（"a" + b / 1 + 2 / x === y / "abc"）
//   拾わない: 関数呼び出し・代入・new・await・yield・?. など（副作用が有りうる）
const DEAD = new Set(['BinaryExpression', 'Literal', 'TemplateLiteral', 'ArrayExpression']);

export function deadExpressions(code, baseLine) {
  const found = [];
  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', locations: true });
  } catch (_) {
    return found; // 構文は別の見張り(html-script-syntax)が見る
  }
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ExpressionStatement' && node.expression && DEAD.has(node.expression.type)) {
      // 'use strict' などのおまじないは除く
      const isDirective =
        node.expression.type === 'Literal' && typeof node.expression.value === 'string';
      if (!isDirective) {
        found.push({
          行: (baseLine || 0) + (node.loc ? node.loc.start.line - 1 : 0),
          形: node.expression.type,
          さわり: code.slice(node.start, Math.min(node.end, node.start + 70)).replace(/\s+/g, ' '),
        });
      }
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast);
  return found;
}

describe('★誰にも渡らない式が無い★', () => {
  it('見張りが本物か（わざと壊した物を見つける）', () => {
    // 2026-08-21 に実際に作ってしまったのと同じ形
    const bad = 'var a=1; document.title = ""; "</div>" + a + "x";';
    expect(deadExpressions(bad, 1).length, '★壊れた物を見逃している★').toBeGreaterThan(0);
    // 正しい物は拾わない
    const good = 'var a = "x" + 1; f(a); a = a + "y";';
    expect(deadExpressions(good, 1).length, '★正しい物を弾いている★').toBe(0);
  });

  it('daikou-seikyu.html に 誰にも渡らない式が 1件も無い', () => {
    const html = fs.readFileSync(path.join(ROOT, 'daikou-seikyu.html'), 'utf8');
    const ss = inlineScripts(html);
    expect(ss.length, '★script が取れていない＝何も見ていない★').toBeGreaterThan(0);
    const all = [];
    for (const s of ss) all.push(...deadExpressions(s.code, s.line));
    const doc = all
      .map((x) => `  HTMLの ${x.行} 行あたり: ${x.さわり}`)
      .slice(0, 5)
      .join('\n');
    expect(all.length, `★誰にも渡らない式が ${all.length} 件★\n${doc}`).toBe(0);
  });
});

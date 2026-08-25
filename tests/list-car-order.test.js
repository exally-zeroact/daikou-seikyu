// @vitest-environment node
// ============================================================
// ★一覧も請求書も「車ごと → 早い順」で並ぶ★ 2026-08-25
//
//   司さん「一覧の並びも 上から車ごとに分けて 早い順で並べて」／「請求書の一覧もな」
//
//   ★決まり（1本＝meisai-engine.js）★
//     ・車ごと … 事務所で決めた並び順（dk_car_no：1466=1番・4987=2番…）
//     ・車の中は 早い順（メーターの何本目 dk_ref の3つめ → 無ければ 入れた順 _created）
//     ・★手で入れた分は 車が無い★ので ★車の後ろ★（消さない・入れた順）
//   ★日の順は 今まで通り。どちらも 1文字も触っていない★
//     （司さん 2026-08-25「古い日は今まで通りでええ、これは他も一緒」）
//     ・一覧 … 今まで通り 新しい日が上
//     ・請求書 … 今まで通り 古い日が上
//   ⇒ ★足したのは 同じ日の中の並びだけ★
//
//   ★なぜ試験にするか★
//     並びは毎日 目に入る所。崩れても「なんか違う」で終わって原因が分からなくなる。
//     ★決まりを2か所に書かない★事も ここで見張る。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'daikou-seikyu.html'), 'utf8');

// ★本物の関数を呼ぶ★（試験の中で決まりを書き直さない＝食い違いを作らない）
const ENGINE = await import('../meisai-engine.js');
const U = (globalThis.MeisaiEngine || ENGINE.default || ENGINE).utils;

// 一覧＝新しい日が上／その中は エンジンの compareInDay
function sortList(rows) {
  return rows.slice().sort((a, b) => {
    const d = (b.日付 || '').localeCompare(a.日付 || '');
    return d !== 0 ? d : U.compareInDay(a, b);
  });
}
// 請求書＝古い日が上／その中は 同じ compareInDay
function sortInvoice(rows) {
  return rows.slice().sort((a, b) => {
    const d = (a.日付 || '').localeCompare(b.日付 || '');
    return d !== 0 ? d : U.compareInDay(a, b);
  });
}

const mk = (id, date, car, carNo, dev, seq, created) => ({
  id,
  日付: date,
  dk_car: car,
  dk_car_no: carNo,
  dk_ref: dev ? dev + ':1756000000000:' + seq : undefined,
  _created: created,
});

describe('★一覧と請求書の並び（車ごと → 早い順）★', () => {
  it('★決まりは エンジン1本（一覧が書き直していない）★', () => {
    expect(typeof U.compareInDay, '★決まりが1本になっていない★').toBe('function');
    expect(HTML, '★一覧が自分で決まりを書き直している★').toContain('MeisaiEngine.utils.carNoOf');
    expect(HTML, '★車の見出しが無い★').toContain('li-car');
    expect(HTML, '★手で入れた分の見出しが無い★').toContain('手で入れた分');
  });

  it('①日の順は 今まで通り（一覧＝新しい日が上・触っていない）', () => {
    const r = sortList([
      mk('x', '2026-08-23', '1466', 1, 'A', 1, '2026-08-23T01:00:00Z'),
      mk('y', '2026-08-24', '1466', 1, 'A', 1, '2026-08-24T01:00:00Z'),
    ]);
    expect(r.map((v) => v.id)).toEqual(['y', 'x']);
  });

  it('②③車ごと・車の中は 早い順', () => {
    const r = sortList([
      mk('c', '2026-08-24', '4987', 2, 'B', 1, '2026-08-24T05:00:00Z'),
      mk('b', '2026-08-24', '1466', 1, 'A', 2, '2026-08-24T04:00:00Z'),
      mk('d', '2026-08-24', '4987', 2, 'B', 2, '2026-08-24T06:00:00Z'),
      mk('a', '2026-08-24', '1466', 1, 'A', 1, '2026-08-24T03:00:00Z'),
    ]);
    expect(r.map((v) => v.id), '★車ごと・早い順になっていない★').toEqual(['a', 'b', 'c', 'd']);
  });

  it('④手で入れた分は 車の後ろ・入れた順', () => {
    const r = sortList([
      mk('te2', '2026-08-24', null, null, null, null, '2026-08-24T09:00:00Z'),
      mk('a', '2026-08-24', '1466', 1, 'A', 1, '2026-08-24T03:00:00Z'),
      mk('te1', '2026-08-24', null, null, null, null, '2026-08-24T08:00:00Z'),
    ]);
    expect(r.map((v) => v.id), '★手で入れた分が 車より前に来ている★').toEqual([
      'a',
      'te1',
      'te2',
    ]);
  });

  it('★請求書も 日の順は今まで通り／同じ日だけ 車ごと・早い順★（司さん「請求書の一覧もな」）', () => {
    const r = sortInvoice([
      mk('c', '2026-08-24', '4987', 2, 'B', 1, '2026-08-24T05:00:00Z'),
      mk('old', '2026-08-23', '1466', 1, 'A', 1, '2026-08-23T01:00:00Z'),
      mk('b', '2026-08-24', '1466', 1, 'A', 2, '2026-08-24T04:00:00Z'),
      mk('a', '2026-08-24', '1466', 1, 'A', 1, '2026-08-24T03:00:00Z'),
    ]);
    expect(r.map((v) => v.id), '★請求書の並びが違う★').toEqual(['old', 'a', 'b', 'c']);
  });

  it('★請求書づくり(buildMonth)が その決まりを呼んでいる★', () => {
    const eng = fs.readFileSync(path.join(ROOT, 'meisai-engine.js'), 'utf8');
    const i = eng.indexOf("function buildMonth");
    expect(i, '★buildMonth が無い★').toBeGreaterThan(-1);
    const body = eng.slice(i, i + 1200);
    expect(body, '★請求書が 車ごと・早い順を使っていない★').toContain('compareInDay');
    expect(body, '★同じ日を id の順に戻している★').toContain('compareInDay(a, b)');
  });

  it('★境界：車の番号0を「0番」と読んで先頭に出さない★', () => {
    expect(U.carNoOf({ dk_car_no: 0 }), '0番を車として扱っている').toBe(9999);
    expect(U.carNoOf({}), '車なしが最後になっていない').toBe(9999);
    expect(U.carNoOf({ dk_car_no: '2' }), '文字の2番を読めていない').toBe(2);
  });

  it('★何本目が無い時は 入れた順（早い順）★', () => {
    const r = sortList([
      mk('b', '2026-08-24', '1466', 1, null, null, '2026-08-24T05:00:00Z'),
      mk('a', '2026-08-24', '1466', 1, null, null, '2026-08-24T03:00:00Z'),
    ]);
    expect(r.map((v) => v.id)).toEqual(['a', 'b']);
  });
});

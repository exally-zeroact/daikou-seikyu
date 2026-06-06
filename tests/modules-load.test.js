import { describe, it, expect } from "vitest";

// ★これは CLAUDE.md の push前チェック「node --check」を自動化したもの。
//   module.exports を持つ純ロジック/データモジュールが Node でロード時に
//   構文エラー/参照エラーを出さないことを毎 push で保証する。
//   (window 直書きの kyuuryoumeisai-data.js / 実行時依存の api/claude.js は対象外)
const MODULES = {
  "exally-formula": () => import("../exally-formula.js"),
  "koyohoken-ritsu": () => import("../koyohoken-ritsu.js"),
  "rouki-ritsu": () => import("../rouki-ritsu.js"),
  "saitei-chingin": () => import("../saitei-chingin.js"),
  "shakaihoken-hyo": () => import("../shakaihoken-hyo.js"),
  "shotokuzei-hyou": () => import("../shotokuzei-hyou.js"),
  "shouhizei-ritsu": () => import("../shouhizei-ritsu.js"),
};

describe("純モジュールのロード健全性 (構文/読み込みガード)", () => {
  for (const [name, load] of Object.entries(MODULES)) {
    it(`${name}.js がエラーなくロードできる`, async () => {
      const mod = await load();
      expect(mod.default ?? mod).toBeTruthy();
    });
  }
});

      function _dkFixObi() {
        var box = document.getElementById("dkFixObi");
        if (!box) return;
        var m = _dkFixKiroku();
        var ids = Object.keys(m);
        box.innerHTML = ids
          .map(function (id) {
            var x = m[id] || {};
            return (
              '<div class="dkfix-obi' +
              (x.shirase ? " dkfix-shirase" : "") +
              '" data-dkfix="' +
              esc(id) +
              '"><div class="dkfix-na">' +
              esc(x.na || "") +
              '</div><div class="dkfix-ji">' +
              esc(x.ji || "") +
              "</div>" +
              (x.okuru
                ? '<button class="btn btn-sm dkfix-okuru" data-dkfix-okuru="' +
                  esc(id) +
                  '"' +
                  (_dkFixOkuruChu[id] ? " disabled" : "") + // 送り中は 描き直しても 押せない
                  ">もう一度 事務所へ 送る</button>"
                : "") +
              '<button class="dkfix-x" data-dkfix-x="' +
              esc(id) +
              '" aria-label="閉じる">×</button></div>'
            );
          })
          .join("");
        Array.prototype.forEach.call(box.querySelectorAll("[data-dkfix-x]"), function (b) {
          b.onclick = function () {
            var m2 = _dkFixKiroku();
            delete m2[b.getAttribute("data-dkfix-x")];
            _dkFixKaku(m2);
            _dkFixObi();
          };
        });
        Array.prototype.forEach.call(box.querySelectorAll("[data-dkfix-okuru]"), function (b) {
          b.onclick = function () {
            var id2 = b.getAttribute("data-dkfix-okuru");
            var r2 = DB.filter(function (x) {
              return x.id === id2;
            })[0];
            if (!r2) {
              toast("この 行は もう 一覧に 在りません。× で 閉じてください。");
              return;
            }
            b.disabled = true;
            _dkFixOkuru(r2);
          };
        });
      }
      async function deleteRow(id) {
        // ソフト削除（deleted_atを立てる＝後で復活可能）
        var d = await SB.from("meisai")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id);
        if (d.error) {
          cloudErr("明細削除", d.error);
          return;
        }
        DB = DB.filter(function (x) {
          return x.id !== id;
        });
        // 消した 行の 帯は 消す（押しても 何も 起きない 帯を 残さない）2026-10-14
        var mDk = _dkFixKiroku();
        if (mDk[id]) {
          delete mDk[id];
          _dkFixKaku(mDk);
        }
        closeModal();
        renderList();
        updatePayBadge();
        toast("削除しました");
      }

      /* ===================================================================
      会社マスタ（チェック / ドラッグ / 幅）
      =================================================================== */
      function renderMaster() {
        refreshCompanySelects();
        var box = document.getElementById("masterBody");
        var names = Object.keys(MASTER).filter(function (n) {
          return MASTER[n].account_id === CURRENT_ACCOUNT;
        });
        box.innerHTML = names
          .map(function (co) {
            return masterCardHTML(co);
          })
          .join("");
        attachSwipeHandlers();
        attachDndTouch();
      }
      // タッチ並べ替え（Exallyのseikyusyo/mitsumoriyoと同じ方式：取っ手touchstart→指の下の項目を
      // ハイライト→touchendでその位置に差し込む）。HTML5 draggableはPCのみ動くのでスマホ用にこれを併設。
      // タッチ並べ替え（Exally給料明細 kyuuryoumeisai と同じ「見せ方」に統一）：
      // 取っ手⠿をつかむと半透明＋少し縮小、ドラッグ中は他の項目がリアルタイムでズレて着地点が見える
      // （DOMを実際に動かしてライブプレビュー）。指を離した順番で確定。ドラッグ中はページスクロールを固定。
      function attachDndTouch() {
        document.querySelectorAll("#scr-settings .dnd-list").forEach(function (list) {
          if (list._dndWired) return; // 再描画ごとにlistは作り直されるので毎回新規配線
          list._dndWired = true;
          var co = list.getAttribute("data-co");
          var dragEl = null;
          function itemUnder(y) {
            var found = null;
            list.querySelectorAll(".dnd-item").forEach(function (el) {
              var r = el.getBoundingClientRect();
              if (y >= r.top && y <= r.bottom) found = el;
            });
            return found;
          }
          list.addEventListener(
            "touchstart",
            function (e) {
              var grip = e.target.closest(".dnd-grip");
              if (!grip) return;
              dragEl = grip.closest(".dnd-item");
              if (!dragEl) return;
              dragEl.classList.add("dragging");
              document.body.style.overflow = "hidden"; // ドラッグ中はページを動かさない
              e.stopPropagation(); // 親のスワイプ削除を発火させない
            },
            { passive: true }
          );
          list.addEventListener(
            "touchmove",
            function (e) {
              if (!dragEl) return;
              e.preventDefault();
              var y = e.touches[0].clientY;
              var target = itemUnder(y);
              if (target && target !== dragEl) {
                var r = target.getBoundingClientRect();
                // 指が対象の上半分なら前へ、下半分なら後ろへ＝つかんだ項目をその場に差し込む（ライブ移動）
                if (y < r.top + r.height / 2) list.insertBefore(dragEl, target);
                else list.insertBefore(dragEl, target.nextSibling);
              }
            },
            { passive: false }
          );
          function end() {
            if (!dragEl) return;
            dragEl.classList.remove("dragging");
            document.body.style.overflow = "";
            dragEl = null;
            // 画面上の並びをそのまま確定
            var keys = [];
            list.querySelectorAll(".dnd-item").forEach(function (el) {
              keys.push(el.dataset.key);
            });
            MASTER[co].items = keys;
            saveMaster();
            reopen(co);
          }
          list.addEventListener("touchend", end);
          list.addEventListener("touchcancel", end);
        });
      }
      // iOSメール式：会社の行を左スワイプ → 赤い「削除」を表示 → タップで削除
      function attachSwipeHandlers() {
        var OPEN = -86,
          TH = -42;
        // 会社マスタ・一覧の両方（.swipe-content を持つもの全部）にスワイプ削除を付与
        document.querySelectorAll(".swipe-content").forEach(function (content) {
          if (content._sw) return;
          content._sw = true;
          var startX = 0,
            startY = 0,
            dx = 0,
            dragging = false,
            decided = false,
            horiz = false;
          function opened() {
            return content.classList.contains("swipe-open");
          }
          function setX(x) {
            content.style.transform = "translateX(" + x + "px)";
          }
          function closeOthers() {
            document.querySelectorAll(".swipe-content.swipe-open").forEach(function (c) {
              if (c !== content) {
                c.classList.remove("swipe-open");
                c.style.transform = "translateX(0)";
              }
            });
          }
          content.addEventListener(
            "touchstart",
            function (e) {
              if (e.touches.length > 1) {
                dragging = false;
                return;
              }
              // 会社マスタは「開いて編集中」のときはスワイプ削除を無効化（編集の邪魔をしない）。
              // 閉じている（会社名だけ）ときだけ左スワイプ削除を有効にする。
              if (content.querySelector(".master-co-body.open")) {
                dragging = false;
                return;
              }
              // フォーム部品・チップ・ドラッグ項目の操作は妨げない
              if (e.target.closest("input,select,textarea,button,.dnd-item,.chip")) {
                dragging = false;
                return;
              }
              startX = e.touches[0].clientX;
              startY = e.touches[0].clientY;
              dx = opened() ? OPEN : 0;
              dragging = true;
              decided = false;
              horiz = false;
              content.classList.add("swiping");
            },
            { passive: true }
          );
          content.addEventListener(
            "touchmove",
            function (e) {
              if (!dragging) return;
              var ddx = e.touches[0].clientX - startX;
              var ddy = e.touches[0].clientY - startY;
              if (!decided && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) {
                decided = true;
                horiz = Math.abs(ddx) > Math.abs(ddy);
                if (horiz) closeOthers();
              }
              if (decided && horiz) {
                e.preventDefault();
                var base = opened() ? OPEN : 0;
                dx = Math.max(OPEN, Math.min(0, base + ddx));
                setX(dx);
              }
            },
            { passive: false }
          );
          function end() {
            if (!dragging) return;
            dragging = false;
            content.classList.remove("swiping");
            if (!horiz) return;
            if (dx < TH) {
              content.classList.add("swipe-open");
              setX(OPEN);
            } else {
              content.classList.remove("swipe-open");
              setX(0);
            }
          }
          content.addEventListener("touchend", end);
          content.addEventListener("touchcancel", end);
          // 開いた状態でタップ → 展開させずに閉じる
          content.addEventListener(
            "click",
            function (e) {
              if (opened()) {
                e.stopPropagation();
                e.preventDefault();
                content.classList.remove("swipe-open");
                setX(0);
              }
            },
            true
          );
        });
      }

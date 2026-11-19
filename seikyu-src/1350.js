      // ★欄ごとの 最後勝ち★ 2026-11-18 司さん「最後に触った方が優先やないんか」「やれ」（10-21 の 決め＝直しでも 消しでも 最後の 方）
      //   保存は「この 画面で 開いてから 客が 変えた 欄」だけを 書く。変えていない 欄は 倉庫の 今の 値の まま
      //   （別の 画面＝事務所の 入力・別の 端末が 後から 直した 額・名前・会社名を 古い 値で 潰さない）。
      //   ★変えたかは 描いた 直後の 打ち欄の 値と 比べる★（倉庫の 値と 比べると 改行が 落ちる 欄・空と 0 が 同じに なる 額で 割れる＝設計前 対立役 止2・止3）
      //   ★消されていた 行★：手で 入れた 行は 変えた 欄が あれば 戻す（最後に 触った 方）。
      //     ダイコメから 来た 行は 戻さない＝運転手が 現金に 直して 外した 行（dk-sync-jobs hazushiMeisai）と 区別が 付かず、
      //     戻すと 二重に 請求する（設計前 対立役 止1・Daikou-app meisai-row.js「生き返らせない」）。
      var _edMoto = null; // { id, vals: {欄: 描いた 時の 値}, car, zero0 }
      function _edMotoKiroku(id, keys) {
        var vals = {};
        keys.forEach(function (k) {
          var el = document.getElementById("ed_" + k);
          if (el) vals[k] = el.value;
        });
        var carEl = document.getElementById("ed__car");
        var zeroEl = document.getElementById("ed__zero0");
        _edMoto = {
          id: id,
          vals: vals,
          car: carEl ? carEl.value : null,
          zero0: zeroEl ? zeroEl.checked : null,
        };
      }
      var MEISAI_RETSU = {
        日付: "date",
        行き先: "destination",
        金額: "amount",
        備考: "note",
        距離: "distance",
        人数: "people",
        名前: "name",
      };
      // ★件⑧b 2026-11-14★ 保存が 通らなかった 時に 手元の 行を 開いた 時の 姿へ 戻す（同じ 物を 指したまま 中身だけ）
      function _motoNiModosu(r, moto) {
        Object.keys(r).forEach(function (k) {
          if (!(k in moto)) delete r[k];
        });
        Object.assign(r, moto);
      }
      // ★件⑧b★ 明細 1行を 倉庫から 読み直して 手元（DB）を 差し替える。消えていたら 手元からも 外す。
      //   読めなければ false（手元は 開いた 時の 姿の まま）
      async function _meisaiIchigyouYomu(id) {
        var y = await SB.from("meisai").select("*").eq("id", id).maybeSingle();
        if (y.error) return false;
        var i = -1;
        for (var j = 0; j < DB.length; j++)
          if (DB[j].id === id) {
            i = j;
            break;
          }
        if (!y.data || y.data.deleted_at) {
          if (i >= 0) DB.splice(i, 1);
          return "kieta"; // 消えていた（真の まま＝呼び元は「読めた」と同じに 扱える・字だけ 分ける）
        } else if (i >= 0) DB[i] = meisaiFromDb(y.data);
        else DB.push(meisaiFromDb(y.data));
        return true;
      }
      // ★保存は 1行 1本ずつ★（2回 押すと 2本 走り、一覧に 同じ 行が 2本 出た・11-19 本番前 対立役 止2）
      var _saveEditChu = {};
      function _dbIdx(id) {
        for (var i = 0; i < DB.length; i++) if (DB[i] && DB[i].id === id) return i;
        return -1;
      }
      async function saveEdit(id) {
        if (_saveEditChu[id]) return;
        // ★門は 印つき★＝自分の 印の 時だけ 外す（1回目の 送りの 終わりが 2回目の 門を 消さない・11-19 叩き直し 任意1）
        var shirushi = {};
        _saveEditChu[id] = shirushi;
        try {
          await _saveEditHontai(id, shirushi);
        } finally {
          if (_saveEditChu[id] === shirushi) delete _saveEditChu[id];
        }
      }
      async function _saveEditHontai(id, shirushi) {
        var r = DB.filter(function (x) {
          return x.id === id;
        })[0];
        if (!r) return;
        // ★直す前の 姿を 控える（金額が 変わったかを 見る為）★ 2026-09-03
        //   ★決まりは エンジン1本★（MeisaiEngine.utils.shouldPushFare）＝ここに 書き直さない
        var _mae = { 金額: r.金額, dk_source: r.dk_source, dk_ref: r.dk_ref };
        var dkGyou = !!(_mae.dk_source || _mae.dk_ref);
        var m = MASTER[r.会社名];
        var keys =
          m && m.items
            ? m.items
            : FIELD_DEFS.map(function (f) {
                return f.key;
              });
        // 日付必須チェック（編集でも空にはできない）
        if (keys.indexOf("日付") >= 0) {
          var dEl = document.getElementById("ed_日付");
          if (dEl && !String(dEl.value || "").trim()) {
            toast("日付を入れてください");
            return;
          }
        }
        // 開いた 時の 打ち欄の 値（無ければ 何を 変えたか 分からない＝書かない）
        var moto = _edMoto && _edMoto.id === id ? _edMoto : null;
        if (!moto) {
          toast("画面を 開き直してから 保存してください（何も 保存していません）", 8000);
          return;
        }
        var maeKingaku = r.金額; // 0円と 決めた 印は 客が 額を 0 に 変えた 時 だけ 付ける（本番前の 対立役 注1）
        // ★書けなかった 時に 手元を 戻す 控え★ 2026-11-14 件⑧b
        var _moto = Object.assign({}, r);
        var kaeta = {}; // 客が 変えた 欄
        keys.forEach(function (k) {
          var el = document.getElementById("ed_" + k);
          if (!el) return;
          if (k in moto.vals && el.value === moto.vals[k]) return; // 変えていない＝倉庫の 今の 値の まま
          kaeta[k] = true;
          var def = FIELD_DEFS.filter(function (f) {
            return f.key === k;
          })[0];
          var t = def ? def.type : "text";
          if (t === "number")
            r[k] = el.value === "" ? "" : Number(String(el.value).replace(/[^0-9.\-]/g, "")) || 0;
          else r[k] = el.value;
        });
        // 車：空に戻したら dk_car・dk_car_no とも消す（「keep」＝一覧に無い今の札はそのまま）
        var carEl = document.getElementById("ed__car");
        var carKaeta = !!(carEl && carEl.value !== "keep" && carEl.value !== moto.car);
        if (carKaeta) kurumaWoTsukeru(r, carEl.value === "" ? -1 : Number(carEl.value));
        var zeroEl = document.getElementById("ed__zero0");
        var zeroKaeta = !!(zeroEl && zeroEl.checked !== moto.zero0);
        // ★メーターの 行に 客が 0 と 打った＝0円と 決めた 印★（料金未定の 見張りが 通す・本番前の 対立役 注1）
        if ((r.dk_source || r.dk_ref) && document.getElementById("ed_金額")) {
          if (zeroEl) {
            // 前から 0 の 行＝客が 欄に 印を 付けた 時 だけ（行き先 だけ 直しても 付かない）
            if (r.金額 === 0 && zeroEl.checked) r.ryokin_0_kimeta = true;
            else delete r.ryokin_0_kimeta;
          } else if (r.金額 === 0 && maeKingaku !== 0 && maeKingaku !== "0")
            r.ryokin_0_kimeta = true;
          else if (r.金額 !== 0) delete r.ryokin_0_kimeta;
        }
        var nanimoKaete = !Object.keys(kaeta).length && !carKaeta && !zeroKaeta;
        // ★読む 前に 鍵の 門★（読みは 口の 門を 通らない＝別の 人・切れた 鍵で 読むと 0行を「消された」と 取り違える）
        //   別の 人の 鍵＝開き直す・切れた＝ログインの 板（kagiMon が 出す）。何も 書かない
        var ses0 = await SB.auth.getSession();
        var tok0 = ses0 && ses0.data && ses0.data.session && ses0.data.session.access_token;
        if (!kagiMon(tok0)) {
          _motoNiModosu(r, _moto);
          return;
        }
        // ★書く 直前に 倉庫の 今の 行を 1回 読む★（消されていたか・別の 画面の 額・extra の 今）
        var y = await SB.from("meisai").select("*").eq("id", id).maybeSingle();
        if (y.error) {
          _motoNiModosu(r, _moto);
          cloudErr("明細更新", y.error);
          return;
        }
        var kura = y.data;
        var kesareta = !kura || !!kura.deleted_at;
        // 消されていた：手で 入れた 行で 変えた 欄が ある 時 だけ 戻す（上の 注・止1）
        if (kesareta && (!kura || dkGyou || nanimoKaete)) {
          _motoNiModosu(r, _moto);
          DB = DB.filter(function (x) {
            return x.id !== id;
          });
          closeModal();
          renderList();
          toast(
            nanimoKaete && kura && !dkGyou
              ? "別の画面で消されていました。何も変えていないので戻していません。一覧から外しました"
              : "別の画面で消されていました。打った内容は保存していません。一覧から外しました",
            8000
          );
          naoshiYomu();
          return;
        }
        var _n = function (v) {
          return v === "" || v == null ? null : Number(v);
        };
        var _gakuJi = function (v) {
          return v == null || v === "" ? "料金未定" : comma(v) + "円";
        };
        var betsuGaku = _n(kura.amount) !== _n(_mae.金額);
        if (nanimoKaete) {
          // 変えた 欄が 無い＝書かない。手元は 倉庫の 今の 行に 揃える
          var iN = _dbIdx(id);
          if (iN >= 0) DB[iN] = meisaiFromDb(kura);
          closeModal();
          renderList();
          if (betsuGaku)
            toast(
              "変えた所が無いので書いていません。額は別の画面で直された " +
                _gakuJi(kura.amount) +
                " のままです",
              8000
            );
          else toast("変えた所が無いので、何も書いていません");
          return;
        }
        var full = meisaiToDb(r);
        // ★メーターの 行で 料金が 空なら 空（null）の まま 書く★ 2026-11-04（本番前の 対立役 止1）
        if (dkGyou && (r.金額 === "" || r.金額 == null)) full.amount = null;
        var upd = {};
        Object.keys(kaeta).forEach(function (k) {
          if (MEISAI_RETSU[k]) upd[MEISAI_RETSU[k]] = full[MEISAI_RETSU[k]];
        });
        // extra は 鍵ごと：変えた 鍵だけを 倉庫の 今の extra に 重ねる（他の 鍵＝事務所・ダイコメの 送りが 持つ 物は 触らない）
        var exKagi = Object.keys(kaeta).filter(function (k) {
          return !MEISAI_RETSU[k] && STD_MEISAI_KEYS.indexOf(k) < 0;
        });
        if (carKaeta) exKagi.push("dk_car", "dk_car_no");
        // 額を 書く 時は 0円と 決めた 印も 新しい 額から 決め直す（設計前 対立役 任1）
        if (kaeta.金額 || zeroKaeta) exKagi.push("ryokin_0_kimeta");
        if (exKagi.length) {
          var ex = Object.assign(
            {},
            kura.extra && typeof kura.extra === "object" ? kura.extra : {}
          );
          exKagi.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(full.extra, k)) ex[k] = full.extra[k];
            else delete ex[k];
          });
          upd.extra = ex;
        }
        var modoshita = kesareta; // ここに 来た 消された 行＝手で 入れた 行で 変えた 欄が ある
        if (modoshita) upd.deleted_at = null;
        var u = await SB.from("meisai").update(upd).eq("id", id).select("*");
        if (u.error) {
          _motoNiModosu(r, _moto);
          cloudErr("明細更新", u.error);
          return;
        }
        if (!Array.isArray(u.data) || u.data.length === 0) {
          // 読んだ 後に 倉庫から 無くなった（物理削除・持ち主の 違い）＝書けていない
          _motoNiModosu(r, _moto);
          var yometa = await _meisaiIchigyouYomu(id);
          closeModal();
          renderList();
          toast(
            yometa === "kieta"
              ? "別の画面で消されていました。打った内容は保存していません。一覧から外しました"
              : "保存できませんでした。画面を開き直してください",
            8000
          );
          return;
        }
        var ato = meisaiFromDb(u.data[0]);
        // ★id で 探し直す★（r は 前の 保存で 差し替わって いる 事が ある＝DB.push で 同じ 行が 2本 に なった・11-19 本番前 対立役 止2）
        var iA = _dbIdx(id);
        if (iA >= 0) DB[iA] = ato;
        else DB.push(ato);
        var shirase = [];
        if (modoshita) shirase.push("別の画面で消されていた行を、この保存で戻しました");
        if (betsuGaku && kaeta.金額)
          shirase.push(
            "別の画面で " +
              _gakuJi(kura.amount) +
              " に直されていましたが、この保存の " +
              _gakuJi(u.data[0].amount) +
              " にしました"
          );
        else if (betsuGaku)
          shirase.push("額は別の画面で直された " + _gakuJi(kura.amount) + " のままです");
        var shiraseJi = shirase.length ? "保存しました。" + shirase.join("。") : "";
        closeModal();
        renderList();
        toast(shiraseJi || "保存しました", shiraseJi ? 8000 : undefined);
        naoshiYomu(); // 事務所の 直し＝赤が 消える（⑦）
        // ★保存の 門は ここで 外す★（倉庫へ 書いて 手元も 揃った＝この 先の 事務所へ 送る 間〔最長 20秒〕に
        //   もう一度 直した 保存を 止めない。送り直しは _dkFixMata が 受ける・11-19 全網 dk-fix-kotae で 赤）
        if (_saveEditChu[id] === shirushi) delete _saveEditChu[id];
        // ★事務所の売上へ 戻す★ 2026-09-03（司さん「一覧で金額とか修正したら事務所の売上とかも自動で修正されるように」）
        //   ★客が 額を 変えた 時 だけ★（別の 画面の 額を 読んだ だけで 送ると、事務所の 直しを 送り返す）
        //   ★保存は もう 終わっている★＝ここで 何が 起きても 一覧の 保存は 通ったまま。
        //   ★比べるのは 倉庫の 今の 額★（手元の 古い 額と 比べると、料金未定→0 や 古い 額と 同じ 額を 打った 時に
        //    別の 画面が 入れた 額が 事務所に 残る＝11-19 本番前 対立役 止1）
        if (kaeta.金額) {
          await _jimushoHeModosu(ato, {
            金額: kura.amount == null ? null : kura.amount,
            dk_source: _mae.dk_source,
            dk_ref: _mae.dk_ref,
          });
          // 戻した 知らせ（1.7秒）で 上の 知らせが 消えない ように 出し直す
          if (shiraseJi) toast(shiraseJi, 8000);
        }
      }

      // ★-test のアドレスの時だけ 帯を出す★（本番では1ドットも変わらない）
      (function () {
        "use strict";
        var h = (location.hostname || "").toLowerCase();
        if (!/-test\./.test(h) && !/-test$/.test(h)) return;
        var el = document.getElementById("testBand");
        if (!el) return;
        el.style.display = "block";
        // 帯の分だけ中身を下げる（頭が帯に隠れないように）
        document.documentElement.style.paddingTop = el.offsetHeight + "px";
      })();

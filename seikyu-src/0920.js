      function _pqCol(n) {
        var s = "";
        n++;
        while (n > 0) {
          var r = (n - 1) % 26;
          s = String.fromCharCode(65 + r) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      }
      function _pqU32(n) {
        var b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, n >>> 0, true);
        return b;
      }
      function _pqConcat(arrs) {
        var len = arrs.reduce(function (s, a) {
          return s + a.length;
        }, 0);
        var out = new Uint8Array(len),
          off = 0;
        arrs.forEach(function (a) {
          out.set(a, off);
          off += a.length;
        });
        return out;
      }
      function _pqB64(u8) {
        var s = "",
          CH = 0x8000;
        for (var i = 0; i < u8.length; i += CH)
          s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        return btoa(s);
      }
      function _pqEsc(v) {
        return String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function _pqSectionM(sheets, token) {
        var m = "section Section1;\r\n";
        sheets.forEach(function (sh) {
          var url =
            SUPABASE_URL + "/rest/v1/rpc/" + sh.fn + "?token=" + token + "&apikey=" + SUPABASE_ANON;
          m +=
            'shared #"' +
            sh.name +
            '" = let\r\n    Source = Json.Document(Web.Contents("' +
            url +
            '")),\r\n    ToTable = Table.FromRecords(Source)\r\nin\r\n    ToTable;\r\n';
        });
        return m;
      }
      async function _pqMashupPkg(sheets, token) {
        var z = new JSZip();
        z.file(
          "[Content_Types].xml",
          '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Override PartName="/Formulas/Section1.m" ContentType="application/x-ms-m" /></Types>'
        );
        z.file(
          "Config/Package.xml",
          '<?xml version="1.0" encoding="utf-8"?><Package xmlns="http://schemas.microsoft.com/DataMashup"><Version>2.0.0</Version></Package>'
        );
        z.file("Formulas/Section1.m", _pqSectionM(sheets, token));
        return z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      }
      function _pqMetaXml(sheets) {
        var items =
          "<Item><ItemLocation><ItemType>AllFormulas</ItemType><ItemPath /></ItemLocation><StableEntries /></Item>";
        sheets.forEach(function (sh) {
          items +=
            "<Item><ItemLocation><ItemType>Formula</ItemType><ItemPath>Section1/" +
            sh.name +
            "</ItemPath></ItemLocation><StableEntries>" +
            '<Entry Type="IsPrivate" Value="l0" />' +
            '<Entry Type="FillEnabled" Value="l1" />' +
            '<Entry Type="FillObjectType" Value="sTable" />' +
            '<Entry Type="FillToDataModelEnabled" Value="l0" />' +
            '<Entry Type="ResultType" Value="sTable" />' +
            '<Entry Type="FillTarget" Value="s' +
            sh.name +
            '" /></StableEntries></Item>';
        });
        return (
          '<?xml version="1.0" encoding="utf-8"?><LocalPackageMetadataFile xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Items>' +
          items +
          "</Items></LocalPackageMetadataFile>"
        );
      }
      async function _pqDataMashupB64(sheets, token) {
        var pkg = await _pqMashupPkg(sheets, token);
        var perm = new TextEncoder().encode(
          '<?xml version="1.0" encoding="utf-8"?><PermissionList xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CanEvaluateFuturePackages>false</CanEvaluateFuturePackages><FirewallEnabled>true</FirewallEnabled><WorkbookGroupType xsi:nil="true" /></PermissionList>'
        );
        var meta = new TextEncoder().encode(_pqMetaXml(sheets));
        var blob = _pqConcat([
          _pqU32(0),
          _pqU32(pkg.length),
          pkg,
          _pqU32(perm.length),
          perm,
          _pqU32(meta.length),
          meta,
          _pqU32(0),
        ]);
        return _pqB64(blob);
      }
      // SheetJSのxlsx(buf)にフォント補正＋PQ層注入。失敗時はフォント補正だけで返す。
      // 請求書シートにページ割りの改ページ(rowBreaks)を注入＝印刷で各ページが分かれる。
      async function _injectRowBreaks(z, sheetName, breaks) {
        if (!breaks || !breaks.length) return;
        var wbXml = await z.file("xl/workbook.xml").async("string");
        var wbRels = await z.file("xl/_rels/workbook.xml.rels").async("string");
        var rid = (wbXml.match(
          new RegExp('<sheet[^>]*name="' + sheetName + '"[^>]*r:id="([^"]+)"')
        ) || [])[1];
        if (!rid) return;
        var target = (wbRels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1];
        if (!target) return;
        var path = "xl/" + target.replace(/^\//, "");
        var f = z.file(path);
        if (!f) return;
        var sx = await f.async("string");
        if (/<rowBreaks/.test(sx)) return;
        var brk = breaks
          .map(function (r) {
            return '<brk id="' + (r - 1) + '" max="16383" man="1"/>';
          })
          .join("");
        var xml =
          '<rowBreaks count="' +
          breaks.length +
          '" manualBreakCount="' +
          breaks.length +
          '">' +
          brk +
          "</rowBreaks>";
        // ★スキーマ順序★ rowBreaks は ignoredErrors/extLst より前でないとExcelが弾く（修復ダイアログ）。
        // 末尾(</worksheet>直前)に置くとignoredErrorsの後になり順序違反→直前に挿入する。
        var at = sx.indexOf("<ignoredErrors");
        if (at < 0) at = sx.indexOf("<extLst");
        if (at < 0) at = sx.indexOf("</worksheet>");
        z.file(path, sx.slice(0, at) + xml + sx.slice(at));
      }
      // 請求書シートの印刷設定をファイルに焼き込む＝ユーザーが開いて印刷してもA4縦・幅1ページに収まる。
      // (司さん指示「寸法はちゃんとA4の幅ピッタリに」)。SheetJSの既定pageMargins/pageSetupは置換。
      async function _injectPageSetup(z, sheetName, sideMargin) {
        var wbXml = await z.file("xl/workbook.xml").async("string");
        var wbRels = await z.file("xl/_rels/workbook.xml.rels").async("string");
        var rid = (wbXml.match(
          new RegExp('<sheet[^>]*name="' + sheetName + '"[^>]*r:id="([^"]+)"')
        ) || [])[1];
        if (!rid) return;
        var target = (wbRels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1];
        if (!target) return;
        var path = "xl/" + target.replace(/^\//, "");
        var f = z.file(path);
        if (!f) return;
        var sx = await f.async("string");
        // 既存の余白/印刷設定を除去（重複防止）
        sx = sx
          .replace(/<printOptions[^>]*\/>/g, "")
          .replace(/<pageMargins[^>]*\/>/g, "")
          .replace(/<pageSetup[^>]*\/>/g, "");
        // ① fitToPage は使わない（幅フィットは水平センタリングを無効化し表が左に寄る）。
        // ② 中央寄せ＝非対称マージン。左マージン=表幅に合わせた値で表を中央へ寄せ、
        //    右マージンは小さく(0.39)して印刷可能域を右に広げる＝ロゴを右端まで置ける。
        //    （horizontalCenteredは右上ロゴ＋判子の偏りに引っ張られ表が左にズレるため不使用）。
        var lmg = sideMargin && sideMargin > 0.39 ? sideMargin.toFixed(2) : "0.39";
        var inject =
          '<pageMargins left="' +
          lmg +
          '" right="0.39" top="0.47" bottom="0.39" header="0.3" footer="0.3"/>' +
          '<pageSetup paperSize="9" orientation="portrait"/>';
        // ★スキーマ順★ pageMargins/pageSetup は rowBreaks/ignoredErrors/extLst より前。
        var at = sx.indexOf("<rowBreaks");
        if (at < 0) at = sx.indexOf("<ignoredErrors");
        if (at < 0) at = sx.indexOf("<extLst");
        if (at < 0) at = sx.indexOf("</worksheet>");
        z.file(path, sx.slice(0, at) + inject + sx.slice(at));
      }
      // 判子画像を請求書シートに埋め込む（各ページの発行者右上）。アプリPDFと同じ見た目に。
      async function _injectHanko(z, sheetName, hanko) {
        if (!hanko) return;
        // 判子＋ロゴを同じ仕組み（複数画像）で埋め込む。imagesに正規化。
        var images = [];
        if (hanko.dataURL && hanko.anchors && hanko.anchors.length) {
          var hs = Math.round((hanko.sizeMm || 21) * 36000);
          images.push({
            dataURL: hanko.dataURL,
            w: hs,
            h: hs,
            anchors: hanko.anchors,
            nm: "hanko",
          });
        }
        if (hanko.logo && hanko.logo.dataURL && hanko.logo.anchors && hanko.logo.anchors.length) {
          var lw = Math.round((hanko.logo.wMm || 32) * 36000);
          var lh = Math.round((hanko.logo.hMm || hanko.logo.wMm || 32) * 36000);
          images.push({
            dataURL: hanko.logo.dataURL,
            w: lw,
            h: lh,
            anchors: hanko.logo.anchors,
            nm: "logo",
          });
        }
        if (!images.length) return;
        var anch = "",
          relAll = "",
          exts = {},
          pid = 2;
        images.forEach(function (img, ii) {
          var dm = img.dataURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.*)$/);
          if (!dm) return;
          var ext = dm[1] === "jpg" ? "jpeg" : dm[1];
          exts[ext] = 1;
          var bin = atob(dm[2]);
          var u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          z.file("xl/media/img" + ii + "." + ext, u8);
          var rId = "rIdImg" + ii;
          relAll +=
            '<Relationship Id="' +
            rId +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/img' +
            ii +
            "." +
            ext +
            '"/>';
          img.anchors.forEach(function (a) {
            // 絶対座標(x,y)があれば absoluteAnchor＝印刷の水平センタリングが画像の偏りに
            // 引っ張られない（oneCellAnchorだと右上ロゴ＋判子で表が左にズレる）。
            var head =
              a.x != null
                ? '<xdr:absoluteAnchor><xdr:pos x="' +
                  Math.round(a.x) +
                  '" y="' +
                  Math.round(a.y || 0) +
                  '"/>'
                : "<xdr:oneCellAnchor><xdr:from><xdr:col>" +
                  a.col +
                  "</xdr:col><xdr:colOff>" +
                  (a.colOff || 0) +
                  "</xdr:colOff><xdr:row>" +
                  a.row +
                  "</xdr:row><xdr:rowOff>" +
                  (a.rowOff || 0) +
                  "</xdr:rowOff></xdr:from>";
            var tail = a.x != null ? "</xdr:absoluteAnchor>" : "</xdr:oneCellAnchor>";
            anch +=
              head +
              '<xdr:ext cx="' +
              img.w +
              '" cy="' +
              img.h +
              '"/>' +
              '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' +
              pid +
              '" name="' +
              img.nm +
              pid +
              '"/><xdr:cNvPicPr/></xdr:nvPicPr>' +
              '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="' +
              rId +
              '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
              '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
              img.w +
              '" cy="' +
              img.h +
              '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
              "</xdr:pic><xdr:clientData/>" +
              tail;
            pid++;
          });
        });
        z.file(
          "xl/drawings/drawing1.xml",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
            anch +
            "</xdr:wsDr>"
        );
        z.file(
          "xl/drawings/_rels/drawing1.xml.rels",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            relAll +
            "</Relationships>"
        );
        var ext = Object.keys(exts)[0] || "png"; // content-types用（下で全ext処理）
        // シートに drawing 参照を追加（ignoredErrors/extLst の後＝</worksheet>直前）
        var wbXml = await z.file("xl/workbook.xml").async("string");
        var wbRels = await z.file("xl/_rels/workbook.xml.rels").async("string");
        var rid = (wbXml.match(
          new RegExp('<sheet[^>]*name="' + sheetName + '"[^>]*r:id="([^"]+)"')
        ) || [])[1];
        var target = (wbRels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1];
        if (!target) return;
        var path = "xl/" + target.replace(/^\//, "");
        var sx = await z.file(path).async("string");
        sx = sx.replace("</worksheet>", '<drawing r:id="rIdDraw"/></worksheet>');
        z.file(path, sx);
        // シートrelsに drawing
        var relPath = path.replace(/worksheets\/(sheet\d+)\.xml$/, "worksheets/_rels/$1.xml.rels");
        var relEntry =
          '<Relationship Id="rIdDraw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
        var ef = z.file(relPath);
        if (ef) {
          var rx = await ef.async("string");
          z.file(relPath, rx.replace("</Relationships>", relEntry + "</Relationships>"));
        } else {
          z.file(
            relPath,
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
              relEntry +
              "</Relationships>"
          );
        }
        // content-types：drawing override ＋ 使った全画像拡張子の default
        var ct = await z.file("[Content_Types].xml").async("string");
        var add = "";
        if (!/spreadsheetDrawing/.test(ct))
          add +=
            '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
        Object.keys(exts).forEach(function (e) {
          if (ct.indexOf('Extension="' + e + '"') < 0 && add.indexOf('Extension="' + e + '"') < 0)
            add += '<Default Extension="' + e + '" ContentType="image/' + e + '"/>';
        });
        if (add) z.file("[Content_Types].xml", ct.replace("</Types>", add + "</Types>"));
      }

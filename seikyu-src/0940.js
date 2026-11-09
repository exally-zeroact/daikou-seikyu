      async function _exlEnhance(
        buf,
        sheets,
        token,
        invoiceBreaks,
        invoiceHanko,
        invoiceMargin,
        invoiceSheets
      ) {
        var TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (typeof JSZip === "undefined") return new Blob([buf], { type: TYPE });
        async function fontFix(z) {
          var f = z.file("xl/styles.xml");
          if (f) {
            var s = await f.async("string");
            // 全フォントの書体名だけを游ゴシックに（太字/サイズ/索引は保持＝スタイル崩さない）
            s = s.replace(/<name val="[^"]*"\s*\/>/g, '<name val="游ゴシック"/>');
            if (!/<name val=/.test(s)) s = s.replace(/<font>/g, '<font><name val="游ゴシック"/>');
            z.file("xl/styles.xml", s);
          }
        }
        try {
          var z = await JSZip.loadAsync(buf);
          await fontFix(z);
          if (token) {
            try {
              await _wqInject(z, sheets, token);
            } catch (e) {
              // 注入で壊れたら、クリーンに作り直してフォント補正だけ＝静的Excelで落とす
              z = await JSZip.loadAsync(buf);
              await fontFix(z);
            }
          }
          // ★会社毎シート(invoiceSheets配列)があればシート毎に体裁注入。無ければ従来の単一「請求書」。
          var _invSheets =
            invoiceSheets && invoiceSheets.length
              ? invoiceSheets
              : [
                  {
                    name: "請求書",
                    breaks: invoiceBreaks,
                    hanko: invoiceHanko,
                    margin: invoiceMargin,
                  },
                ];
          for (var _is = 0; _is < _invSheets.length; _is++) {
            var _sh = _invSheets[_is];
            try {
              await _injectPageSetup(z, _sh.name, _sh.margin);
            } catch (e) {}
            try {
              await _injectRowBreaks(z, _sh.name, _sh.breaks);
            } catch (e) {}
            try {
              await _injectHanko(z, _sh.name, _sh.hanko);
            } catch (e) {}
          }
          return z.generateAsync({ type: "blob", mimeType: TYPE, compression: "DEFLATE" });
        } catch (e) {
          return new Blob([buf], { type: TYPE });
        }
      }
      // レガシーWebクエリ(type=4)注入＝.iqyと同じエンジンを4シートに埋め込む。
      // ListObjectテーブル/tablePartsを使わない=壊れにくい。開くだけ自動更新を狙う。
      async function _wqInject(z, sheets, token) {
        var wbXml = await z.file("xl/workbook.xml").async("string");
        var wbRels = await z.file("xl/_rels/workbook.xml.rels").async("string");
        var sheetRid = {},
          ridTarget = {},
          m;
        var sheetOrder = []; // workbook内の実際のシート並び（localSheetId算出用）
        var sre = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g;
        while ((m = sre.exec(wbXml))) {
          sheetRid[m[1]] = m[2];
          sheetOrder.push(m[1]);
        }
        var rre = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
        while ((m = rre.exec(wbRels))) ridTarget[m[1]] = m[2];

        var conns =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
        var ctExtra =
          '<Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/>';
        var definedNames = "";

        for (var i = 0; i < sheets.length; i++) {
          var sh = sheets[i],
            n = i + 1;
          var key = sh.fn.replace("export_", ""); // export_meisai -> meisai
          var cols = sh.aoa[0].length,
            rows = sh.aoa.length;
          var url = location.origin + "/api/excel?token=" + token + "&amp;sheet=" + key;

          conns +=
            '<connection id="' +
            n +
            '" name="WebQuery_' +
            key +
            '" type="4" refreshedVersion="6" minRefreshableVersion="3" background="1" refreshOnLoad="1" saveData="1">' +
            '<webPr sourceData="1" parsePre="0" consecutive="1" xl2000="1" url="' +
            url +
            '" htmlTables="1" htmlFormat="all"><tables count="1"><x v="1"/></tables></webPr></connection>';

          z.file(
            "xl/queryTables/queryTable" + n + ".xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><queryTable xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="WebQuery_' +
              key +
              '" connectionId="' +
              n +
              '" autoFormatId="16" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="0"/>'
          );
          ctExtra +=
            '<Override PartName="/xl/queryTables/queryTable' +
            n +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"/>';

          var sheetPath = "xl/" + ridTarget[sheetRid[sh.name]];
          var relPath = sheetPath.replace(
            /worksheets\/(sheet\d+)\.xml$/,
            "worksheets/_rels/$1.xml.rels"
          );
          var relEntry =
            '<Relationship Id="rIdQt' +
            n +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/queryTable" Target="../queryTables/queryTable' +
            n +
            '.xml"/>';
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

          var localId = sheetOrder.indexOf(sh.name); // 実際のシート位置（ホーム挿入等で動く）
          definedNames +=
            '<definedName name="ExternalData_' +
            n +
            '" localSheetId="' +
            (localId < 0 ? i : localId) +
            '" hidden="1">' +
            sh.name +
            "!$A$1:$" +
            _pqCol(cols - 1) +
            "$" +
            rows +
            "</definedName>";
        }
        conns += "</connections>";
        z.file("xl/connections.xml", conns);

        var ct = await z.file("[Content_Types].xml").async("string");
        z.file("[Content_Types].xml", ct.replace("</Types>", ctExtra + "</Types>"));

        z.file(
          "xl/_rels/workbook.xml.rels",
          wbRels.replace(
            "</Relationships>",
            '<Relationship Id="rIdConnx" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/></Relationships>'
          )
        );

        var wbx = wbXml;
        if (/<definedNames>/.test(wbx)) {
          wbx = wbx.replace("</definedNames>", definedNames + "</definedNames>");
        } else {
          wbx = wbx.replace(
            "</sheets>",
            "</sheets><definedNames>" + definedNames + "</definedNames>"
          );
        }
        z.file("xl/workbook.xml", wbx);
      }
      // zに接続・DataMashup・テーブルを注入（実データ範囲に厳密一致）
      async function _pqInject(z, sheets, token) {
        var b64 = await _pqDataMashupB64(sheets, token);
        z.file(
          "customXml/item1.xml",
          '<DataMashup xmlns="http://schemas.microsoft.com/DataMashup">' + b64 + "</DataMashup>"
        );
        z.file(
          "customXml/itemProps1.xml",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ds:datastoreItem ds:itemID="{F4D2C9A1-1111-4A3E-9B88-1234567890AB}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="http://schemas.microsoft.com/DataMashup"/></ds:schemaRefs></ds:datastoreItem>'
        );
        z.file(
          "customXml/_rels/item1.xml.rels",
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>'
        );
        var conns =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
        sheets.forEach(function (sh, i) {
          conns +=
            '<connection id="' +
            (i + 1) +
            '" keepAlive="1" name="クエリ - ' +
            sh.name +
            '" description="ブック内の クエリ \'' +
            sh.name +
            '\' への接続です。" type="5" refreshedVersion="6" minRefreshableVersion="3" refreshOnLoad="1" background="1" saveData="1"><dbPr connection="Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=' +
            sh.name +
            ';Extended Properties=&quot;&quot;" command="SELECT * FROM [' +
            sh.name +
            ']"/></connection>';
        });
        conns += "</connections>";
        z.file("xl/connections.xml", conns);

        // workbook.xml と rels から シート名→ファイル を特定
        var wbXml = await z.file("xl/workbook.xml").async("string");
        var wbRels = await z.file("xl/_rels/workbook.xml.rels").async("string");
        var sheetRid = {},
          ridTarget = {},
          mm;
        var sre = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g;
        while ((mm = sre.exec(wbXml))) sheetRid[mm[1]] = mm[2];
        var rre = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
        while ((mm = rre.exec(wbRels))) ridTarget[mm[1]] = mm[2];

        var ctExtra = "";
        for (var i = 0; i < sheets.length; i++) {
          var sh = sheets[i],
            n = i + 1;
          var cols = sh.aoa[0].length,
            rows = sh.aoa.length;
          var ref = "A1:" + _pqCol(cols - 1) + rows;
          var tcols = "",
            qfields = "";
          sh.aoa[0].forEach(function (h, ci) {
            var nm = _pqEsc(h);
            tcols +=
              '<tableColumn id="' +
              (ci + 1) +
              '" uniqueName="' +
              (ci + 1) +
              '" name="' +
              nm +
              '" queryTableFieldId="' +
              (ci + 1) +
              '"/>';
            qfields +=
              '<queryTableField id="' +
              (ci + 1) +
              '" name="' +
              nm +
              '" tableColumnId="' +
              (ci + 1) +
              '"/>';
          });
          z.file(
            "xl/tables/table" + n + ".xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' +
              n +
              '" name="Tbl_' +
              sh.fn +
              '" displayName="Tbl_' +
              sh.fn +
              '" ref="' +
              ref +
              '" tableType="queryTable" totalsRowShown="0"><autoFilter ref="' +
              ref +
              '"/><tableColumns count="' +
              cols +
              '">' +
              tcols +
              '</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>'
          );
          z.file(
            "xl/tables/_rels/table" + n + ".xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdQ" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/queryTable" Target="../queryTables/queryTable' +
              n +
              '.xml"/></Relationships>'
          );
          z.file(
            "xl/queryTables/queryTable" + n + ".xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><queryTable xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="クエリ - ' +
              sh.name +
              '" connectionId="' +
              n +
              '" autoFormatId="16" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="0"><queryTableRefresh nextId="' +
              (cols + 1) +
              '" preserveSortFilterLayout="0"><queryTableFields count="' +
              cols +
              '">' +
              qfields +
              "</queryTableFields></queryTableRefresh></queryTable>"
          );
          ctExtra +=
            '<Override PartName="/xl/tables/table' +
            n +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/queryTables/queryTable' +
            n +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"/>';

          // シートXMLにtableParts差し込み＋rels
          var sheetPath = "xl/" + ridTarget[sheetRid[sh.name]];
          var sxml = await z.file(sheetPath).async("string");
          if (!/<tableParts/.test(sxml)) {
            sxml = sxml.replace(
              "</worksheet>",
              '<tableParts count="1"><tablePart r:id="rIdTbl' + n + '"/></tableParts></worksheet>'
            );
            z.file(sheetPath, sxml);
          }
          var relPath = sheetPath.replace(
            /worksheets\/(sheet\d+)\.xml$/,
            "worksheets/_rels/$1.xml.rels"
          );
          var relEntry =
            '<Relationship Id="rIdTbl' +
            n +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table' +
            n +
            '.xml"/>';
          var ef = z.file(relPath);
          if (ef) {
            var rx = await ef.async("string");
            if (rx.indexOf("rIdTbl" + n) < 0)
              z.file(relPath, rx.replace("</Relationships>", relEntry + "</Relationships>"));
          } else {
            z.file(
              relPath,
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                relEntry +
                "</Relationships>"
            );
          }
        }

        // [Content_Types].xml に override 追加
        var ct = await z.file("[Content_Types].xml").async("string");
        if (!/spreadsheetml\.connections/.test(ct))
          ctExtra =
            '<Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/>' +
            ctExtra;
        if (!/customXmlProperties/.test(ct))
          ctExtra +=
            '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>';
        z.file("[Content_Types].xml", ct.replace("</Types>", ctExtra + "</Types>"));

        // workbook.xml.rels に connections、root .rels に customXml
        if (!/connections\.xml/.test(wbRels))
          z.file(
            "xl/_rels/workbook.xml.rels",
            wbRels.replace(
              "</Relationships>",
              '<Relationship Id="rIdConnx" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/></Relationships>'
            )
          );
        var rootRels = await z.file("_rels/.rels").async("string");
        if (!/customXml\/item1\.xml/.test(rootRels))
          z.file(
            "_rels/.rels",
            rootRels.replace(
              "</Relationships>",
              '<Relationship Id="rIdCustomXml1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="customXml/item1.xml"/></Relationships>'
            )
          );
      }

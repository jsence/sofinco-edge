/**
 * Exports « comité de direction » — Excel, Word, PowerPoint (client-side, GitHub Pages).
 * Consomme un contexte préparé par index.html (aucune invention de données).
 */
(function (global) {
  var EMPTY = 'Non renseigné';
  var BRAND = {
    navy: '0B2B4A',
    tq: '4FD8D8',
    tqInk: '0E8C97',
    muted: '6B7280',
    red: 'DC2626',
    orange: 'D97706',
    gray: '9CA3AF',
    white: 'FFFFFF',
    sofFill: 'E0F7F7'
  };

  function isoToday () {
    return new Date().toISOString().slice(0, 10);
  }

  function fileName (scopeSlug, ext) {
    return 'SofincoEdge_' + scopeSlug + '_' + isoToday() + '.' + ext;
  }

  function val (v) {
    if (v == null) return EMPTY;
    var s = String(v).trim();
    return s || EMPTY;
  }

  function impactFill (impact) {
    var i = String(impact || '').toLowerCase();
    if (i.indexOf('menace') >= 0) return BRAND.red;
    if (i.indexOf('surveill') >= 0) return BRAND.orange;
    return BRAND.gray;
  }

  function pptFooter (slide, pageNum, total) {
    slide.addText('Document interne — Veille concurrentielle SofincoEdge', {
      x: 0.5, y: 7.05, w: 8, h: 0.3, fontSize: 8, color: BRAND.muted
    });
    slide.addText(isoToday() + '  ·  ' + pageNum + ' / ' + total, {
      x: 9.5, y: 7.05, w: 3.5, h: 0.3, fontSize: 8, color: BRAND.muted, align: 'right'
    });
  }

  function applySlideMaster (pptx) {
    pptx.defineSlideMaster({
      title: 'SE_MASTER',
      background: { color: 'F8FAFB' },
      margin: [0.5, 0.5, 0.5, 0.5]
    });
  }

  function addCoverSlide (pptx, ctx, subtitle) {
    var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.12, fill: { color: BRAND.tq }
    });
    slide.addText('Veille concurrentielle', {
      x: 0.6, y: 0.45, w: 11, h: 0.35, fontSize: 11, color: BRAND.muted, letterSpacing: 1
    });
    slide.addText('SofincoEdge', {
      x: 0.6, y: 1.0, w: 11, h: 0.7, fontSize: 36, bold: true, color: BRAND.navy
    });
    slide.addText(ctx.scopeTitle || ctx.scopeLabel, {
      x: 0.6, y: 1.85, w: 11, h: 0.55, fontSize: 22, color: BRAND.tqInk
    });
    slide.addText(subtitle || ('Export du ' + ctx.exportDateLabel), {
      x: 0.6, y: 2.55, w: 11, h: 0.4, fontSize: 13, color: BRAND.muted
    });
    if (ctx.filterSummary) {
      slide.addText('Filtres actifs : ' + ctx.filterSummary, {
        x: 0.6, y: 3.15, w: 11.5, h: 0.8, fontSize: 10, color: BRAND.navy, valign: 'top'
      });
    }
    return slide;
  }

  function addExecSummarySlide (pptx, ctx) {
    var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
    slide.addText('Synthèse exécutive', {
      x: 0.5, y: 0.35, w: 12, h: 0.55, fontSize: 22, bold: true, color: BRAND.navy
    });
    var bullets = (ctx.execBullets || []).slice(0, 5);
    if (!bullets.length) bullets = [EMPTY];
    var body = bullets.map(function (b) {
      return { text: b, options: { fontSize: 14, color: BRAND.navy, bullet: true, breakLine: true, paraSpaceAfter: 8 } };
    });
    slide.addText(body, { x: 0.65, y: 1.1, w: 11.8, h: 5.5, valign: 'top' });
    return slide;
  }

  function addFaitsMarquantsSlide (pptx, ctx) {
    var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
    slide.addText('Faits marquants', {
      x: 0.5, y: 0.35, w: 12, h: 0.55, fontSize: 22, bold: true, color: BRAND.navy
    });
    var rows = [['Impact', 'Date', 'Acteur', 'Titre']];
    (ctx.highlightActus || []).slice(0, 8).forEach(function (a) {
      rows.push([val(a.impact), val(a.dateLabel), val(a.acteur), val(a.titre)]);
    });
    if (rows.length === 1) rows.push([EMPTY, EMPTY, EMPTY, EMPTY]);
    slide.addTable(rows.map(function (row, ri) {
      return row.map(function (cell, ci) {
        var opts = { fontSize: ri === 0 ? 10 : 9, bold: ri === 0, color: BRAND.navy };
        if (ri > 0 && ci === 0) opts.fill = impactFill(cell);
        if (ri > 0 && ci === 0) opts.color = BRAND.white;
        return { text: cell, options: opts };
      });
    }), {
      x: 0.4, y: 1.0, w: 12.5,
      colW: [1.4, 1.0, 1.4, 8.7],
      border: { type: 'solid', color: 'E5E7EB', pt: 0.5 },
      fill: { color: 'FFFFFF' }
    });
    return slide;
  }

  function addPromoChartSlide (pptx, ctx) {
    var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
    slide.addText('Promotions — comparatif des taux', {
      x: 0.5, y: 0.35, w: 12, h: 0.55, fontSize: 22, bold: true, color: BRAND.navy
    });
    var promos = ctx.promoChart || { labels: [], values: [], highlightIndex: -1 };
    if (promos.labels.length) {
      slide.addChart(pptx.ChartType.bar, [{
        name: 'Taux promo',
        labels: promos.labels,
        values: promos.values
      }], {
        x: 0.6, y: 1.1, w: 12, h: 5.2,
        showLegend: false,
        showTitle: false,
        chartColors: promos.labels.map(function (_, i) {
          return i === promos.highlightIndex ? BRAND.tq : 'B8C5D1';
        }),
        barDir: 'col',
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 9
      });
    } else {
      slide.addText(EMPTY, { x: 0.6, y: 2, w: 11, h: 0.5, fontSize: 14, color: BRAND.muted });
    }
    return slide;
  }

  function addDiffSlides (pptx, ctx) {
    var slides = [];
    (ctx.differenciateurs || []).forEach(function (d) {
      var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
      slide.addText('Différenciateur — ' + val(d.acteur), {
        x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND.navy
      });
      var blocks = [
        { label: 'Différence', text: val(d.difference) },
        { label: 'Pourquoi ça ressort', text: val(d.pourquoi) },
        { label: 'Conclusion', text: val(d.conclusion) }
      ];
      var y = 1.0;
      blocks.forEach(function (b) {
        slide.addText(b.label, { x: 0.55, y: y, w: 11, h: 0.3, fontSize: 10, bold: true, color: BRAND.tqInk });
        y += 0.32;
        slide.addText(b.text, { x: 0.55, y: y, w: 11.5, h: 0.9, fontSize: 11, color: BRAND.navy, valign: 'top' });
        y += 1.05;
      });
      slides.push(slide);
    });
    if (!slides.length) {
      var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
      slide.addText('Différenciateurs', { x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND.navy });
      slide.addText(EMPTY, { x: 0.6, y: 1.2, w: 11, h: 0.4, fontSize: 12, color: BRAND.muted });
      slides.push(slide);
    }
    return slides;
  }

  function chunkTableRows (rows, maxDataRows) {
    if (!rows || !rows.length) return [[]];
    var header = rows[0];
    var data = rows.slice(1);
    var chunks = [];
    for (var i = 0; i < data.length; i += maxDataRows) {
      chunks.push([header].concat(data.slice(i, i + maxDataRows)));
    }
    if (!data.length) chunks.push([header]);
    return chunks;
  }

  function addTableauSlides (pptx, ctx) {
    var slides = [];
    var chunks = chunkTableRows(ctx.tableauRows || [], 12);
    chunks.forEach(function (chunk, idx) {
      var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
      slide.addText('Tableau comparatif' + (chunks.length > 1 ? ' (' + (idx + 1) + '/' + chunks.length + ')' : ''), {
        x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND.navy
      });
      slide.addTable(chunk.map(function (row, ri) {
        return row.map(function (cell, ci) {
          var isHeader = ri === 0;
          var isSof = !isHeader && ctx.tableauSofincoCol === ci;
          return {
            text: val(cell),
            options: {
              fontSize: isHeader ? 9 : 8,
              bold: isHeader,
              fill: isHeader ? BRAND.navy : (isSof ? BRAND.sofFill : 'FFFFFF'),
              color: isHeader ? BRAND.white : BRAND.navy
            }
          };
        });
      }), {
        x: 0.35, y: 0.95, w: 12.6,
        fontSize: 8,
        border: { type: 'solid', color: 'E5E7EB', pt: 0.5 }
      });
      slides.push(slide);
    });
    if (!slides.length) {
      var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
      slide.addText('Tableau comparatif', { x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND.navy });
      slide.addText(EMPTY, { x: 0.6, y: 1.2, w: 11, h: 0.4, fontSize: 12, color: BRAND.muted });
      slides.push(slide);
    }
    return slides;
  }

  function addSourcesSlide (pptx, ctx) {
    var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
    slide.addText('Sources', { x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 22, bold: true, color: BRAND.navy });
    var rows = [['Date', 'Titre', 'Source']];
    (ctx.sources || []).slice(0, 20).forEach(function (s) {
      rows.push([val(s.dateLabel), val(s.titre), val(s.source)]);
    });
    if (rows.length === 1) rows.push([EMPTY, EMPTY, EMPTY]);
    slide.addTable(rows.map(function (row, ri) {
      return row.map(function (cell) {
        return { text: cell, options: { fontSize: ri === 0 ? 10 : 9, bold: ri === 0, color: BRAND.navy } };
      });
    }), { x: 0.4, y: 1.0, w: 12.5, colW: [1.1, 5.5, 5.9], border: { type: 'solid', color: 'E5E7EB', pt: 0.5 } });
    return slide;
  }

  function appendContextSlides (pptx, ctx, opts) {
    opts = opts || {};
    var slideList = [];
    if (opts.sectionDivider) {
      var div = pptx.addSlide({ masterName: 'SE_MASTER' });
      div.addText(ctx.scopeLabel, { x: 0.5, y: 2.8, w: 12, h: 0.8, fontSize: 28, bold: true, color: BRAND.navy, align: 'center' });
      slideList.push(div);
    }
    if (!opts.skipCover) slideList.push(addCoverSlide(pptx, ctx));
    slideList.push(addExecSummarySlide(pptx, ctx));
    slideList.push(addFaitsMarquantsSlide(pptx, ctx));
    if (ctx.includePromos) slideList.push(addPromoChartSlide(pptx, ctx));
    slideList = slideList.concat(addDiffSlides(pptx, ctx));
    if (ctx.includeTableau) slideList = slideList.concat(addTableauSlides(pptx, ctx));
    if (ctx.decryptages && ctx.decryptages.length) {
      var slide = pptx.addSlide({ masterName: 'SE_MASTER' });
      slide.addText('Décryptage', { x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND.navy });
      var y = 1.0;
      ctx.decryptages.slice(0, 3).forEach(function (t) {
        slide.addText(val(t.titre), { x: 0.55, y: y, w: 11, h: 0.35, fontSize: 12, bold: true, color: BRAND.tqInk });
        y += 0.38;
        slide.addText(val(t.description), { x: 0.55, y: y, w: 11.5, h: 0.85, fontSize: 10, color: BRAND.navy, valign: 'top' });
        y += 1.0;
      });
      slideList.push(slide);
    }
    slideList.push(addSourcesSlide(pptx, ctx));
    return slideList;
  }

  function exportPptx (ctx) {
    if (typeof global.PptxGenJS === 'undefined') throw new Error('PptxGenJS non chargé');
    var pptx = new global.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'SofincoEdge';
    pptx.company = 'Sofinco';
    applySlideMaster(pptx);
    var slideList = appendContextSlides(pptx, ctx, {});
    var total = slideList.length;
    slideList.forEach(function (slide, i) { pptFooter(slide, i + 1, total); });
    return pptx.writeFile({ fileName: fileName(ctx.scopeSlug, 'pptx') });
  }

  function exportPptxMulti (ctxList, outSlug) {
    if (typeof global.PptxGenJS === 'undefined') throw new Error('PptxGenJS non chargé');
    var pptx = new global.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    applySlideMaster(pptx);
    var allSlides = [];
    var coverCtx = {
      scopeLabel: 'Multi-périmètres',
      scopeTitle: 'Export consolidé SofincoEdge',
      exportDateLabel: ctxList[0] ? ctxList[0].exportDateLabel : isoToday(),
      filterSummary: 'Voir sections par produit / catégorie'
    };
    allSlides.push(addCoverSlide(pptx, coverCtx, 'Export consolidé — ' + ctxList.length + ' périmètre(s)'));
    ctxList.forEach(function (ctx, i) {
      allSlides = allSlides.concat(appendContextSlides(pptx, ctx, { skipCover: true, sectionDivider: i > 0 }));
    });
    var total = allSlides.length;
    allSlides.forEach(function (slide, i) { pptFooter(slide, i + 1, total); });
    return pptx.writeFile({ fileName: fileName(outSlug || 'ExportConsolide', 'pptx') });
  }

  /* ── Excel ── */
  function xlsxStyleHeader (ws, row, colCount, style) {
    for (var c = 0; c < colCount; c++) {
      var ref = global.XLSX.utils.encode_cell({ r: row, c: c });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      ws[ref].s = style;
    }
  }

  function sheetFromAoA (rows, opts) {
    opts = opts || {};
    var ws = global.XLSX.utils.aoa_to_sheet(rows);
    if (rows[0] && rows[0].length) {
      ws['!cols'] = rows[0].map(function (_, i) { return { wch: i === 0 ? 28 : 16 }; });
    }
    if (rows.length > 1 && rows[0].length) {
      ws['!autofilter'] = { ref: global.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    }
    if (opts.headerStyle) xlsxStyleHeader(ws, 0, rows[0].length, opts.headerStyle);
    return ws;
  }

  function buildSynthèseRows (ctx) {
    var rows = [
      ['SofincoEdge — Synthèse'],
      ['Périmètre', ctx.scopeLabel],
      ['Date d\'export', ctx.exportDateLabel],
      ['Filtres', ctx.filterSummary || 'Aucun filtre actif'],
      [],
      ['Indicateur', 'Valeur']
    ];
    (ctx.kpis || []).forEach(function (k) { rows.push([k.label, k.value]); });
    return rows;
  }

  function exportExcel (ctx, xs) {
    if (typeof global.XLSX === 'undefined') throw new Error('XLSX non chargé');
    var wb = global.XLSX.utils.book_new();
    var synth = sheetFromAoA(buildSynthèseRows(ctx), { headerStyle: xs.header });
    global.XLSX.utils.book_append_sheet(wb, synth, 'Synthèse');

    (ctx.sheets || []).forEach(function (sh) {
      var ws = sheetFromAoA(sh.rows, { headerStyle: xs.header });
      if (sh.meta) {
        /* stylize tableau via callback from index if provided */
        if (typeof sh.stylize === 'function') sh.stylize(ws);
      }
      if (sh.impactCol >= 0) {
        for (var r = 1; r < sh.rows.length; r++) {
          var ref = global.XLSX.utils.encode_cell({ r: r, c: sh.impactCol });
          if (!ws[ref]) continue;
          var fill = impactFill(ws[ref].v);
          ws[ref].s = { fill: { patternType: 'solid', fgColor: { rgb: fill } }, font: { color: { rgb: 'FFFFFF' }, bold: true } };
        }
      }
      global.XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
    });

    if (ctx.chartData && ctx.chartData.length) {
      global.XLSX.utils.book_append_sheet(wb, sheetFromAoA(ctx.chartData), 'Données graphiques');
    }

    global.XLSX.writeFile(wb, fileName(ctx.scopeSlug, 'xlsx'));
  }

  /* ── Word ── */
  function exportWord (ctx) {
    if (typeof global.docx === 'undefined') throw new Error('docx non chargé');
    var docx = global.docx;
    var children = [];

    children.push(new docx.Paragraph({
      children: [new docx.TextRun({ text: 'SofincoEdge', bold: true, size: 56, color: BRAND.navy })],
      spacing: { after: 200 }
    }));
    children.push(new docx.Paragraph({
      children: [new docx.TextRun({ text: ctx.scopeLabel, size: 32, color: BRAND.tqInk })],
      spacing: { after: 120 }
    }));
    children.push(new docx.Paragraph({
      children: [new docx.TextRun({ text: 'Export du ' + ctx.exportDateLabel, size: 22, color: BRAND.muted })],
      spacing: { after: 120 }
    }));
    if (ctx.filterSummary) {
      children.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: 'Filtres : ' + ctx.filterSummary, italics: true, size: 20 })],
        spacing: { after: 400 }
      }));
    }
    children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));

    children.push(new docx.Paragraph({
      text: 'Synthèse exécutive',
      heading: docx.HeadingLevel.HEADING_1,
      spacing: { after: 200 }
    }));
    (ctx.execBullets || [EMPTY]).forEach(function (b) {
      children.push(new docx.Paragraph({ text: b, bullet: { level: 0 }, spacing: { after: 120 } }));
    });

    children.push(new docx.Paragraph({ text: 'Faits marquants', heading: docx.HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }));
    children.push(wordTableFromRows(docx, ctx.actusTableRows || [[EMPTY]]));

    children.push(new docx.Paragraph({ text: 'Différenciateurs', heading: docx.HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }));
    children.push(wordTableFromRows(docx, ctx.diffTableRows || [[EMPTY]]));

    if (ctx.decryptageTableRows) {
      children.push(new docx.Paragraph({ text: 'Décryptage', heading: docx.HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }));
      children.push(wordTableFromRows(docx, ctx.decryptageTableRows));
    }

    if (ctx.includeTableau && ctx.tableauRows) {
      children.push(new docx.Paragraph({ text: 'Annexe — Tableau comparatif', heading: docx.HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }));
      children.push(wordTableFromRows(docx, ctx.tableauRows, { sofincoCol: ctx.tableauSofincoCol }));
    }

    children.push(new docx.Paragraph({ text: 'Sources', heading: docx.HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 } }));
    children.push(wordTableFromRows(docx, ctx.sourcesTableRows || [['Date', 'Titre', 'Source']]));

    var doc = new docx.Document({
      sections: [{ properties: {}, children: children }]
    });
    return docx.Packer.toBlob(doc).then(function (blob) {
      if (typeof ctx.downloadBlob === 'function') ctx.downloadBlob(blob, fileName(ctx.scopeSlug, 'docx'));
    });
  }

  function wordTableFromRows (docx, rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) {
      return new docx.Table({
        rows: [new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph(EMPTY)] })] })]
      });
    }
    var tableRows = rows.map(function (row, ri) {
      var isHeader = ri === 0;
      return new docx.TableRow({
        children: row.map(function (cell, ci) {
          var isSof = !isHeader && opts.sofincoCol === ci;
          return new docx.TableCell({
            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: val(cell), bold: isHeader })] })],
            shading: isSof ? { fill: 'E0F7F7', type: docx.ShadingType.CLEAR, color: 'auto' } : (isHeader ? { fill: 'F7F9FA', type: docx.ShadingType.CLEAR, color: 'auto' } : undefined)
          });
        })
      });
    });
    return new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: tableRows });
  }

  global.SofincoExecutiveExport = {
    EMPTY: EMPTY,
    fileName: fileName,
    exportPptx: exportPptx,
    exportPptxMulti: exportPptxMulti,
    exportExcel: exportExcel,
    exportWord: exportWord,
    val: val
  };
})(typeof window !== 'undefined' ? window : globalThis);

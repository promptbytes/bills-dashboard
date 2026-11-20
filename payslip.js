/* Payslip reading: text recognition runs inside this browser (Tesseract), the picture is never uploaded.
   Then each Portuguese payslip line is sorted into an earning, a deduction or a total. */
(function () {
  'use strict';

  // Every kind of line, and whether it adds to pay (earn) or takes from it (deduct).
  // "extra: true" marks salários extraordinários (pay from the employer outside the normal salary).
  var KINDS = {
    base:        { side: 'earn' },
    meal:        { side: 'earn' },
    holiday:     { side: 'earn', extra: true },
    christmas:   { side: 'earn', extra: true },
    twelfths:    { side: 'earn', extra: true },
    overtime:    { side: 'earn', extra: true, days: true },
    holidayWork: { side: 'earn', extra: true, days: true },
    bonus:       { side: 'earn', extra: true },
    otherEarn:   { side: 'earn' },
    irs:         { side: 'deduct' },
    ss:          { side: 'deduct' },
    union:       { side: 'deduct' },
    insurance:   { side: 'deduct' },
    advance:     { side: 'deduct' },
    absence:     { side: 'deduct' },
    otherDeduct: { side: 'deduct' }
  };

  // Portuguese payslip words -> kind. Order matters: the first match wins.
  var RULES = [
    ['twelfths',    /duodecimo/],
    ['christmas',   /natal/],
    ['holiday',     /ferias/],
    ['overtime',    /suplementar|horas? extra|h\.? ?extra|trab\.? supl/],
    ['holidayWork', /feriado|dia de descanso|descanso (semanal|obrigatorio|complementar)/],
    ['irs',         /\birs\b|retencao na fonte|imposto/],
    ['ss',          /seg(uranca|\.)? ?soc|\btsu\b|\bs\.? ?s\.?\b|\bcga\b|caixa geral de aposentacoes/],
    ['union',       /sindica/],
    ['insurance',   /seguro|\badse\b/],
    ['advance',     /adiantamento/],
    ['absence',     /falta/],
    ['meal',        /alimentacao|refeic/],
    ['bonus',       /premio|bonus|gratificac|comiss/],
    ['base',        /(vencimento|remuneracao|retribuicao|salario|ordenado|venc\.?) ?(base|mensal)?\b/],
    ['otherDeduct', /desconto|penhora|deducao/],
    ['otherEarn',   /diuturnidade|isencao de horario|ajudas? de custo|turno|subsidio|complemento|abono/]
  ];

  var TOTAL_NET = /(^|[^i])liquido|a receber|total a pagar|valor a pagar/;
  var TOTAL_GROSS = /iliquido|\bbruto|total (de |dos )?(abonos|remuneracoes|vencimentos|ganhos|rendimentos)/;
  var TOTAL_DEDUCT = /total (de |dos )?(descontos|deducoes|retencoes)/;

  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Money amounts written the Portuguese way: 1.234,56 / 1 234,56 / 1234,56 (and 1234.56).
  function findAmounts(line) {
    var re = /(\d{1,3}(?:[ .]\d{3})+|\d+)[,.](\d{2})(?![\d%])/g, out = [], m;
    while ((m = re.exec(line))) {
      var before = line.slice(Math.max(0, m.index - 2), m.index);
      var after = line.slice(re.lastIndex, re.lastIndex + 2);
      if (/\d[./-]$/.test(before) || /^[./-]\d/.test(after) || /^\s?%/.test(after)) continue; // dates, percentages
      out.push({ value: Number(m[1].replace(/[ .]/g, '') + '.' + m[2]), index: m.index, end: re.lastIndex });
    }
    return out;
  }

  // A line can hold several "label amount" pairs (e.g. "Total Ilíquido 3.376,00  Total Descontos 800,16").
  // Each amount belongs to the closest label written before it; the last amount of a label is its value,
  // and a small number before it (like "2,00" in "Trabalho Suplementar 2,00 75,00 150,00") is the quantity.
  function splitPairs(line) {
    var amounts = findAmounts(line), groups = [], cur = null, prevEnd = 0;
    amounts.forEach(function (a) {
      var between = line.slice(prevEnd, a.index);
      var label = between.replace(/^[^A-Za-z\u00C0-\u00FF]+/, '').replace(/[\s:|\[\]()\-\u2014\u2013.]+$/, '').trim();
      if (/[A-Za-z\u00C0-\u00FF]{3,}/.test(label)) {
        cur = { label: label, values: [] };
        groups.push(cur);
      }
      if (cur) cur.values.push(a.value);
      prevEnd = a.end;
    });
    return groups;
  }

  var MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // The month the payslip is for: "Novembro 2026", "11/2026" or a period like "01-11-2026 a 30-11-2026".
  function findMonth(text) {
    var n = norm(text), m;
    for (var i = 0; i < MONTHS.length; i++) {
      m = n.match(new RegExp(MONTHS[i] + '\\W{0,3}(?:de\\s)?(20\\d{2})'));
      if (m) return m[1] + '-' + String(i + 1).padStart(2, '0');
    }
    m = n.match(/(?:periodo|mes|referente)[^\d]{0,20}(?:\d{1,2}[-\/.])?(\d{1,2})[-\/.](20\d{2})/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return m[2] + '-' + String(+m[1]).padStart(2, '0');
    return null;
  }

  function parse(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var result = { items: [], gross: null, deductions: null, net: null, month: findMonth(text) };
    var seen = {};
    lines.forEach(function (raw) {
      // A known payslip word whose amount could not be read: keep it with an empty amount to fill in.
      if (!findAmounts(raw).length) {
        var bare = norm(raw.replace(/^[^A-Za-z\u00C0-\u00FF]+/, ''));
        if (bare.length >= 3 && bare.length <= 50 && !/total|periodo|recibo|trabalhador|categoria|descricao|nif|iban/.test(bare)) {
          for (var j = 0; j < RULES.length - 2; j++) {   // leave out the vague "other" rules
            if (RULES[j][1].test(bare)) {
              var k = RULES[j][0];
              if (!seen['?' + k]) {
                seen['?' + k] = true;
                result.items.push({ kind: k, label: raw.replace(/^[^A-Za-z\u00C0-\u00FF]+/, '').trim().slice(0, 60), amount: null });
              }
              return;
            }
          }
        }
        return;
      }
      splitPairs(raw).forEach(function (g) {
        var n = norm(g.label);
        var amount = g.values[g.values.length - 1];
        if (!amount) return;

        if (TOTAL_DEDUCT.test(n)) { result.deductions = amount; return; }
        if (TOTAL_GROSS.test(n)) { result.gross = amount; return; }
        if (TOTAL_NET.test(n)) { result.net = amount; return; }

        for (var i = 0; i < RULES.length; i++) {
          if (!RULES[i][1].test(n)) continue;
          var kind = RULES[i][0];
          var key = kind + '|' + amount;
          seen['?' + kind] = true;
          if (seen[key]) return;            // the same line read twice
          seen[key] = true;
          var clean = g.label.replace(/[\s\d\[\]|]+$/, '').replace(/\(([^)]*)$/, '($1)').replace(/\s{2,}/g, ' ');
          var item = { kind: kind, label: clean.slice(0, 60), amount: amount };
          if (KINDS[kind].days && g.values.length >= 2 && g.values[0] > 0 && g.values[0] <= 31) item.days = g.values[0];
          result.items.push(item);
          return;
        }
      });
    });
    // Drop an empty "fill in" row when the same kind was also found with an amount.
    var withAmount = {};
    result.items.forEach(function (it) { if (it.amount != null) withAmount[it.kind] = true; });
    result.items = result.items.filter(function (it) { return it.amount != null || !withAmount[it.kind]; });
    return result;
  }

  // ---------- Text recognition (on this device) ----------
  var workerPromise = null, progressCb = null;

  function abs(path) { return new URL(path, document.baseURI).href; }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = window.Tesseract.createWorker('por', 1, {
        workerPath: abs('vendor/tesseract/worker.min.js'),
        corePath: abs('vendor/tesseract/core'),
        langPath: abs('vendor/tesseract/lang'),
        logger: function (m) {
          if (!progressCb) return;
          if (m.status !== 'recognizing text') return;
          progressCb(Math.round(progressMap[0] + m.progress * (progressMap[1] - progressMap[0])));
        }
      }).then(function (w) {
        return w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' }).then(function () { return w; });
      });
      workerPromise.catch(function () { workerPromise = null; });
    }
    return workerPromise;
  }

  // Make the photo grey with more contrast. "large" also enlarges small photos, which helps blurry ones.
  function prepareImage(file, large) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var long = Math.max(img.naturalWidth, img.naturalHeight);
        var scale = long > 2400 ? 2400 / long : 1;
        if (large && long < 1600) scale = Math.min(2, 1600 / long);
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h), px = data.data;
        for (var i = 0; i < px.length; i += 4) {
          var g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          g = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
          px[i] = px[i + 1] = px[i + 2] = g;
        }
        ctx.putImageData(data, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function sumNet(r) {
    var n = 0;
    r.items.forEach(function (it) { if (it.amount != null) n += KINDS[it.kind].side === 'deduct' ? -it.amount : it.amount; });
    return Math.round(n * 100) / 100;
  }

  // The reading checks itself: the lines must add up to the net printed on the payslip, with nothing left to fill in.
  function looksRight(r) {
    return r.net != null && Math.abs(sumNet(r) - r.net) <= 0.05 && r.items.every(function (it) { return it.amount != null; });
  }

  // Combine two readings: keep the first, fill its gaps from the second.
  function merge(a, b) {
    var items = a.items.filter(function (it) { return it.amount != null; });
    var has = {};
    items.forEach(function (it) { has[it.kind] = true; });
    b.items.forEach(function (it) {
      if (it.amount != null && !has[it.kind]) { items.push(it); has[it.kind] = true; }
    });
    a.items.concat(b.items).forEach(function (it) {
      if (it.amount == null && !has[it.kind]) { items.push(it); has[it.kind] = true; }
    });
    var order = Object.keys(KINDS);
    items.sort(function (x, y) { return order.indexOf(x.kind) - order.indexOf(y.kind); });
    return {
      items: items,
      gross: a.gross != null ? a.gross : b.gross,
      deductions: a.deductions != null ? a.deductions : b.deductions,
      net: a.net != null ? a.net : b.net,
      month: a.month || b.month
    };
  }

  function readOnce(file, large, from, to) {
    return Promise.all([getWorker(), prepareImage(file, large)]).then(function (r) {
      progressMap = [from, to];
      return r[0].recognize(r[1], { rotateAuto: true });
    }).then(function (res) { return res.data.text || ''; });
  }

  var progressMap = [0, 100];

  // Returns { text, result }. Reads once; if the numbers don't add up, reads again enlarged and combines.
  function scan(file, onProgress) {
    progressCb = onProgress || null;
    progressMap = [0, 100];
    if (progressCb) progressCb(0);
    var first;
    return readOnce(file, false, 0, 60).then(function (text) {
      first = { text: text, result: parse(text) };
      if (looksRight(first.result)) return first;
      return readOnce(file, true, 60, 100).then(function (text2) {
        var second = parse(text2);
        if (looksRight(second)) return { text: text2, result: second };
        return { text: text + '\n\n----\n\n' + text2, result: merge(first.result, second) };
      });
    }).then(function (out) {
      if (progressCb) progressCb(100);
      progressCb = null;
      return out;
    }, function (err) {
      progressCb = null;
      throw err;
    });
  }

  window.Payslip = { KINDS: KINDS, parse: parse, scan: scan };
})();

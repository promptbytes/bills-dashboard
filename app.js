/* Bills Dashboard — everything is stored in this browser (localStorage). No server. */
(function () {
  'use strict';

  var STORAGE_KEY = 'bills-data-v1';
  var THEME_KEY = 'bills-theme';
  var LANG_KEY = 'bills-lang';

  function $(sel, root) { return (root || document).querySelector(sel); }

  // ---------- Language ----------
  var LANGS = window.I18N, KEYS = window.I18N_KEYS;
  var lang = pickLanguage();
  var strings = {};
  var money, dateFmt, shortDateFmt, monthFmt, relFmt;

  function pickLanguage() {
    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (saved && LANGS[saved]) return saved;
    var wanted = (navigator.languages || [navigator.language || 'en']);
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i]).toLowerCase().split('-')[0];
      if (code === 'no' || code === 'nn') code = 'nb';
      if (LANGS[code]) return code;
    }
    return 'en';
  }

  // Translate a key, filling in {placeholders}. Falls back to English.
  function t(key, vars) {
    var s = strings[key] || LANGS.en[1][KEYS.indexOf(key)] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
    return s;
  }

  function supports(api) {
    try { return !!api && api.supportedLocalesOf(lang).length > 0; } catch (e) { return false; }
  }

  function makeFormatters() {
    if (supports(Intl.DateTimeFormat)) {
      money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' });
      dateFmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' });
      shortDateFmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
      monthFmt = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' });
    } else {
      // This phone has no month names for the language: use numbers only (20.11.2026, 2.500,00 €)
      // so no English words get mixed in.
      money = new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' });
      dateFmt = new Intl.DateTimeFormat('de', { day: '2-digit', month: '2-digit', year: 'numeric' });
      shortDateFmt = new Intl.DateTimeFormat('de', { day: '2-digit', month: '2-digit' });
      monthFmt = new Intl.DateTimeFormat('de', { month: '2-digit', year: 'numeric' });
    }
    relFmt = supports(Intl.RelativeTimeFormat) ? new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }) : null;
  }

  function applyLanguage(code) {
    lang = LANGS[code] ? code : 'en';
    strings = {};
    var list = LANGS[lang][1];
    KEYS.forEach(function (k, i) { strings[k] = list[i]; });
    makeFormatters();
    document.documentElement.lang = lang;
    document.title = t('appTitle');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-plus]').forEach(function (el) { el.textContent = '+ ' + t(el.getAttribute('data-i18n-plus')); });
    $('#lang-select').value = lang;
    $('#lang-select').setAttribute('aria-label', t('language'));
  }

  // Fill the language list, sorted by each language's own name.
  (function () {
    var sel = $('#lang-select');
    Object.keys(LANGS)
      .sort(function (a, b) { return LANGS[a][0].localeCompare(LANGS[b][0]); })
      .forEach(function (code) {
        var o = document.createElement('option');
        o.value = code;
        o.textContent = LANGS[code][0];
        sel.appendChild(o);
      });
    sel.addEventListener('change', function () {
      try { localStorage.setItem(LANG_KEY, sel.value); } catch (e) {}
      applyLanguage(sel.value);
      applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
      render();
    });
  })();
  applyLanguage(lang);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------- Date helpers (all in local time, no time-zone surprises) ----------
  function parseDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function toDateInput(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function monthKey(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }
  function monthKeyLabel(key) {
    var p = key.split('-').map(Number);
    return monthFmt.format(new Date(p[0], p[1] - 1, 1));
  }
  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  // The date in month (y, m) when something with "day of month" happens.
  // Day 31 in a 30-day month becomes the 30th, day 30 in February becomes the 28th/29th.
  function occurrence(y, m, day) { return new Date(y, m, Math.min(day, daysInMonth(y, m))); }

  function isWithin(item, d) {
    var start = parseDate(item.startDate);
    var end = parseDate(item.endDate);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  // Next date (today or later) this item is due / paid. null if it has ended.
  function nextDate(item, from) {
    var start = parseDate(item.startDate) || from;
    var end = parseDate(item.endDate);
    var cursor = start > from ? start : from;
    var y = cursor.getFullYear(), m = cursor.getMonth();
    for (var i = 0; i < 24; i++) {
      var d = occurrence(y, m, item.day);
      if (end && d > end) return null;
      if (d >= from && isWithin(item, d)) return d;
      m++; if (m > 11) { m = 0; y++; }
    }
    return null;
  }

  // Does this item have a due / pay date inside month (y, m)?
  function happensInMonth(item, y, m) { return isWithin(item, occurrence(y, m, item.day)); }

  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  // ---------- Data ----------
  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.income) && Array.isArray(data.payments)) return withDefaults(data);
      }
    } catch (e) { /* ignore and start fresh */ }
    return withDefaults({ income: [], payments: [] });
  }

  // Older saved data (and older backups) have no payslips or extra pay yet.
  function withDefaults(data) {
    if (!Array.isArray(data.payslips)) data.payslips = [];
    if (!Array.isArray(data.extras)) data.extras = [];
    return data;
  }

  // The payslip saved for this income card in this month, if any.
  function payslipFor(incomeId, key) {
    for (var i = 0; i < state.payslips.length; i++) {
      var p = state.payslips[i];
      if (p.incomeId === incomeId && p.month === key) return p;
    }
    return null;
  }

  function payslipTotals(p) {
    var gross = 0, deduct = 0;
    p.lines.forEach(function (l) {
      if (window.Payslip.KINDS[l.kind] && window.Payslip.KINDS[l.kind].side === 'deduct') deduct += l.amount;
      else gross += l.amount;
    });
    return { gross: round2(gross), deduct: round2(deduct), net: round2(gross - deduct) };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert(t('saveFailed'));
    }
  }

  // ---------- Theme ----------
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    $('#theme-color').setAttribute('content', mode === 'dark' ? '#0f1115' : '#f4f5f7');
    $('#theme-text').textContent = t(mode === 'dark' ? 'night' : 'day');
    // Screen readers hear which mode the button switches to.
    $('#theme-toggle').setAttribute('aria-label', t(mode === 'dark' ? 'day' : 'night'));
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  $('#theme-toggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  // ---------- Rendering ----------
  // Badge text such as "Due: tomorrow" or "Payday: 25 Nov", in the chosen language.
  function dueLabel(d, now, labelKey) {
    if (!d) return { text: t('ended'), cls: '' };
    var n = daysBetween(now, d);
    if (n <= 3 && relFmt) return { text: t(labelKey) + ': ' + relFmt.format(n, 'day'), cls: 'warn' };
    return { text: t(labelKey) + ': ' + shortDateFmt.format(d), cls: n <= 3 ? 'warn' : 'accent' };
  }

  function sortByNext(list, now) {
    return list
      .map(function (item) { return { item: item, next: nextDate(item, now) }; })
      .sort(function (a, b) {
        if (!a.next && !b.next) return a.item.name.localeCompare(b.item.name);
        if (!a.next) return 1;
        if (!b.next) return -1;
        return a.next - b.next || a.item.name.localeCompare(b.item.name);
      });
  }

  function render() {
    var now = today();
    var y = now.getFullYear(), m = now.getMonth();
    var thisKey = monthKey(y, m);
    $('#month-label').textContent = monthFmt.format(now);

    // Totals for this calendar month
    var totalIncome = 0, totalOwe = 0, notLogged = [];
    state.income.forEach(function (inc) {
      // A payslip for this month shows what really arrived, so it wins over the card's amount.
      var slip = payslipFor(inc.id, thisKey);
      if (slip) {
        totalIncome += payslipTotals(slip).net;
      } else if (inc.kind === 'variable') {
        var logged = inc.entries && inc.entries[thisKey];
        if (typeof logged === 'number') totalIncome += logged;
        else if (happensInMonth(inc, y, m)) notLogged.push(inc.name);
      } else if (happensInMonth(inc, y, m)) {
        totalIncome += inc.amount;
      }
    });
    // Extra pay entered by hand counts too (extras read from a payslip are already in its net).
    state.extras.forEach(function (x) {
      if (x.month === thisKey) totalIncome += x.amount;
    });
    totalIncome = round2(totalIncome);
    state.payments.forEach(function (p) {
      if (happensInMonth(p, y, m)) totalOwe += p.amount;
    });
    var left = round2(totalIncome - totalOwe);

    $('#total-income').textContent = money.format(totalIncome);
    $('#total-owe').textContent = money.format(totalOwe);
    var leftEl = $('#left-over');
    leftEl.textContent = money.format(left);
    leftEl.className = 'stat-value ' + (left < 0 ? 'negative' : left > 0 ? 'positive' : '');

    var note = $('#summary-note');
    if (notLogged.length) {
      note.hidden = false;
      note.textContent = t('notLogged', { month: monthFmt.format(now), names: notLogged.join(', ') });
    } else {
      note.hidden = true;
      note.textContent = '';
    }

    // Income cards
    var incList = $('#income-list');
    if (!state.income.length) {
      incList.innerHTML = '<div class="empty">' + escapeHtml(t('emptyIncome')) + '</div>';
    } else {
      incList.innerHTML = sortByNext(state.income, now).map(function (row) {
        var inc = row.item, next = row.next;
        var isVar = inc.kind === 'variable';
        var amount;
        if (isVar) {
          var v = inc.entries && inc.entries[thisKey];
          amount = typeof v === 'number' ? money.format(v) : '—';
          var keys = Object.keys(inc.entries || {}).sort();
          var lastKey = keys[keys.length - 1];
        } else {
          amount = money.format(inc.amount);
        }
        var due = dueLabel(next, now, 'payday');
        return '' +
          '<article class="card' + (next || (isVar && amount !== '—') ? '' : ' is-inactive') + '">' +
            '<div class="card-top">' +
              '<div class="card-name">' + escapeHtml(inc.name) + '</div>' +
              '<div class="card-amount positive">' + amount + '</div>' +
            '</div>' +
            '<div class="badges">' +
              '<span class="badge">' + escapeHtml(t(isVar ? 'variable' : 'fixed')) + '</span>' +
              '<span class="badge ' + (due.cls === 'warn' ? 'ok' : due.cls) + '">' + escapeHtml(due.text) + '</span>' +
              (payslipFor(inc.id, thisKey) ? '<span class="badge ok">' + escapeHtml(t('net')) + ': ' +
                money.format(payslipTotals(payslipFor(inc.id, thisKey)).net) + '</span>' : '') +
            '</div>' +
            '<dl class="card-meta">' +
              '<div><dt>' + escapeHtml(t('startDate')) + '</dt><dd>' + dateFmt.format(parseDate(inc.startDate)) + '</dd></div>' +
              '<div><dt>' + escapeHtml(t('paidOnDay')) + '</dt><dd>' + inc.day + '</dd></div>' +
              '<div><dt>' + escapeHtml(t('endDate')) + '</dt><dd>' + (inc.endDate ? dateFmt.format(parseDate(inc.endDate)) : escapeHtml(t('indefinite'))) + '</dd></div>' +
              (isVar ? '<div><dt>' + escapeHtml(t('lastLogged')) + '</dt><dd>' +
                (lastKey ? escapeHtml(monthKeyLabel(lastKey)) + ': ' + money.format(inc.entries[lastKey]) : '—') +
                '</dd></div>' : '') +
            '</dl>' +
            '<div class="card-actions">' +
              (isVar ? '<button class="btn btn-primary btn-small" type="button" data-action="log-income" data-id="' + inc.id + '">' + escapeHtml(t('logAmount')) + '</button>' : '') +
              '<button class="btn btn-ghost btn-small" type="button" data-action="edit-income" data-id="' + inc.id + '">' + escapeHtml(t('edit')) + '</button>' +
              '<button class="btn btn-danger btn-small" type="button" data-action="delete-income" data-id="' + inc.id + '">' + escapeHtml(t('delete')) + '</button>' +
            '</div>' +
          '</article>';
      }).join('');
    }

    // Payment cards
    var payList = $('#payment-list');
    if (!state.payments.length) {
      payList.innerHTML = '<div class="empty">' + escapeHtml(t('emptyBills')) + '</div>';
    } else {
      payList.innerHTML = sortByNext(state.payments, now).map(function (row) {
        var p = row.item, next = row.next;
        var due = dueLabel(next, now, 'due');
        return '' +
          '<article class="card' + (next ? '' : ' is-inactive') + '">' +
            '<div class="card-top">' +
              '<div class="card-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="card-amount">' + money.format(p.amount) + '</div>' +
            '</div>' +
            '<div class="badges">' +
              '<span class="badge ' + due.cls + '">' + escapeHtml(due.text) + '</span>' +
            '</div>' +
            '<dl class="card-meta">' +
              '<div><dt>' + escapeHtml(t('nextDue')) + '</dt><dd>' + (next ? dateFmt.format(next) : escapeHtml(t('ended'))) + '</dd></div>' +
              '<div><dt>' + escapeHtml(t('dueOnDay')) + '</dt><dd>' + p.day + '</dd></div>' +
              '<div><dt>' + escapeHtml(t('startDate')) + '</dt><dd>' + dateFmt.format(parseDate(p.startDate)) + '</dd></div>' +
              '<div><dt>' + escapeHtml(t('endDate')) + '</dt><dd>' + (p.endDate ? dateFmt.format(parseDate(p.endDate)) : '—') + '</dd></div>' +
            '</dl>' +
            '<div class="card-actions">' +
              '<button class="btn btn-ghost btn-small" type="button" data-action="edit-payment" data-id="' + p.id + '">' + escapeHtml(t('edit')) + '</button>' +
              '<button class="btn btn-danger btn-small" type="button" data-action="delete-payment" data-id="' + p.id + '">' + escapeHtml(t('delete')) + '</button>' +
            '</div>' +
          '</article>';
      }).join('');
    }

    renderPayslips();
    renderExtras(y);
  }

  function kindName(kind) { return t('k_' + kind); }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  function incomeName(id) {
    var inc = find(state.income, id);
    return inc ? inc.name : '';
  }

  // ---------- Payslip cards ----------
  function renderPayslips() {
    var list = $('#payslip-list');
    if (!state.payslips.length) {
      list.innerHTML = '<div class="empty">' + escapeHtml(t('emptyPayslips')) + '</div>';
      return;
    }
    list.innerHTML = state.payslips.slice().sort(function (a, b) { return b.month.localeCompare(a.month); }).map(function (p) {
      var tot = payslipTotals(p);
      var who = incomeName(p.incomeId);
      var lines = function (side) {
        return p.lines.filter(function (l) { return window.Payslip.KINDS[l.kind].side === side; }).map(function (l) {
          return '<li><span>' + escapeHtml(kindName(l.kind)) + (l.days ? ' · ' + l.days + ' ' + escapeHtml(t('days').toLowerCase()) : '') +
            (l.label && norm(l.label) !== norm(kindName(l.kind)) ? '<small>' + escapeHtml(l.label) + '</small>' : '') + '</span>' +
            '<span class="amt' + (side === 'deduct' ? ' negative' : '') + '">' + (side === 'deduct' ? '−' : '') + money.format(l.amount) + '</span></li>';
        }).join('');
      };
      return '' +
        '<article class="card">' +
          '<div class="card-top">' +
            '<div class="card-name">' + escapeHtml(monthKeyLabel(p.month)) + (who ? '<small class="card-sub">' + escapeHtml(who) + '</small>' : '') + '</div>' +
            '<div class="card-amount positive">' + money.format(tot.net) + '</div>' +
          '</div>' +
          '<div class="slip-totals">' +
            '<div><span>' + escapeHtml(t('gross')) + '</span><strong>' + money.format(tot.gross) + '</strong></div>' +
            '<div><span>' + escapeHtml(t('deductions')) + '</span><strong class="negative">−' + money.format(tot.deduct) + '</strong></div>' +
          '</div>' +
          '<details class="slip-lines"><summary>' + escapeHtml(t('earnings')) + ' · ' + escapeHtml(t('deductions')) + '</summary>' +
            '<h5>' + escapeHtml(t('earnings')) + '</h5><ul>' + lines('earn') + '</ul>' +
            '<h5>' + escapeHtml(t('deductions')) + '</h5><ul>' + (lines('deduct') || '<li><span>—</span></li>') + '</ul>' +
          '</details>' +
          '<div class="card-actions">' +
            '<button class="btn btn-ghost btn-small" type="button" data-action="edit-payslip" data-id="' + p.id + '">' + escapeHtml(t('edit')) + '</button>' +
            '<button class="btn btn-danger btn-small" type="button" data-action="delete-payslip" data-id="' + p.id + '">' + escapeHtml(t('delete')) + '</button>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  // ---------- Extra pay (salários extraordinários) ----------
  // Extra pay entered by hand, plus the extra lines found on saved payslips.
  function allExtras() {
    var out = state.extras.map(function (x) { return { x: x, manual: true }; });
    state.payslips.forEach(function (p) {
      p.lines.forEach(function (l) {
        if (window.Payslip.KINDS[l.kind].extra) {
          out.push({ x: { kind: l.kind, label: l.label, amount: l.amount, days: l.days, month: p.month }, payslipId: p.id });
        }
      });
    });
    return out.sort(function (a, b) { return b.x.month.localeCompare(a.x.month); });
  }

  function renderExtras(year) {
    $('#extras-pt').hidden = lang === 'pt';
    var items = allExtras();
    var list = $('#extra-list');
    var yearTotal = 0;
    items.forEach(function (it) { if (it.x.month.slice(0, 4) === String(year)) yearTotal += it.x.amount; });
    var totalEl = $('#extras-total');
    totalEl.hidden = !yearTotal;
    totalEl.textContent = t('thisYear') + ' (' + year + '): ' + money.format(round2(yearTotal));
    if (!items.length) {
      list.innerHTML = '<div class="empty">' + escapeHtml(t('emptyExtras')) + '</div>';
      return;
    }
    list.innerHTML = items.map(function (it) {
      var x = it.x;
      var title = x.label && it.manual ? x.label : kindName(x.kind);
      return '' +
        '<article class="card">' +
          '<div class="card-top">' +
            '<div class="card-name">' + escapeHtml(title) + '</div>' +
            '<div class="card-amount positive">' + money.format(x.amount) + '</div>' +
          '</div>' +
          '<div class="badges">' +
            '<span class="badge accent">' + escapeHtml(monthKeyLabel(x.month)) + '</span>' +
            (x.label && it.manual ? '<span class="badge">' + escapeHtml(kindName(x.kind)) + '</span>' : '') +
            (x.days ? '<span class="badge">' + escapeHtml(t('days')) + ': ' + x.days + '</span>' : '') +
            (it.payslipId ? '<span class="badge ok">' + escapeHtml(t('fromPayslip')) + '</span>' : '') +
          '</div>' +
          '<div class="card-actions">' +
            (it.manual
              ? '<button class="btn btn-ghost btn-small" type="button" data-action="edit-extra" data-id="' + x.id + '">' + escapeHtml(t('edit')) + '</button>' +
                '<button class="btn btn-danger btn-small" type="button" data-action="delete-extra" data-id="' + x.id + '">' + escapeHtml(t('delete')) + '</button>'
              : '<button class="btn btn-ghost btn-small" type="button" data-action="edit-payslip" data-id="' + it.payslipId + '">' + escapeHtml(t('edit')) + '</button>') +
          '</div>' +
        '</article>';
    }).join('');
  }

  // ---------- Dialog helpers ----------
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
  document.querySelectorAll('dialog').forEach(function (dlg) {
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(dlg); }); // tap outside closes
    dlg.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', function () { closeDialog(dlg); });
    });
  });

  function showError(form, msg, input) {
    form.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    var box = $('[data-error]', form);
    if (!msg) { box.hidden = true; return; }
    box.textContent = msg;
    box.hidden = false;
    if (input) { input.classList.add('invalid'); input.focus(); }
  }

  // Reads numbers typed the Portuguese way ("13,1", "1.450,50") as well as "13.1" or "1450.50".
  function parseNumber(text) {
    var v = String(text).replace(/[\s€%\u00a0]/g, '');
    if (!v) return NaN;
    var lastComma = v.lastIndexOf(','), lastDot = v.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      // Both used: the last one is the decimal mark, the other groups thousands.
      v = lastComma > lastDot ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    } else if (lastComma > -1) {
      v = v.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
      v = v.replace(/\./g, '');            // "1.450" means one thousand four hundred and fifty
    }
    if (!/^\d*\.?\d+$|^\d+\.$/.test(v)) return NaN;
    return Number(v);
  }

  function readAmount(input) {
    var n = parseNumber(input.value);
    return isFinite(n) && n >= 0 ? round2(n) : NaN;
  }

  // Shared checks for name, start date, day and end date.
  function validateCommon(form, endDateStr) {
    var f = form.elements;
    var name = f.name.value.trim();
    if (!name) return showError(form, t('errName'), f.name), null;
    var start = parseDate(f.startDate.value);
    if (!start) return showError(form, t('errStart'), f.startDate), null;
    var day = Number(f.day.value);
    if (!Number.isInteger(day) || day < 1 || day > 31) return showError(form, t('errDay'), f.day), null;
    if (endDateStr) {
      var end = parseDate(endDateStr);
      if (!end) return showError(form, t('errEnd'), f.endDate), null;
      if (end < start) return showError(form, t('errEndBefore'), f.endDate), null;
    }
    return { name: name, startDate: f.startDate.value, day: day, endDate: endDateStr || null };
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- Income form ----------
  var incomeDlg = $('#income-dialog');
  var incomeForm = $('#income-form');
  var editingIncomeId = null;

  function syncIncomeForm() {
    var f = incomeForm.elements;
    var isVar = f.kind.value === 'variable';
    $('[data-fixed-only]', incomeForm).hidden = isVar;
    $('[data-kind-help]', incomeForm).textContent = t(isVar ? 'variableHelp' : 'fixedHelp');
    var endInput = $('[data-end-date]', incomeForm);
    endInput.hidden = f.endMode.value !== 'date';
  }
  incomeForm.addEventListener('change', syncIncomeForm);

  function openIncomeForm(inc) {
    editingIncomeId = inc ? inc.id : null;
    incomeForm.reset();
    showError(incomeForm, null);
    var f = incomeForm.elements;
    $('#income-form-title').textContent = t(inc ? 'editIncome' : 'addIncome');
    $('[data-delete]', incomeForm).hidden = !inc;
    if (inc) {
      f.name.value = inc.name;
      f.kind.value = inc.kind;
      f.amount.value = inc.kind === 'fixed' ? inc.amount : '';
      f.startDate.value = inc.startDate;
      f.day.value = inc.day;
      f.endMode.value = inc.endDate ? 'date' : 'indefinite';
      f.endDate.value = inc.endDate || '';
    } else {
      f.startDate.value = toDateInput(today());
    }
    syncIncomeForm();
    openDialog(incomeDlg);
  }

  incomeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = incomeForm.elements;
    var endStr = f.endMode.value === 'date' ? f.endDate.value : '';
    if (f.endMode.value === 'date' && !endStr) return showError(incomeForm, t('errEnd'), f.endDate);
    var common = validateCommon(incomeForm, endStr);
    if (!common) return;
    var kind = f.kind.value === 'variable' ? 'variable' : 'fixed';
    var amount = 0;
    if (kind === 'fixed') {
      amount = readAmount(f.amount);
      if (isNaN(amount)) return showError(incomeForm, t('errAmount'), f.amount);
    }
    var existing = editingIncomeId && find(state.income, editingIncomeId);
    var record = Object.assign(existing || { id: newId(), entries: {} }, common, { kind: kind, amount: amount });
    if (!record.entries) record.entries = {};
    if (!existing) state.income.push(record);
    save();
    render();
    closeDialog(incomeDlg);
  });

  $('[data-delete]', incomeForm).addEventListener('click', function () {
    if (editingIncomeId && deleteItem('income', editingIncomeId)) closeDialog(incomeDlg);
  });

  // ---------- Payment form ----------
  var paymentDlg = $('#payment-dialog');
  var paymentForm = $('#payment-form');
  var editingPaymentId = null;

  function openPaymentForm(p) {
    editingPaymentId = p ? p.id : null;
    paymentForm.reset();
    showError(paymentForm, null);
    var f = paymentForm.elements;
    $('#payment-form-title').textContent = t(p ? 'editBill' : 'addBill');
    $('[data-delete]', paymentForm).hidden = !p;
    if (p) {
      f.name.value = p.name;
      f.amount.value = p.amount;
      f.startDate.value = p.startDate;
      f.day.value = p.day;
      f.endDate.value = p.endDate || '';
    } else {
      f.startDate.value = toDateInput(today());
    }
    openDialog(paymentDlg);
  }

  paymentForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = paymentForm.elements;
    var common = validateCommon(paymentForm, f.endDate.value);
    if (!common) return;
    var amount = readAmount(f.amount);
    if (isNaN(amount)) return showError(paymentForm, t('errAmount'), f.amount);
    var existing = editingPaymentId && find(state.payments, editingPaymentId);
    var record = Object.assign(existing || { id: newId() }, common, { amount: amount });
    if (!existing) state.payments.push(record);
    save();
    render();
    closeDialog(paymentDlg);
  });

  $('[data-delete]', paymentForm).addEventListener('click', function () {
    if (editingPaymentId && deleteItem('payments', editingPaymentId)) closeDialog(paymentDlg);
  });

  // ---------- Log variable income ----------
  var logDlg = $('#log-dialog');
  var logForm = $('#log-form');
  var loggingId = null;

  function renderHistory(inc) {
    var keys = Object.keys(inc.entries || {}).sort().reverse();
    $('#log-history').innerHTML = keys.length ? keys.map(function (k) {
      return '<li><span>' + escapeHtml(monthKeyLabel(k)) + '</span>' +
        '<span class="h-amount">' + money.format(inc.entries[k]) + '</span>' +
        '<button type="button" class="h-del" data-month="' + escapeHtml(k) + '" aria-label="' + escapeHtml(t('delete') + ' ' + monthKeyLabel(k)) + '">' + escapeHtml(t('delete')) + '</button></li>';
    }).join('') : '<li><span class="help">' + escapeHtml(t('noHistory')) + '</span></li>';
  }

  function openLogForm(inc) {
    loggingId = inc.id;
    logForm.reset();
    showError(logForm, null);
    var now = today();
    var key = monthKey(now.getFullYear(), now.getMonth());
    $('#log-form-title').textContent = t('logAmount') + ': ' + inc.name;
    logForm.elements.month.value = key;
    if (inc.entries && typeof inc.entries[key] === 'number') logForm.elements.amount.value = inc.entries[key];
    renderHistory(inc);
    openDialog(logDlg);
  }

  logForm.elements.month.addEventListener('change', function () {
    var inc = find(state.income, loggingId);
    var k = logForm.elements.month.value;
    if (inc && inc.entries && typeof inc.entries[k] === 'number') logForm.elements.amount.value = inc.entries[k];
  });

  logForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var inc = find(state.income, loggingId);
    if (!inc) return closeDialog(logDlg);
    var f = logForm.elements;
    if (!/^\d{4}-\d{2}$/.test(f.month.value)) return showError(logForm, t('errMonth'), f.month);
    var amount = readAmount(f.amount);
    if (isNaN(amount)) return showError(logForm, t('errAmount'), f.amount);
    inc.entries = inc.entries || {};
    inc.entries[f.month.value] = amount;
    save();
    render();
    showError(logForm, null);
    renderHistory(inc);
    closeDialog(logDlg);
  });

  $('#log-history').addEventListener('click', function (e) {
    var btn = e.target.closest('.h-del');
    if (!btn) return;
    var inc = find(state.income, loggingId);
    if (!inc) return;
    var k = btn.getAttribute('data-month');
    if (!confirm(t('confirmRemove', { month: monthKeyLabel(k) }))) return;
    delete inc.entries[k];
    save();
    render();
    renderHistory(inc);
  });

  // ---------- Scanning a payslip ----------
  var scanBox = $('#scan-progress');

  function startScan(file) {
    if (!file) return;
    scanBox.hidden = false;
    $('#scan-bar').style.width = '0%';
    $('#scan-status').textContent = t('reading', { pct: 0 });
    window.Payslip.scan(file, function (pct) {
      $('#scan-bar').style.width = pct + '%';
      $('#scan-status').textContent = t('reading', { pct: pct });
    }).then(function (out) {
      scanBox.hidden = true;
      var r = out.result;
      // A contract usually states only the gross salary: use it as the base salary line.
      if (!r.items.length && r.gross != null) r.items.push({ kind: 'base', amount: r.gross });
      var contract = !r.items.some(function (l) { return window.Payslip.KINDS[l.kind].side === 'deduct'; }) && r.net == null;
      openPayslipForm(null, {
        // A contract's date is when it was signed, not a pay month, so a contract starts on the current month.
        lines: r.items, month: contract ? null : r.month, detectedNet: r.net, text: out.text,
        looksLikeContract: contract
      });
    }, function () {
      $('#scan-bar').style.width = '0%';
      $('#scan-status').textContent = t('readFailed');
    });
  }
  ['#scan-camera', '#scan-file'].forEach(function (sel) {
    $(sel).addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      startScan(f);
    });
  });
  $('#manual-payslip').addEventListener('click', function () { openPayslipForm(null, null); });

  // ---------- Payslip review form ----------
  var slipDlg = $('#payslip-dialog');
  var slipForm = $('#payslip-form');
  var editingSlipId = null, detectedNet = null;

  function kindOptions(side, selected) {
    return Object.keys(window.Payslip.KINDS).filter(function (k) { return window.Payslip.KINDS[k].side === side; })
      .map(function (k) {
        return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + escapeHtml(kindName(k)) + '</option>';
      }).join('');
  }

  function addLineRow(side, line) {
    line = line || { kind: side === 'earn' ? 'base' : 'otherDeduct', amount: '' };
    var row = document.createElement('div');
    row.className = 'line-row';
    row.setAttribute('data-side', side);
    row.innerHTML =
      '<div class="line-main">' +
        '<select class="select" data-k aria-label="' + escapeHtml(t('type')) + '">' + kindOptions(side, line.kind) + '</select>' +
        '<input type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" data-amount aria-label="' + escapeHtml(t('amount')) + '">' +
        '<button type="button" class="line-del" aria-label="' + escapeHtml(t('delete')) + '">×</button>' +
      '</div>' +
      '<div class="line-extra">' +
        '<label class="line-days"><span>' + escapeHtml(t('days')) + '</span><input type="text" inputmode="decimal" autocomplete="off" data-days></label>' +
        '<small class="line-label"></small>' +
      '</div>';
    $('[data-amount]', row).value = line.amount == null || line.amount === '' ? '' : line.amount;
    if (line.amount == null && line.label) row.classList.add('needs-amount');
    $('[data-days]', row).value = line.days || '';
    // Show the payslip's own wording only when it says more than the type name.
    var same = line.label && norm(line.label) === norm(kindName(line.kind));
    $('.line-label', row).textContent = same ? '' : (line.label || '');
    row.setAttribute('data-label', line.label || '');
    syncRow(row);
    $(side === 'earn' ? '#earn-lines' : '#deduct-lines').appendChild(row);
    return row;
  }

  function syncRow(row) {
    var k = $('[data-k]', row).value;
    $('.line-days', row).hidden = !window.Payslip.KINDS[k].days;
  }

  function readRows() {
    var out = [];
    slipForm.querySelectorAll('.line-row').forEach(function (row) {
      var amount = readAmount($('[data-amount]', row));
      if (isNaN(amount) || !amount) return;
      var kind = $('[data-k]', row).value;
      var line = { kind: kind, amount: amount };
      var label = row.getAttribute('data-label');
      if (label) line.label = label;
      var days = parseNumber($('[data-days]', row).value);
      if (window.Payslip.KINDS[kind].days && days > 0) line.days = days;
      out.push(line);
    });
    return out;
  }

  function recalc() {
    var tot = payslipTotals({ lines: readRows() });
    $('#calc-gross').textContent = money.format(tot.gross);
    $('#calc-deduct').textContent = '−' + money.format(tot.deduct);
    $('#calc-net').textContent = money.format(tot.net);
    var warn = $('#payslip-mismatch');
    if (detectedNet != null && Math.abs(detectedNet - tot.net) > 0.05) {
      warn.hidden = false;
      warn.textContent = t('mismatch', { net: money.format(detectedNet), calc: money.format(tot.net) });
    } else {
      warn.hidden = true;
    }
  }

  // Social Security and IRS lines added with the buttons below follow the earnings automatically
  // (they carry data-auto). Typing a different amount into such a line turns that off.
  function findDeductRow(kind) {
    var row = null;
    slipForm.querySelectorAll('#deduct-lines .line-row').forEach(function (r) { if ($('[data-k]', r).value === kind) row = r; });
    return row;
  }

  function irsRate() {
    var field = $('#irs-rate');
    if (!field.value.trim()) { field.classList.remove('invalid'); return null; }
    var rate = parseNumber(field.value);
    var ok = rate >= 0 && rate <= 60;
    field.classList.toggle('invalid', !ok);
    return ok ? rate : NaN;
  }

  function setAutoDeduction(kind) {
    var row = findDeductRow(kind);
    if (!row) row = addLineRow('deduct', { kind: kind, amount: '' });
    row.setAttribute('data-auto', kind);
    row.classList.remove('needs-amount');
  }

  function applyAuto() {
    var base = taxableBase();
    slipForm.querySelectorAll('.line-row[data-auto]').forEach(function (row) {
      var kind = row.getAttribute('data-auto');
      var rate = kind === 'ss' ? 11 : irsRate();
      if (rate == null || isNaN(rate)) return;   // keep the last good amount while the rate is being retyped
      $('[data-amount]', row).value = round2(base * rate / 100).toFixed(2);
    });
  }

  slipForm.addEventListener('input', function (e) {
    var row = e.target.closest('.line-row');
    if (row && e.target.matches('[data-amount]') && row.hasAttribute('data-auto')) {
      // A hand-typed amount wins over the automatic one.
      if (row.getAttribute('data-auto') === 'irs') $('#irs-rate').value = '';
      row.removeAttribute('data-auto');
    }
    if (e.target.id === 'irs-rate') {
      var rate = irsRate();
      if (rate != null && !isNaN(rate)) setAutoDeduction('irs');
    }
    applyAuto();
    recalc();
  });
  slipForm.addEventListener('change', function (e) {
    if (e.target.matches('[data-k]')) {
      var row = e.target.closest('.line-row');
      syncRow(row);
      row.removeAttribute('data-auto');
    }
    applyAuto();
    recalc();
  });
  slipForm.addEventListener('click', function (e) {
    var del = e.target.closest('.line-del');
    if (del) {
      var gone = del.closest('.line-row');
      if (gone.getAttribute('data-auto') === 'irs') $('#irs-rate').value = '';
      gone.remove(); applyAuto(); recalc(); return;
    }
    var add = e.target.closest('[data-add-line]');
    if (add) { $('[data-amount]', addLineRow(add.getAttribute('data-add-line'))).focus(); }
  });

  // Earnings that Social Security and IRS are worked out on (the meal allowance is left out).
  function taxableBase() {
    return readRows().filter(function (l) { return window.Payslip.KINDS[l.kind].side === 'earn' && l.kind !== 'meal'; })
      .reduce(function (s, l) { return s + l.amount; }, 0);
  }

  $('#quick-ss').addEventListener('click', function () { setAutoDeduction('ss'); applyAuto(); recalc(); });
  $('#quick-irs').addEventListener('click', function () {
    var rate = irsRate();
    if (rate == null || isNaN(rate)) { $('#irs-rate').classList.add('invalid'); $('#irs-rate').focus(); return; }
    setAutoDeduction('irs'); applyAuto(); recalc();
  });

  function openPayslipForm(slip, scanned) {
    editingSlipId = slip ? slip.id : null;
    detectedNet = scanned ? scanned.detectedNet : null;
    slipForm.reset();
    showError(slipForm, null);
    $('#earn-lines').innerHTML = '';
    $('#deduct-lines').innerHTML = '';
    var f = slipForm.elements;
    f.incomeId.innerHTML = '<option value="">—</option>' + state.income.map(function (inc) {
      return '<option value="' + inc.id + '">' + escapeHtml(inc.name) + '</option>';
    }).join('');
    var now = today();
    f.month.value = (slip && slip.month) || (scanned && scanned.month) || monthKey(now.getFullYear(), now.getMonth());
    f.incomeId.value = slip ? (slip.incomeId || '') : (state.income.length ? state.income[0].id : '');
    var lines = slip ? slip.lines : (scanned ? scanned.lines : []);
    lines.forEach(function (l) { addLineRow(window.Payslip.KINDS[l.kind].side, l); });
    if (!lines.some(function (l) { return window.Payslip.KINDS[l.kind].side === 'earn'; })) addLineRow('earn');
    $('#payslip-check').hidden = !scanned;
    $('#payslip-contract').hidden = !(scanned && scanned.looksLikeContract);
    $('#ocr-details').hidden = !(scanned && scanned.text);
    $('#ocr-text').textContent = scanned ? scanned.text : '';
    $('[data-delete]', slipForm).hidden = !slip;
    $('#irs-rate').classList.remove('invalid');
    if (slip && slip.irsRate != null) {
      $('#irs-rate').value = String(slip.irsRate).replace('.', ',');
      setAutoDeduction('irs');
    }
    if (slip && slip.autoSS) setAutoDeduction('ss');
    applyAuto();
    recalc();
    openDialog(slipDlg);
  }

  slipForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = slipForm.elements;
    if (!/^\d{4}-\d{2}$/.test(f.month.value)) return showError(slipForm, t('errMonth'), f.month);
    var lines = readRows();
    if (!lines.length) return showError(slipForm, t('errNoLines'));
    var incomeId = f.incomeId.value || null;
    // One payslip per income card per month: a new one for the same month replaces the old one.
    state.payslips = state.payslips.filter(function (p) {
      return p.id === editingSlipId || !(incomeId && p.incomeId === incomeId && p.month === f.month.value);
    });
    var slip = editingSlipId && find(state.payslips, editingSlipId);
    if (!slip) { slip = { id: newId() }; state.payslips.push(slip); }
    slip.month = f.month.value;
    slip.incomeId = incomeId;
    slip.lines = lines;
    var irsRow = findDeductRow('irs');
    var rate = irsRate();
    slip.irsRate = irsRow && irsRow.getAttribute('data-auto') === 'irs' && rate != null && !isNaN(rate) ? rate : null;
    slip.autoSS = !!(findDeductRow('ss') && findDeductRow('ss').getAttribute('data-auto') === 'ss');
    // For a variable income, the payslip's net is that month's logged amount.
    var inc = incomeId && find(state.income, incomeId);
    if (inc && inc.kind === 'variable') {
      inc.entries = inc.entries || {};
      inc.entries[slip.month] = payslipTotals(slip).net;
    }
    save();
    render();
    closeDialog(slipDlg);
  });

  $('[data-delete]', slipForm).addEventListener('click', function () {
    if (editingSlipId && deleteSlip(editingSlipId)) closeDialog(slipDlg);
  });

  function deleteSlip(id) {
    var slip = find(state.payslips, id);
    if (!slip) return false;
    if (!confirm(t('confirmDelete', { name: t('payslips') + ' · ' + monthKeyLabel(slip.month) }))) return false;
    state.payslips = state.payslips.filter(function (p) { return p.id !== id; });
    save();
    render();
    return true;
  }

  // ---------- Extra pay form ----------
  var extraDlg = $('#extra-dialog');
  var extraForm = $('#extra-form');
  var editingExtraId = null;

  function openExtraForm(x) {
    editingExtraId = x ? x.id : null;
    extraForm.reset();
    showError(extraForm, null);
    var f = extraForm.elements;
    f.kind.innerHTML = Object.keys(window.Payslip.KINDS)
      .filter(function (k) { return window.Payslip.KINDS[k].extra || k === 'otherEarn'; })
      .map(function (k) { return '<option value="' + k + '">' + escapeHtml(kindName(k)) + '</option>'; }).join('');
    var now = today();
    f.kind.value = x ? x.kind : 'holiday';
    f.label.value = x ? (x.label || '') : '';
    f.month.value = x ? x.month : monthKey(now.getFullYear(), now.getMonth());
    f.amount.value = x ? x.amount : '';
    f.days.value = x && x.days ? x.days : '';
    $('[data-delete]', extraForm).hidden = !x;
    openDialog(extraDlg);
  }

  extraForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = extraForm.elements;
    if (!/^\d{4}-\d{2}$/.test(f.month.value)) return showError(extraForm, t('errMonth'), f.month);
    var amount = readAmount(f.amount);
    if (isNaN(amount) || !amount) return showError(extraForm, t('errAmount'), f.amount);
    var days = parseNumber(f.days.value);
    var x = editingExtraId && find(state.extras, editingExtraId);
    if (!x) { x = { id: newId() }; state.extras.push(x); }
    x.kind = f.kind.value;
    x.label = f.label.value.trim();
    x.month = f.month.value;
    x.amount = amount;
    x.days = days > 0 ? days : null;
    save();
    render();
    closeDialog(extraDlg);
  });

  $('[data-delete]', extraForm).addEventListener('click', function () {
    if (editingExtraId && deleteItem('extras', editingExtraId)) closeDialog(extraDlg);
  });
  $('#add-extra').addEventListener('click', function () { openExtraForm(null); });

  // ---------- Delete ----------
  function deleteItem(listName, id) {
    var list = state[listName];
    var item = find(list, id);
    if (!item) return false;
    if (!confirm(t('confirmDelete', { name: item.name || item.label || kindName(item.kind) }))) return false;
    state[listName] = list.filter(function (x) { return x.id !== id; });
    // Payslips of a deleted income card stay, just without the link.
    if (listName === 'income') state.payslips.forEach(function (p) { if (p.incomeId === id) p.incomeId = null; });
    save();
    render();
    return true;
  }

  // ---------- Card buttons ----------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    switch (btn.getAttribute('data-action')) {
      case 'edit-income': openIncomeForm(find(state.income, id)); break;
      case 'log-income': openLogForm(find(state.income, id)); break;
      case 'delete-income': deleteItem('income', id); break;
      case 'edit-payment': openPaymentForm(find(state.payments, id)); break;
      case 'delete-payment': deleteItem('payments', id); break;
      case 'edit-payslip': openPayslipForm(find(state.payslips, id), null); break;
      case 'delete-payslip': deleteSlip(id); break;
      case 'edit-extra': openExtraForm(find(state.extras, id)); break;
      case 'delete-extra': deleteItem('extras', id); break;
    }
  });
  $('#add-income').addEventListener('click', function () { openIncomeForm(null); });
  $('#add-payment').addEventListener('click', function () { openPaymentForm(null); });

  // ---------- Backup / restore ----------
  $('#export-btn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bills-backup-' + toDateInput(today()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  $('#import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.income) || !Array.isArray(data.payments)) throw new Error('bad');
        if (!confirm(t('confirmRestore'))) return;
        state = withDefaults(data);
        save();
        render();
      } catch (err) {
        alert(t('badBackup'));
      }
    };
    reader.readAsText(file);
  });

  // Refresh "today" if the app is left open overnight and you come back to it.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  render();
})();

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
  var money, dateFmt, shortDateFmt, monthFmt, relFmt, monthShortFmt, weekdayFmt, moneyShort;

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
      monthShortFmt = new Intl.DateTimeFormat(lang, { month: 'short' });
      weekdayFmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
      moneyShort = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
    } else {
      // This phone has no month names for the language: use numbers only (20.11.2026, 2.500,00 €)
      // so no English words get mixed in.
      money = new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' });
      dateFmt = new Intl.DateTimeFormat('de', { day: '2-digit', month: '2-digit', year: 'numeric' });
      shortDateFmt = new Intl.DateTimeFormat('de', { day: '2-digit', month: '2-digit' });
      monthFmt = new Intl.DateTimeFormat('de', { month: '2-digit', year: 'numeric' });
      monthShortFmt = new Intl.DateTimeFormat('de', { month: '2-digit' });
      weekdayFmt = { format: function () { return ''; } };
      moneyShort = new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
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
      syncPinButton();
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

  var PERIOD = { monthly: 1, quarterly: 3, yearly: 12 };
  function repeatOf(item) { return item.repeat || 'monthly'; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  // Every date inside month (y, m) on which this bill or income happens.
  // Weekly: every 7 days from the start date. Every 3 months / yearly: counted from the start date's month.
  function datesInMonth(item, y, m) {
    var out = [], r = repeatOf(item), start = parseDate(item.startDate);
    if (r === 'once') {                       // a single payment on its start date
      if (start && start.getFullYear() === y && start.getMonth() === m) out.push(start);
      return out;
    }
    if (r === 'weekly') {
      if (!start) return out;
      var first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
      var d = start;
      if (d < first) d = addDays(start, Math.ceil(daysBetween(start, first) / 7) * 7);
      for (; d <= last; d = addDays(d, 7)) if (isWithin(item, d)) out.push(d);
      return out;
    }
    var period = PERIOD[r] || 1;
    if (period > 1 && start) {
      var diff = (y - start.getFullYear()) * 12 + (m - start.getMonth());
      if (diff < 0 || diff % period !== 0) return out;
    }
    var dd = occurrence(y, m, item.day);
    if (isWithin(item, dd)) out.push(dd);
    return out;
  }

  function happensInMonth(item, y, m) { return datesInMonth(item, y, m).length > 0; }

  function isPaid(item, key) { return !!(item.paid && item.paid[key]); }

  // Next date (today or later) this item is due / paid; months already ticked as paid are skipped.
  // null if it has ended.
  function nextDate(item, from) {
    var start = parseDate(item.startDate) || from;
    var end = parseDate(item.endDate);
    var cursor = start > from ? start : from;
    var y = cursor.getFullYear(), m = cursor.getMonth();
    for (var i = 0; i < 40; i++) {
      if (end && new Date(y, m, 1) > end) return null;
      if (!isPaid(item, monthKey(y, m))) {
        var ds = datesInMonth(item, y, m);
        for (var j = 0; j < ds.length; j++) if (ds[j] >= from) return ds[j];
      }
      m++; if (m > 11) { m = 0; y++; }
    }
    return null;
  }

  // What a bill costs in a month: a logged amount for bills that change, times how often it falls in that month.
  function amountFor(item, key) {
    return item.variable && item.entries && typeof item.entries[key] === 'number' ? item.entries[key] : item.amount;
  }
  function owedInMonth(item, y, m) {
    return round2(datesInMonth(item, y, m).length * amountFor(item, monthKey(y, m)));
  }

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
    if (!Array.isArray(data.goals)) data.goals = [];
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
    var ic = $('.theme-icon');
    ic.classList.remove('turn'); void ic.offsetWidth; ic.classList.add('turn');
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

  // ---------- Categories (colours follow the category, never its rank) ----------
  var CATS = [['housing', '🏠'], ['utilities', '💡'], ['transport', '🚗'], ['insurance', '🛡️'],
              ['subscriptions', '📺'], ['loans', '🏦'], ['health', '🩺'], ['other', '📦']];
  function catIndex(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === c) return i; return CATS.length - 1; }
  function catLabel(c) { var i = catIndex(c); return CATS[i][1] + ' ' + t('c_' + CATS[i][0]); }
  function catColor(c) { return 'var(--cat-' + (catIndex(c) + 1) + ')'; }

  // ---------- The month being looked at (arrows at the top) ----------
  var view = (function () { var n = today(); return { y: n.getFullYear(), m: n.getMonth() }; })();
  function isCurrentView() { var n = today(); return view.y === n.getFullYear() && view.m === n.getMonth(); }
  function shiftView(d) { var x = new Date(view.y, view.m + d, 1); view = { y: x.getFullYear(), m: x.getMonth() }; animMode = d > 0 ? 'next' : 'prev'; render(); }

  // ---------- Motion ----------
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var animMode = 'load';      // 'load' | 'next' | 'prev' | null: how the next render enters
  var justToggled = null;     // the bill whose paid tick was just tapped (it gets a little pop)

  // Money amounts count to their new value instead of jumping.
  function setMoney(el, value) {
    var from = parseFloat(el.getAttribute('data-v'));
    el.setAttribute('data-v', value);
    if (reduceMotion || isNaN(from) || from === value || animMode === 'load') { el.textContent = money.format(value); return; }
    var start = performance.now(), dur = 450;
    cancelAnimationFrame(el._raf);
    (function step(now) {
      var k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money.format(round2(from + (value - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(start);
  }

  // Cards, rows and chart parts enter one after another (on first open and when the month changes).
  function playEnter() {
    if (reduceMotion || !animMode) { animMode = null; return; }
    document.body.setAttribute('data-anim', animMode);
    ['.summary', '#income-list', '#payment-list', '#coming-list', '#goal-list', '#extra-list', '#payslip-list', '#cat-chart .legend'].forEach(function (sel) {
      var box = $(sel); if (!box) return;
      Array.prototype.forEach.call(box.children, function (el, i) { el.style.setProperty('--i', Math.min(i, 8)); });
    });
    document.querySelectorAll('.hist-group').forEach(function (g, i) { g.style.setProperty('--i', i); });
    clearTimeout(playEnter._t);
    playEnter._t = setTimeout(function () { document.body.removeAttribute('data-anim'); }, 900);
    animMode = null;
  }

  // Everything that adds up for one month.
  function monthTotals(y, m) {
    var key = monthKey(y, m), r = { income: 0, owe: 0, paid: 0, goals: 0, notLogged: [], byCat: {} };
    state.income.forEach(function (inc) {
      // A payslip for the month shows what really arrived, so it wins over the card's amount.
      var slip = payslipFor(inc.id, key);
      if (slip) r.income += payslipTotals(slip).net;
      else if (inc.kind === 'variable') {
        var logged = inc.entries && inc.entries[key];
        if (typeof logged === 'number') r.income += logged;
        else if (happensInMonth(inc, y, m)) r.notLogged.push(inc.name);
      } else if (happensInMonth(inc, y, m)) r.income += inc.amount;
    });
    // Extra pay entered by hand counts too (extras read from a payslip are already in its net).
    state.extras.forEach(function (x) { if (x.month === key) r.income += x.amount; });
    state.payments.forEach(function (p) {
      var owed = owedInMonth(p, y, m);
      if (!owed) return;
      r.owe += owed;
      if (isPaid(p, key)) r.paid += owed;
      var c = p.category || 'other';
      r.byCat[c] = (r.byCat[c] || 0) + owed;
    });
    state.goals.forEach(function (g) { r.goals += (g.moves && g.moves[key]) || 0; });
    r.income = round2(r.income); r.owe = round2(r.owe); r.paid = round2(r.paid); r.goals = round2(r.goals);
    r.still = round2(r.owe - r.paid);
    r.left = round2(r.income - r.owe - r.goals);
    return r;
  }

  function render() {
    var now = today();
    var y = view.y, m = view.m;
    var key = monthKey(y, m);
    var current = isCurrentView();
    $('#month-current').textContent = monthFmt.format(new Date(y, m, 1));
    $('#month-current').classList.toggle('is-other', !current);
    $('#prev-month').setAttribute('aria-label', monthFmt.format(new Date(y, m - 1, 1)));
    $('#next-month').setAttribute('aria-label', monthFmt.format(new Date(y, m + 1, 1)));

    var tot = monthTotals(y, m);
    setMoney($('#total-income'), tot.income);
    setMoney($('#total-owe'), tot.owe);
    setMoney($('#still-to-pay'), tot.still);
    var leftEl = $('#left-over');
    setMoney(leftEl, tot.left);
    leftEl.className = 'stat-value ' + (tot.left < 0 ? 'negative' : tot.left > 0 ? 'positive' : '');

    var note = $('#summary-note');
    note.hidden = !tot.notLogged.length;
    note.textContent = tot.notLogged.length ? t('notLogged', { month: monthFmt.format(new Date(y, m, 1)), names: tot.notLogged.join(', ') }) : '';
    var gNote = $('#goals-note');
    gNote.hidden = !tot.goals;
    gNote.textContent = tot.goals ? t('movedToGoals', { amount: money.format(tot.goals) }) : '';

    renderComingUp(now);

    // Income cards
    var incList = $('#income-list');
    if (!state.income.length) {
      incList.innerHTML = '<div class="empty">' + escapeHtml(t('emptyIncome')) + '</div>';
    } else {
      incList.innerHTML = sortByNext(state.income, now).map(function (row) {
        var inc = row.item, next = row.next;
        var isVar = inc.kind === 'variable';
        var amount, lastKey;
        if (isVar) {
          var v = inc.entries && inc.entries[key];
          amount = typeof v === 'number' ? money.format(v) : '—';
          var keys = Object.keys(inc.entries || {}).sort();
          lastKey = keys[keys.length - 1];
        } else {
          amount = money.format(inc.amount);
        }
        var inMonth = datesInMonth(inc, y, m)[0];
        var due = current ? dueLabel(next, now, 'payday')
          : inMonth ? { text: t('payday') + ': ' + shortDateFmt.format(inMonth), cls: 'accent' } : { text: t('notDue'), cls: '' };
        var slip = payslipFor(inc.id, key);
        return '' +
          '<article class="card' + (next || (isVar && amount !== '—') ? '' : ' is-inactive') + '">' +
            '<div class="card-top">' +
              '<div class="card-name">' + escapeHtml(inc.name) + '</div>' +
              '<div class="card-amount positive">' + amount + '</div>' +
            '</div>' +
            '<div class="badges">' +
              '<span class="badge">' + escapeHtml(t(isVar ? 'variable' : 'fixed')) + '</span>' +
              '<span class="badge ' + (due.cls === 'warn' ? 'ok' : due.cls) + '">' + escapeHtml(due.text) + '</span>' +
              (slip ? '<span class="badge ok">' + escapeHtml(t('net')) + ': ' + money.format(payslipTotals(slip).net) + '</span>' : '') +
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

    // Payment cards: still to pay this month first (by date), then paid, then bills not due this month.
    var payList = $('#payment-list');
    if (!state.payments.length) {
      payList.innerHTML = '<div class="empty">' + escapeHtml(t('emptyBills')) + '</div>';
    } else {
      var rows = state.payments.map(function (p) {
        var st = billState(p, y, m, now);
        var next = nextDate(p, now);
        // Sort key: overdue bills first, then by their next date in this month.
        var when = st.overdue ? st.ds[0] : (current ? (st.upcoming[0] || next) : st.ds[0]);
        return { p: p, ds: st.ds, st: st, paid: st.paid, next: next, when: when,
                 group: !st.active ? 2 : st.paid ? 1 : 0 };
      }).sort(function (a, b) {
        if (a.group !== b.group) return a.group - b.group;
        var da = a.group === 2 ? a.next : a.when, db = b.group === 2 ? b.next : b.when;
        if (!da && !db) return a.p.name.localeCompare(b.p.name);
        if (!da) return 1;
        if (!db) return -1;
        return da - db || a.p.name.localeCompare(b.p.name);
      });
      payList.innerHTML = rows.map(renderPaymentCard).join('');
    }

    renderCategories(tot);
    renderHistory6();
    renderPayslips();
    renderExtras(y);
    renderGoals(tot);
    playEnter();
    justToggled = null;
  }

  // A bill's state in the viewed month. Weekly bills are never "overdue": only their coming dates matter.
  function billState(p, y, m, now) {
    var ds = datesInMonth(p, y, m), key = monthKey(y, m), paid = isPaid(p, key);
    var upcoming = ds.filter(function (d) { return d >= now; });
    var overdue = !paid && repeatOf(p) !== 'weekly' && ds.length > 0 && ds[ds.length - 1] < now;
    var active = ds.length > 0 && (repeatOf(p) !== 'weekly' || upcoming.length > 0 || now < new Date(y, m, 1) || paid);
    return { ds: ds, paid: paid, overdue: overdue, upcoming: upcoming, active: active };
  }

  function renderPaymentCard(row) {
    var p = row.p, now = today(), key = monthKey(view.y, view.m);
    var due, owed = owedInMonth(p, view.y, view.m);
    if (row.paid) due = { text: t('paidOn', { date: shortDateFmt.format(parseDate(p.paid[key]) || row.ds[0]) }), cls: 'ok' };
    else if (row.st.overdue) due = { text: t('overdue'), cls: 'warn' };
    else if (!row.st.active) due = row.next && isCurrentView() ? dueLabel(row.next, now, 'due') : { text: t('notDue'), cls: '' };
    else if (isCurrentView()) due = dueLabel(row.st.upcoming[0] || row.ds[0], now, 'due');
    else due = { text: t('due') + ': ' + shortDateFmt.format(row.ds[0]), cls: 'accent' };
    var r = repeatOf(p), period = PERIOD[r] || 1;
    var check = row.ds.length
      ? '<button type="button" class="check' + (row.paid ? ' on' : '') + '" data-action="toggle-paid" data-id="' + p.id + '" aria-pressed="' + row.paid + '" aria-label="' + escapeHtml(t('paid') + ': ' + p.name) + '">✓</button>'
      : '<span class="check off" aria-hidden="true"></span>';
    return '' +
      '<article class="card pay-card' + (row.paid ? ' paid' : '') + (p.id === justToggled ? ' just-toggled' : '') + (row.next || row.ds.length ? '' : ' is-inactive') + '">' +
        '<div class="pay-row">' + check +
        '<div class="pay-body">' +
          '<div class="card-top">' +
            '<div class="card-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="card-amount">' + money.format(owed || amountFor(p, key)) + '</div>' +
          '</div>' +
          '<div class="badges">' +
            '<span class="badge ' + due.cls + '">' + escapeHtml(due.text) + '</span>' +
            '<span class="badge">' + escapeHtml(catLabel(p.category)) + '</span>' +
            (r !== 'monthly' ? '<span class="badge">' + escapeHtml(t('r_' + r)) + '</span>' : '') +
            (period > 1 ? '<span class="badge accent">' + escapeHtml(t('setAside', { amount: money.format(round2(p.amount / period)) })) + '</span>' : '') +
            (p.variable ? '<span class="badge">' + escapeHtml(t('changesMonthly')) + '</span>' : '') +
          '</div>' +
        '</div></div>' +
        (p.variable ? sparkline(p) : '') +
        '<dl class="card-meta">' +
          (r === 'once' ? '' : '<div><dt>' + escapeHtml(t('nextDue')) + '</dt><dd>' + (row.next ? dateFmt.format(row.next) : escapeHtml(t('ended'))) + '</dd></div>') +
          (r === 'once' ? '<div><dt>' + escapeHtml(t('dueDate')) + '</dt><dd>' + dateFmt.format(parseDate(p.startDate)) + '</dd></div>' :
          (r === 'weekly' ? '' : '<div><dt>' + escapeHtml(t('dueOnDay')) + '</dt><dd>' + p.day + '</dd></div>') +
          '<div><dt>' + escapeHtml(t('startDate')) + '</dt><dd>' + dateFmt.format(parseDate(p.startDate)) + '</dd></div>' +
          '<div><dt>' + escapeHtml(t('endDate')) + '</dt><dd>' + (p.endDate ? dateFmt.format(parseDate(p.endDate)) : '—') + '</dd></div>') +
        '</dl>' +
        '<div class="card-actions">' +
          (p.variable ? '<button class="btn btn-primary btn-small" type="button" data-action="log-payment" data-id="' + p.id + '">' + escapeHtml(t('logAmount')) + '</button>' : '') +
          '<button class="btn btn-ghost btn-small" type="button" data-action="edit-payment" data-id="' + p.id + '">' + escapeHtml(t('edit')) + '</button>' +
          '<button class="btn btn-danger btn-small" type="button" data-action="delete-payment" data-id="' + p.id + '">' + escapeHtml(t('delete')) + '</button>' +
        '</div>' +
      '</article>';
  }

  // Small trend line of the last 6 logged months for a bill that changes.
  function sparkline(p) {
    var pts = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(view.y, view.m - i, 1), k = monthKey(d.getFullYear(), d.getMonth());
      if (p.entries && typeof p.entries[k] === 'number') pts.push({ k: k, v: p.entries[k], i: 5 - i });
    }
    if (pts.length < 2) return '';
    var min = Math.min.apply(null, pts.map(function (x) { return x.v; })), max = Math.max.apply(null, pts.map(function (x) { return x.v; }));
    var span = max - min || 1, W = 300, H = 40;
    var xy = pts.map(function (x) { return [6 + x.i * (W - 12) / 5, 6 + (1 - (x.v - min) / span) * (H - 12)]; });
    var last = xy[xy.length - 1], a = pts[0], b = pts[pts.length - 1];
    return '<div class="spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + escapeHtml(t('lastMonths')) + '">' +
      '<polyline fill="none" stroke="var(--cat-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="' +
      xy.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '"/></svg>' +
      '<span class="spark-dot" style="left:' + (last[0] / W * 100) + '%;top:' + (last[1] / H * 100) + '%"></span>' +
      '<div class="spark-labels"><span>' + escapeHtml(shortMonth(a.k)) + ' ' + money.format(a.v) + '</span><span>' +
      escapeHtml(shortMonth(b.k)) + ' ' + money.format(b.v) + '</span></div></div>';
  }

  function shortMonth(key) {
    var p = key.split('-').map(Number);
    return monthShortFmt.format(new Date(p[0], p[1] - 1, 1));
  }

  // ---------- Next 14 days (always counted from today) ----------
  function renderComingUp(now) {
    var until = addDays(now, 13), items = [], dueSum = 0;
    for (var k = 0; k < 2; k++) {
      var d0 = new Date(now.getFullYear(), now.getMonth() + k, 1), yy = d0.getFullYear(), mm = d0.getMonth(), mk = monthKey(yy, mm);
      state.payments.forEach(function (p) {
        if (isPaid(p, mk)) return;
        datesInMonth(p, yy, mm).forEach(function (d) {
          var overdue = d < now && k === 0 && repeatOf(p) !== 'weekly' && d.getTime() === datesInMonth(p, yy, mm).slice(-1)[0].getTime();
          if ((d >= now && d <= until) || overdue) {
            var amt = amountFor(p, mk);
            dueSum += amt;
            items.push({ d: d, name: p.name, amount: amt, bill: true, overdue: overdue });
          }
        });
      });
      state.income.forEach(function (inc) {
        datesInMonth(inc, yy, mm).forEach(function (d) {
          if (d >= now && d <= until) items.push({ d: d, name: inc.name, amount: inc.kind === 'fixed' ? inc.amount : null, bill: false });
        });
      });
    }
    items.sort(function (a, b) { return a.d - b.d; });
    var badge = $('#coming-total');
    badge.hidden = !dueSum;
    badge.textContent = t('due') + ': ' + money.format(round2(dueSum));
    $('#coming-list').innerHTML = items.length ? items.map(function (it) {
      var n = daysBetween(now, it.d);
      var when = it.overdue ? t('overdue') : it.bill ? (relFmt ? relFmt.format(n, 'day') : shortDateFmt.format(it.d)) : t('payday');
      return '<li class="' + (it.overdue ? 'is-overdue' : '') + '"><div class="tl-date"><b>' + it.d.getDate() + '</b><small>' + escapeHtml(weekdayFmt.format(it.d)) + '</small></div>' +
        '<div class="tl-body"><b>' + escapeHtml(it.name) + '</b><span class="help">' + escapeHtml(when) + '</span></div>' +
        '<b class="tl-amt' + (it.bill ? '' : ' positive') + '">' + (it.amount == null ? '—' : (it.bill ? '' : '+') + money.format(it.amount)) + '</b></li>';
    }).join('') : '<li class="tl-empty">' + escapeHtml(t('nothingDue')) + '</li>';
  }

  // ---------- Where your money goes (ring chart + list with every value) ----------
  function renderCategories(tot) {
    var cats = Object.keys(tot.byCat).filter(function (c) { return tot.byCat[c] > 0; })
      .sort(function (a, b) { return tot.byCat[b] - tot.byCat[a] || catIndex(a) - catIndex(b); });
    $('#cat-section').hidden = !cats.length;
    if (!cats.length) { $('#cat-chart').innerHTML = ''; return; }
    var total = tot.owe, R = 70, C = 2 * Math.PI * R, gap = cats.length > 1 ? 2 : 0, off = 0;
    var segs = cats.map(function (c) {
      var len = tot.byCat[c] / total * C;
      var seg = '<circle r="' + R + '" fill="none" stroke="' + catColor(c) + '" stroke-width="26" stroke-dasharray="' +
        Math.max(len - gap, 0.5).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '">' +
        '<title>' + escapeHtml(catLabel(c) + ': ' + money.format(tot.byCat[c])) + '</title></circle>';
      off += len;
      return seg;
    }).join('');
    $('#cat-chart').innerHTML =
      '<p class="chart-sub">' + escapeHtml(monthFmt.format(new Date(view.y, view.m, 1))) + '</p>' +
      '<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="' + escapeHtml(t('whereMoney')) + '">' +
        '<g transform="translate(100,100) rotate(-90)">' + segs + '</g>' +
        '<text x="100" y="94" text-anchor="middle" class="donut-label">' + escapeHtml(t('toPay')) + '</text>' +
        '<text x="100" y="116" text-anchor="middle" class="donut-value">' + escapeHtml(money.format(total)) + '</text>' +
      '</svg>' +
      '<ul class="legend">' + cats.map(function (c) {
        return '<li><span class="sw" style="background:' + catColor(c) + '"></span><span class="lg-name">' + escapeHtml(catLabel(c)) + '</span>' +
          '<span class="lg-val">' + money.format(tot.byCat[c]) + '</span><span class="lg-pct">' + Math.round(tot.byCat[c] / total * 100) + '%</span></li>';
      }).join('') + '</ul>';
  }

  // ---------- Last 6 months: income and bills side by side; tap a month to open it ----------
  function niceMax(v) {
    if (v <= 0) return 100;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    // Steps whose halves are round too (so the middle gridline reads e.g. 1.5k, not 1.25k).
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * e;
  }

  function renderHistory6() {
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(view.y, view.m - i, 1), tt = monthTotals(d.getFullYear(), d.getMonth());
      months.push({ y: d.getFullYear(), m: d.getMonth(), inc: tt.income, owe: tt.owe, left: round2(tt.income - tt.owe) });
    }
    var max = niceMax(Math.max.apply(null, months.map(function (x) { return Math.max(x.inc, x.owe); })));
    var W = 340, top = 18, base = 150, h = base - top, x0 = 62, step = (W - x0) / 6, bw = Math.min(16, step / 2 - 4);
    function bar(x, v, color) {
      var hh = v / max * h; if (hh <= 0) return '';
      var r = Math.min(4, hh), yv = base - hh;
      return '<path fill="' + color + '" d="M' + x + ',' + base + ' V' + (yv + r) + ' Q' + x + ',' + yv + ' ' + (x + r) + ',' + yv +
        ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + yv + ' ' + (x + bw) + ',' + (yv + r) + ' V' + base + ' Z"/>';
    }
    var grid = [0, 0.5, 1].map(function (f) {
      var yy = base - f * h;
      return '<line x1="' + x0 + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>' +
        '<text x="' + (x0 - 6) + '" y="' + (yy + 3) + '" text-anchor="end" class="axis">' + escapeHtml(moneyShort.format(max * f)) + '</text>';
    }).join('');
    var groups = months.map(function (mo, i) {
      var gx = x0 + i * step, cx = gx + step / 2, sel = mo.y === view.y && mo.m === view.m;
      var label = monthFmt.format(new Date(mo.y, mo.m, 1));
      return '<g class="hist-group' + (sel ? ' sel' : '') + '" data-month="' + mo.y + '-' + mo.m + '" tabindex="0" role="button" aria-label="' +
          escapeHtml(label + ': ' + t('income') + ' ' + money.format(mo.inc) + ', ' + t('payments') + ' ' + money.format(mo.owe)) + '">' +
        '<title>' + escapeHtml(label + '\n' + t('income') + ': ' + money.format(mo.inc) + '\n' + t('payments') + ': ' + money.format(mo.owe) + '\n' + t('leftOver') + ': ' + money.format(mo.left)) + '</title>' +
        '<rect class="hit" x="' + gx + '" y="0" width="' + step + '" height="' + (base + 24) + '"/>' +
        bar(cx - bw - 1, mo.inc, 'var(--cat-1)') + bar(cx + 1, mo.owe, 'var(--cat-2)') +
        '<text x="' + cx + '" y="' + (base + 16) + '" text-anchor="middle" class="axis' + (sel ? ' axis-sel' : '') + '">' +
          escapeHtml(monthShortFmt.format(new Date(mo.y, mo.m, 1))) + '</text></g>';
    }).join('');
    var withData = months.filter(function (x) { return x.inc || x.owe; });
    var avg = withData.length ? round2(withData.reduce(function (s2, x) { return s2 + x.left; }, 0) / withData.length) : 0;
    var best = withData.slice().sort(function (a, b) { return b.left - a.left; })[0];
    $('#hist-chart').innerHTML =
      '<div class="chart-legend"><span><i style="background:var(--cat-1)"></i>' + escapeHtml(t('income')) + '</span>' +
        '<span><i style="background:var(--cat-2)"></i>' + escapeHtml(t('payments')) + '</span></div>' +
      '<svg class="hist" viewBox="0 0 ' + W + ' ' + (base + 24) + '" role="img" aria-label="' + escapeHtml(t('lastMonths')) + '">' + grid + groups + '</svg>' +
      (withData.length ? '<div class="hist-stats"><div><span>' + escapeHtml(t('avgLeft')) + '</span><strong class="' + (avg < 0 ? 'negative' : 'positive') + '">' + money.format(avg) + '</strong></div>' +
        '<div><span>' + escapeHtml(t('bestMonth')) + '</span><strong>' + escapeHtml(monthFmt.format(new Date(best.y, best.m, 1))) + '</strong></div></div>' : '');
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
    function done() {
      dlg.classList.remove('closing');
      if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    }
    if (reduceMotion || !dlg.open) return done();
    dlg.classList.add('closing');
    setTimeout(done, 160);
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
  function validateCommon(form, endDateStr, noDay) {
    var f = form.elements;
    var name = f.name.value.trim();
    if (!name) return showError(form, t('errName'), f.name), null;
    var start = parseDate(f.startDate.value);
    if (!start) return showError(form, t('errStart'), f.startDate), null;
    var day = noDay ? start.getDate() : Number(f.day.value);
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

  function syncPaymentForm() {
    var f = paymentForm.elements, r = f.repeat.value, period = PERIOD[r] || 1;
    $('[data-day-field]', paymentForm).hidden = r === 'weekly' || r === 'once';
    $('[data-end-field]', paymentForm).hidden = r === 'once';
    $('[data-start-label]', paymentForm).textContent = t(r === 'once' ? 'dueDate' : 'startDate');
    $('[data-amount-label]', paymentForm).textContent = f.variable.checked ? t('usualAmount') : t('amount');
    var amt = parseNumber(f.amount.value), note = $('#set-aside-note');
    note.hidden = !(period > 1 && amt > 0);
    if (!note.hidden) note.textContent = '💡 ' + t('setAside', { amount: money.format(round2(amt / period)) });
  }
  paymentForm.addEventListener('change', function (e) {
    // Switching to one-time: put the date on the day the bill would have been due.
    if (e.target.name === 'repeat' && e.target.value === 'once') {
      var f = paymentForm.elements, st = parseDate(f.startDate.value), day = Number(f.day.value);
      if (st && day >= 1 && day <= 31) {
        var d = occurrence(st.getFullYear(), st.getMonth(), day);
        if (d < st) d = occurrence(st.getFullYear(), st.getMonth() + 1, day);
        f.startDate.value = toDateInput(d);
      }
    }
    syncPaymentForm();
  });
  paymentForm.addEventListener('input', syncPaymentForm);

  function openPaymentForm(p) {
    editingPaymentId = p ? p.id : null;
    paymentForm.reset();
    showError(paymentForm, null);
    var f = paymentForm.elements;
    f.category.innerHTML = CATS.map(function (c) { return '<option value="' + c[0] + '">' + escapeHtml(catLabel(c[0])) + '</option>'; }).join('');
    f.category.value = p ? (p.category || 'other') : 'housing';
    f.repeat.value = p ? repeatOf(p) : 'monthly';
    f.variable.checked = !!(p && p.variable);
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
    syncPaymentForm();
    openDialog(paymentDlg);
  }

  paymentForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = paymentForm.elements;
    var repeat = f.repeat.value || 'monthly';
    var once = repeat === 'once';
    var common = validateCommon(paymentForm, once ? '' : f.endDate.value, repeat === 'weekly' || once);
    if (!common) return;
    var amount = readAmount(f.amount);
    if (isNaN(amount)) return showError(paymentForm, t('errAmount'), f.amount);
    var existing = editingPaymentId && find(state.payments, editingPaymentId);
    var record = Object.assign(existing || { id: newId(), paid: {} }, common, {
      amount: amount, category: f.category.value, repeat: repeat, variable: f.variable.checked
    });
    if (record.variable && !record.entries) record.entries = {};
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
  var loggingId = null, loggingList = 'income';

  function renderHistory(inc) {
    var keys = Object.keys(inc.entries || {}).sort().reverse();
    $('#log-history').innerHTML = keys.length ? keys.map(function (k) {
      return '<li><span>' + escapeHtml(monthKeyLabel(k)) + '</span>' +
        '<span class="h-amount">' + money.format(inc.entries[k]) + '</span>' +
        '<button type="button" class="h-del" data-month="' + escapeHtml(k) + '" aria-label="' + escapeHtml(t('delete') + ' ' + monthKeyLabel(k)) + '">' + escapeHtml(t('delete')) + '</button></li>';
    }).join('') : '<li><span class="help">' + escapeHtml(t('noHistory')) + '</span></li>';
  }

  function openLogForm(inc, list) {
    loggingId = inc.id;
    loggingList = list || 'income';
    logForm.reset();
    showError(logForm, null);
    var now = today();
    var key = loggingList === 'payments' ? monthKey(view.y, view.m) : monthKey(now.getFullYear(), now.getMonth());
    $('#log-form-title').textContent = t('logAmount') + ': ' + inc.name;
    logForm.elements.month.value = key;
    if (inc.entries && typeof inc.entries[key] === 'number') logForm.elements.amount.value = inc.entries[key];
    renderHistory(inc);
    openDialog(logDlg);
  }

  logForm.elements.month.addEventListener('change', function () {
    var inc = find(state[loggingList], loggingId);
    var k = logForm.elements.month.value;
    if (inc && inc.entries && typeof inc.entries[k] === 'number') logForm.elements.amount.value = inc.entries[k];
  });

  logForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var inc = find(state[loggingList], loggingId);
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
    var inc = find(state[loggingList], loggingId);
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

  // ---------- Paid ticks ----------
  function togglePaid(id) {
    var p = find(state.payments, id);
    if (!p) return;
    var key = monthKey(view.y, view.m);
    p.paid = p.paid || {};
    justToggled = id;
    if (p.paid[key]) delete p.paid[key];
    else {
      var n = today(), ds = datesInMonth(p, view.y, view.m);
      // The date it was ticked, or the due date when ticking a past or future month.
      p.paid[key] = toDateInput(isCurrentView() ? n : (ds[0] || new Date(view.y, view.m, 1)));
    }
    save();
    render();
  }

  // ---------- Month arrows and chart taps ----------
  $('#prev-month').addEventListener('click', function () { shiftView(-1); });
  $('#next-month').addEventListener('click', function () { shiftView(1); });
  $('#month-current').addEventListener('click', function () {
    var n = today(), back = new Date(n.getFullYear(), n.getMonth(), 1) < new Date(view.y, view.m, 1);
    view = { y: n.getFullYear(), m: n.getMonth() }; animMode = back ? 'prev' : 'next'; render();
  });
  function pickHistMonth(e) {
    var g = e.target.closest && e.target.closest('.hist-group');
    if (!g) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    var parts = g.getAttribute('data-month').split('-').map(Number);
    animMode = new Date(parts[0], parts[1], 1) < new Date(view.y, view.m, 1) ? 'prev' : 'next';
    view = { y: parts[0], m: parts[1] };
    render();
    $('#month-current').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#hist-chart').addEventListener('click', pickHistMonth);
  $('#hist-chart').addEventListener('keydown', pickHistMonth);

  // ---------- Savings goals ----------
  function goalLeft(g) { return round2(Math.max(0, g.target - g.saved)); }
  function goalPerMonth(g) {
    if (!g.by || goalLeft(g) <= 0) return null;
    var n = today(), p2 = g.by.split('-').map(Number);
    var months = (p2[0] - n.getFullYear()) * 12 + (p2[1] - 1 - n.getMonth()) + 1;
    return months > 0 ? round2(goalLeft(g) / months) : goalLeft(g);
  }

  function renderGoals(tot) {
    var list = $('#goal-list');
    if (!state.goals.length) {
      list.innerHTML = '<div class="empty">' + escapeHtml(t('emptyGoals')) + '</div>';
    } else {
      list.innerHTML = state.goals.map(function (g) {
        var pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
        var per = goalPerMonth(g), done = goalLeft(g) <= 0;
        return '<article class="card">' +
          '<div class="card-top"><div class="card-name">' + escapeHtml(g.name) + '</div>' +
          '<div class="card-amount">' + money.format(g.saved) + ' <span class="of">/ ' + money.format(g.target) + '</span></div></div>' +
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
          '<div class="badges"><span class="badge accent">' + pct + '%</span>' +
            (done ? '<span class="badge ok">🎉 ' + escapeHtml(t('reached')) + '</span>' : '') +
            (per ? '<span class="badge">' + escapeHtml(t('perMonthUntil', { amount: money.format(per), month: monthKeyLabel(g.by) })) + '</span>' : '') +
          '</div>' +
          '<div class="card-actions">' +
            (done ? '' : '<button class="btn btn-primary btn-small" type="button" data-action="goal-money" data-id="' + g.id + '">+ ' + escapeHtml(t('addMoney')) + '</button>') +
            '<button class="btn btn-ghost btn-small" type="button" data-action="edit-goal" data-id="' + g.id + '">' + escapeHtml(t('edit')) + '</button>' +
            '<button class="btn btn-danger btn-small" type="button" data-action="delete-goal" data-id="' + g.id + '">' + escapeHtml(t('delete')) + '</button>' +
          '</div></article>';
      }).join('');
    }
    // A gentle nudge when this month has money left over and a goal still needs some.
    var nudge = $('#goal-nudge'), open = state.goals.filter(function (g) { return goalLeft(g) > 0; })[0];
    var dismissed = null;
    try { dismissed = localStorage.getItem('bills-goal-nudge'); } catch (e) {}
    var n = today(), curKey = monthKey(n.getFullYear(), n.getMonth());
    if (isCurrentView() && open && tot.left > 0 && dismissed !== curKey) {
      var suggest = Math.min(goalLeft(open), goalPerMonth(open) || Math.max(5, Math.round(tot.left * 0.1 / 5) * 5), tot.left);
      nudge.innerHTML = '<article class="card nudge"><p>' + escapeHtml(t('moveToGoal', { amount: money.format(tot.left) })) + '</p>' +
        '<div class="card-actions"><button class="btn btn-primary btn-small" type="button" data-action="goal-money" data-id="' + open.id + '" data-suggest="' + suggest + '">+ ' +
        escapeHtml(money.format(suggest)) + ' → ' + escapeHtml(open.name) + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-action="goal-nudge-close">' + escapeHtml(t('cancel')) + '</button></div></article>';
    } else nudge.innerHTML = '';
  }

  var goalDlg = $('#goal-dialog'), goalForm = $('#goal-form'), editingGoalId = null;
  function openGoalForm(g) {
    editingGoalId = g ? g.id : null;
    goalForm.reset();
    showError(goalForm, null);
    var f = goalForm.elements;
    if (g) { f.name.value = g.name; f.target.value = g.target; f.saved.value = g.saved || ''; f.by.value = g.by || ''; }
    $('[data-delete]', goalForm).hidden = !g;
    openDialog(goalDlg);
  }
  goalForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = goalForm.elements;
    var name = f.name.value.trim();
    if (!name) return showError(goalForm, t('errName'), f.name);
    var target = readAmount(f.target);
    if (isNaN(target) || !target) return showError(goalForm, t('errAmount'), f.target);
    var saved = f.saved.value.trim() ? readAmount(f.saved) : 0;
    if (isNaN(saved)) return showError(goalForm, t('errAmount'), f.saved);
    var g = editingGoalId && find(state.goals, editingGoalId);
    if (!g) { g = { id: newId(), moves: {} }; state.goals.push(g); }
    g.name = name; g.target = target; g.saved = saved; g.by = /^\d{4}-\d{2}$/.test(f.by.value) ? f.by.value : null;
    save(); render(); closeDialog(goalDlg);
  });
  $('[data-delete]', goalForm).addEventListener('click', function () {
    if (editingGoalId && deleteItem('goals', editingGoalId)) closeDialog(goalDlg);
  });
  $('#add-goal').addEventListener('click', function () { openGoalForm(null); });

  var moneyDlg = $('#money-dialog'), moneyForm = $('#money-form'), moneyGoalId = null;
  function openMoneyForm(g, suggest) {
    if (!g) return;
    moneyGoalId = g.id;
    moneyForm.reset();
    showError(moneyForm, null);
    $('#money-title').textContent = t('addMoney') + ': ' + g.name;
    if (suggest) moneyForm.elements.amount.value = String(suggest).replace('.', ',');
    openDialog(moneyDlg);
  }
  moneyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var g = find(state.goals, moneyGoalId);
    if (!g) return closeDialog(moneyDlg);
    var amt = readAmount(moneyForm.elements.amount);
    if (isNaN(amt) || !amt) return showError(moneyForm, t('errAmount'), moneyForm.elements.amount);
    var n = today(), k = monthKey(n.getFullYear(), n.getMonth());
    g.saved = round2((g.saved || 0) + amt);
    g.moves = g.moves || {};
    g.moves[k] = round2((g.moves[k] || 0) + amt);   // counts as money set aside this month
    save(); render(); closeDialog(moneyDlg);
  });

  // ---------- Calendar reminders (.ics file the phone's calendar imports) ----------
  function icsDate(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function icsText(s2) { return String(s2).replace(/\\/g, '\\\\').replace(/[,;]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
  function monthDayRule(day) {
    // "Day 31" means the last day in shorter months.
    if (day <= 28) return 'BYMONTHDAY=' + day;
    var days = []; for (var d = day; d >= 28; d--) days.push(d);
    return 'BYMONTHDAY=' + days.join(',') + ';BYSETPOS=-1';
  }
  function makeIcs() {
    var now = today(), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bills Dashboard//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    state.payments.forEach(function (p) {
      var first = nextDate(p, new Date(now.getFullYear(), now.getMonth(), 1));
      if (!first) return;
      var r = repeatOf(p), rule;
      if (r === 'once') rule = null;
      else if (r === 'weekly') rule = 'FREQ=WEEKLY';
      else if (r === 'yearly') rule = 'FREQ=YEARLY;BYMONTH=' + (first.getMonth() + 1) + ';' + monthDayRule(p.day);
      else rule = 'FREQ=MONTHLY;' + (r === 'quarterly' ? 'INTERVAL=3;' : '') + monthDayRule(p.day);
      if (rule && p.endDate) rule += ';UNTIL=' + p.endDate.replace(/-/g, '');
      var title = '💶 ' + p.name + ' · ' + money.format(p.amount);
      var ev = ['BEGIN:VEVENT', 'UID:bill-' + p.id + '@bills-dashboard', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + icsDate(first), 'DTEND;VALUE=DATE:' + icsDate(addDays(first, 1))];
      if (rule) ev.push('RRULE:' + rule);                       // one-time bills have no repeat rule
      ev.push('SUMMARY:' + icsText(title), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title), 'TRIGGER:-P1DT15H', 'END:VALARM',  // 09:00, 2 days before
        'END:VEVENT');
      out.push.apply(out, ev);
    });
    out.push('END:VCALENDAR');
    return out.join('\r\n') + '\r\n';
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('#add-reminders').addEventListener('click', function () {
    if (!state.payments.length) return;
    download('bills-reminders.ics', makeIcs(), 'text/calendar');
  });

  // ---------- Export to Excel (.csv, in the separator Excel expects for the chosen language) ----------
  $('#export-csv').addEventListener('click', function () {
    var dec = (1.5).toLocaleString(lang).indexOf(',') > -1 ? ',' : '.', sep = dec === ',' ? ';' : ',';
    function num(v) { return v == null ? '' : round2(v).toFixed(2).replace('.', dec); }
    function cell(v) { v = v == null ? '' : String(v); return /[";,\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = [[t('type'), t('name'), t('category') + ' / ' + t('repeats'), t('month'), t('amount')]];
    state.income.forEach(function (i) { rows.push([t('income'), i.name, t(i.kind === 'variable' ? 'variable' : 'fixed'), '', num(i.kind === 'fixed' ? i.amount : null)]);
      Object.keys(i.entries || {}).sort().forEach(function (k) { rows.push([t('income'), i.name, t('logAmount'), k, num(i.entries[k])]); }); });
    state.payments.forEach(function (p) { rows.push([t('payments'), p.name, catLabel(p.category).replace(/^\S+\s/, '') + ' / ' + t('r_' + repeatOf(p)), '', num(p.amount)]);
      Object.keys(p.entries || {}).sort().forEach(function (k) { rows.push([t('payments'), p.name, t('logAmount'), k, num(p.entries[k])]); });
      Object.keys(p.paid || {}).sort().forEach(function (k) { rows.push([t('payments'), p.name, t('paid'), k, num(owedInMonth(p, +k.slice(0, 4), +k.slice(5) - 1))]); }); });
    state.payslips.forEach(function (sl) { var tt = payslipTotals(sl);
      sl.lines.forEach(function (l) { rows.push([t('payslips'), incomeName(sl.incomeId), kindName(l.kind), sl.month, num(window.Payslip.KINDS[l.kind].side === 'deduct' ? -l.amount : l.amount)]); });
      rows.push([t('payslips'), incomeName(sl.incomeId), t('net'), sl.month, num(tt.net)]); });
    state.extras.forEach(function (x) { rows.push([t('extras'), x.label || kindName(x.kind), kindName(x.kind), x.month, num(x.amount)]); });
    state.goals.forEach(function (g) { rows.push([t('goals'), g.name, t('target') + ' ' + num(g.target), g.by || '', num(g.saved)]); });
    var csv = '﻿' + rows.map(function (r) { return r.map(cell).join(sep); }).join('\r\n');
    download('bills-' + toDateInput(today()) + '.csv', csv, 'text/csv');
  });

  // ---------- PIN lock ----------
  var PIN_KEY = 'bills-pin', LOCK_AFTER_MS = 60000;
  var PIN_MIN = 4, PIN_MAX = 64;      // any length from 4 digits up; numbers only
  var lockEl = $('#lock'), pinBuf = '', pinMode = null, firstPin = null, hiddenAt = 0;

  function getPin() { try { return JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); } catch (e) { return null; } }
  function hashPin(pin, salt) {
    var text = salt + ':' + pin;
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    var h = 5381; for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;  // fallback without https
    return Promise.resolve('d' + h.toString(16));
  }

  function showLock(mode, msgKey) {
    pinMode = mode; pinBuf = ''; firstPin = null;
    $('#lock-msg').textContent = t(msgKey);
    $('#pin-cancel').hidden = mode === 'unlock';
    $('#pin-forgot').hidden = mode !== 'unlock';
    drawDots();
    lockEl.hidden = false;
    document.body.classList.add('locked');
  }
  function hideLock() { lockEl.hidden = true; pinMode = null; document.body.classList.remove('locked'); }
  // One dot per digit typed (at least 4 placeholders), so long PINs show their full length.
  function drawDots() {
    var n = Math.max(PIN_MIN, pinBuf.length), html = '';
    for (var i = 0; i < n; i++) html += '<span' + (i < pinBuf.length ? ' class="f"' : '') + '></span>';
    $('#pin-dots').innerHTML = html;
    $('#pin-keys [data-key=ok]').disabled = pinBuf.length === 0;
  }
  function pinError(key) {
    $('#lock-msg').textContent = t(key);
    lockEl.querySelector('.lock-inner').classList.remove('shake'); void lockEl.offsetWidth;
    lockEl.querySelector('.lock-inner').classList.add('shake');
    pinBuf = ''; drawDots();
  }
  var pinBusy = false;
  function pinDigit(d) {
    if (pinBusy || pinBuf.length >= PIN_MAX) return;
    pinBuf += d; drawDots();
  }
  // OK: a new PIN must have at least 4 digits; when unlocking, any typed PIN is checked.
  function pinSubmit() {
    if (pinBusy || !pinBuf) return;
    if ((pinMode === 'new' || pinMode === 'confirm') && pinBuf.length < PIN_MIN) return pinError('newPin');
    pinComplete();
  }
  function pinComplete() {
    var stored = getPin(), entered = pinBuf;
    if (pinMode === 'unlock' || pinMode === 'remove') {
      pinBusy = true;
      hashPin(entered, stored.salt).then(function (h) {
        pinBusy = false;
        if (h !== stored.hash) return pinError('wrongPin');
        if (pinMode === 'remove') { try { localStorage.removeItem(PIN_KEY); } catch (e) {} syncPinButton(); }
        hideLock();
      });
    } else if (pinMode === 'new') {
      firstPin = entered; pinMode = 'confirm'; pinBuf = ''; drawDots();
      $('#lock-msg').textContent = t('confirmPin');
    } else if (pinMode === 'confirm') {
      if (entered !== firstPin) { pinMode = 'new'; firstPin = null; return pinError('pinsDiffer'); }
      var salt = Math.random().toString(36).slice(2);
      pinBusy = true;
      hashPin(entered, salt).then(function (h) {
        pinBusy = false;
        try { localStorage.setItem(PIN_KEY, JSON.stringify({ salt: salt, hash: h })); } catch (e) { alert(t('saveFailed')); }
        syncPinButton(); hideLock();
      });
    }
  }
  $('#pin-keys').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var k = b.getAttribute('data-key');
    if (k === 'back') { pinBuf = pinBuf.slice(0, -1); return drawDots(); }
    if (k === 'ok') return pinSubmit();
    pinDigit(b.textContent.trim());
  });
  document.addEventListener('keydown', function (e) {
    if (lockEl.hidden) return;
    if (/^\d$/.test(e.key)) pinDigit(e.key);
    else if (e.key === 'Backspace') { pinBuf = pinBuf.slice(0, -1); drawDots(); }
    else if (e.key === 'Enter') { e.preventDefault(); pinSubmit(); }
  });
  $('#pin-cancel').addEventListener('click', hideLock);
  $('#pin-forgot').addEventListener('click', function () {
    if (!confirm(t('forgotConfirm'))) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PIN_KEY); } catch (e) {}
    location.reload();
  });
  function syncPinButton() { $('#pin-toggle').textContent = t(getPin() ? 'removePin' : 'setPin'); }
  $('#pin-toggle').addEventListener('click', function () {
    if (getPin()) showLock('remove', 'enterPin'); else showLock('new', 'newPin');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hiddenAt = Date.now();
    else if (getPin() && lockEl.hidden && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) showLock('unlock', 'enterPin');
  });
  if (getPin()) showLock('unlock', 'enterPin');

  // ---------- Works offline: a service worker keeps a copy of the app on the phone ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

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
      case 'log-income': openLogForm(find(state.income, id), 'income'); break;
      case 'log-payment': openLogForm(find(state.payments, id), 'payments'); break;
      case 'toggle-paid': togglePaid(id); break;
      case 'goal-money': openMoneyForm(find(state.goals, id), btn.getAttribute('data-suggest')); break;
      case 'edit-goal': openGoalForm(find(state.goals, id)); break;
      case 'delete-goal': deleteItem('goals', id); break;
      case 'goal-nudge-close': try { localStorage.setItem('bills-goal-nudge', monthKey(today().getFullYear(), today().getMonth())); } catch (e2) {} render(); break;
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

  syncPinButton();
  render();

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('shown'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('main > .section, .footer').forEach(function (sec) {
      if (sec.getBoundingClientRect().top > innerHeight) { sec.classList.add('reveal'); io.observe(sec); }
    });
  }
})();

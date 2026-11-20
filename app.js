/* Bills Dashboard — everything is stored in this browser (localStorage). No server. */
(function () {
  'use strict';

  var STORAGE_KEY = 'bills-data-v1';
  var THEME_KEY = 'bills-theme';

  // ---------- Formatting helpers ----------
  var money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
  var dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  var shortDateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  var monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

  function $(sel, root) { return (root || document).querySelector(sel); }

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
        if (data && Array.isArray(data.income) && Array.isArray(data.payments)) return data;
      }
    } catch (e) { /* ignore and start fresh */ }
    return { income: [], payments: [] };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save on this device. If you are in a private/incognito window, data cannot be stored.');
    }
  }

  // ---------- Theme ----------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('#theme-color').setAttribute('content', t === 'dark' ? '#0f1115' : '#f4f5f7');
    $('#theme-toggle').setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  $('#theme-toggle').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  // ---------- Rendering ----------
  function dueLabel(d, now, verb) {
    if (!d) return { text: 'Ended', cls: '' };
    var n = daysBetween(now, d);
    if (n === 0) return { text: verb + ' today', cls: 'warn' };
    if (n === 1) return { text: verb + ' tomorrow', cls: 'warn' };
    if (n <= 3) return { text: verb + ' in ' + n + ' days', cls: 'warn' };
    return { text: verb + ' ' + shortDateFmt.format(d), cls: 'accent' };
  }

  function dayText(day) {
    return 'Day ' + day + (day > 28 ? ' (or last day)' : '');
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
      if (inc.kind === 'variable') {
        var logged = inc.entries && inc.entries[thisKey];
        if (typeof logged === 'number') totalIncome += logged;
        else if (happensInMonth(inc, y, m)) notLogged.push(inc.name);
      } else if (happensInMonth(inc, y, m)) {
        totalIncome += inc.amount;
      }
    });
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
      note.textContent = 'Not logged yet for ' + monthFmt.format(now) + ': ' + notLogged.join(', ') +
        '. Tap “Log amount” on the card once you know it.';
    } else {
      note.hidden = true;
      note.textContent = '';
    }

    // Income cards
    var incList = $('#income-list');
    if (!state.income.length) {
      incList.innerHTML = '<div class="empty">No income yet. Tap “+ Add income” to add your salary or other money you receive.</div>';
    } else {
      incList.innerHTML = sortByNext(state.income, now).map(function (row) {
        var inc = row.item, next = row.next;
        var isVar = inc.kind === 'variable';
        var amount, amountNote = '';
        if (isVar) {
          var v = inc.entries && inc.entries[thisKey];
          amount = typeof v === 'number' ? money.format(v) : '—';
          amountNote = typeof v === 'number' ? 'this month' : 'not logged';
          var keys = Object.keys(inc.entries || {}).sort();
          var lastKey = keys[keys.length - 1];
        } else {
          amount = money.format(inc.amount);
        }
        var due = dueLabel(next, now, 'Paid');
        return '' +
          '<article class="card' + (next || (isVar && amount !== '—') ? '' : ' is-inactive') + '">' +
            '<div class="card-top">' +
              '<div class="card-name">' + escapeHtml(inc.name) + '</div>' +
              '<div class="card-amount positive">' + amount + '</div>' +
            '</div>' +
            '<div class="badges">' +
              '<span class="badge">' + (isVar ? 'Variable' : 'Fixed monthly') + '</span>' +
              '<span class="badge ' + (due.cls === 'warn' ? 'ok' : due.cls) + '">' + due.text + '</span>' +
              (amountNote ? '<span class="badge">' + amountNote + '</span>' : '') +
            '</div>' +
            '<dl class="card-meta">' +
              '<div><dt>Start date</dt><dd>' + dateFmt.format(parseDate(inc.startDate)) + '</dd></div>' +
              '<div><dt>Paid on</dt><dd>' + dayText(inc.day) + '</dd></div>' +
              '<div><dt>End date</dt><dd>' + (inc.endDate ? dateFmt.format(parseDate(inc.endDate)) : 'Indefinite') + '</dd></div>' +
              (isVar ? '<div><dt>Last logged</dt><dd>' +
                (lastKey ? escapeHtml(monthKeyLabel(lastKey)) + ': ' + money.format(inc.entries[lastKey]) : 'Nothing yet') +
                '</dd></div>' : '') +
            '</dl>' +
            '<div class="card-actions">' +
              (isVar ? '<button class="btn btn-primary btn-small" type="button" data-action="log-income" data-id="' + inc.id + '">Log amount</button>' : '') +
              '<button class="btn btn-ghost btn-small" type="button" data-action="edit-income" data-id="' + inc.id + '">Edit</button>' +
              '<button class="btn btn-danger btn-small" type="button" data-action="delete-income" data-id="' + inc.id + '">Delete</button>' +
            '</div>' +
          '</article>';
      }).join('');
    }

    // Payment cards
    var payList = $('#payment-list');
    if (!state.payments.length) {
      payList.innerHTML = '<div class="empty">No bills yet. Tap “+ Add bill” to add rent, phone, insurance…</div>';
    } else {
      payList.innerHTML = sortByNext(state.payments, now).map(function (row) {
        var p = row.item, next = row.next;
        var due = dueLabel(next, now, 'Due');
        return '' +
          '<article class="card' + (next ? '' : ' is-inactive') + '">' +
            '<div class="card-top">' +
              '<div class="card-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="card-amount">' + money.format(p.amount) + '</div>' +
            '</div>' +
            '<div class="badges">' +
              '<span class="badge ' + due.cls + '">' + due.text + '</span>' +
            '</div>' +
            '<dl class="card-meta">' +
              '<div><dt>Next due</dt><dd>' + (next ? dateFmt.format(next) : 'No more payments') + '</dd></div>' +
              '<div><dt>Due on</dt><dd>' + dayText(p.day) + '</dd></div>' +
              '<div><dt>Start date</dt><dd>' + dateFmt.format(parseDate(p.startDate)) + '</dd></div>' +
              '<div><dt>End date</dt><dd>' + (p.endDate ? dateFmt.format(parseDate(p.endDate)) : 'None') + '</dd></div>' +
            '</dl>' +
            '<div class="card-actions">' +
              '<button class="btn btn-ghost btn-small" type="button" data-action="edit-payment" data-id="' + p.id + '">Edit</button>' +
              '<button class="btn btn-danger btn-small" type="button" data-action="delete-payment" data-id="' + p.id + '">Delete</button>' +
            '</div>' +
          '</article>';
      }).join('');
    }
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

  function readAmount(input) {
    var v = String(input.value).replace(',', '.').trim();
    if (v === '') return NaN;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? round2(n) : NaN;
  }

  // Shared checks for name, start date, day and end date.
  function validateCommon(form, endDateStr) {
    var f = form.elements;
    var name = f.name.value.trim();
    if (!name) return showError(form, 'Please enter a name.', f.name), null;
    var start = parseDate(f.startDate.value);
    if (!start) return showError(form, 'Please choose a start date.', f.startDate), null;
    var day = Number(f.day.value);
    if (!Number.isInteger(day) || day < 1 || day > 31) return showError(form, 'Day of the month must be a whole number from 1 to 31.', f.day), null;
    if (endDateStr) {
      var end = parseDate(endDateStr);
      if (!end) return showError(form, 'Please choose a valid end date.', f.endDate), null;
      if (end < start) return showError(form, 'The end date can’t be before the start date.', f.endDate), null;
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
    $('[data-kind-help]', incomeForm).textContent = isVar
      ? 'The amount changes. You log it each month from your payslip or bank deposit.'
      : 'The same amount arrives every month.';
    var endInput = $('[data-end-date]', incomeForm);
    endInput.hidden = f.endMode.value !== 'date';
  }
  incomeForm.addEventListener('change', syncIncomeForm);

  function openIncomeForm(inc) {
    editingIncomeId = inc ? inc.id : null;
    incomeForm.reset();
    showError(incomeForm, null);
    var f = incomeForm.elements;
    $('#income-form-title').textContent = inc ? 'Edit income' : 'Add income';
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
    if (f.endMode.value === 'date' && !endStr) return showError(incomeForm, 'Please choose an end date, or pick Indefinite.', f.endDate);
    var common = validateCommon(incomeForm, endStr);
    if (!common) return;
    var kind = f.kind.value === 'variable' ? 'variable' : 'fixed';
    var amount = 0;
    if (kind === 'fixed') {
      amount = readAmount(f.amount);
      if (isNaN(amount)) return showError(incomeForm, 'Please enter the monthly amount (0 or more).', f.amount);
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
    $('#payment-form-title').textContent = p ? 'Edit bill' : 'Add bill';
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
    if (isNaN(amount)) return showError(paymentForm, 'Please enter the amount (0 or more).', f.amount);
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
        '<button type="button" class="h-del" data-month="' + escapeHtml(k) + '" aria-label="Remove ' + escapeHtml(monthKeyLabel(k)) + '">Remove</button></li>';
    }).join('') : '<li><span class="help">No amounts logged yet.</span></li>';
  }

  function openLogForm(inc) {
    loggingId = inc.id;
    logForm.reset();
    showError(logForm, null);
    var now = today();
    var key = monthKey(now.getFullYear(), now.getMonth());
    $('#log-form-title').textContent = 'Log amount: ' + inc.name;
    $('#log-form-sub').textContent = 'Enter what actually arrived, from your payslip or bank account.';
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
    if (!/^\d{4}-\d{2}$/.test(f.month.value)) return showError(logForm, 'Please choose a month.', f.month);
    var amount = readAmount(f.amount);
    if (isNaN(amount)) return showError(logForm, 'Please enter the amount (0 or more).', f.amount);
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
    if (!confirm('Remove the amount for ' + monthKeyLabel(k) + '?')) return;
    delete inc.entries[k];
    save();
    render();
    renderHistory(inc);
  });

  // ---------- Delete ----------
  function deleteItem(listName, id) {
    var list = state[listName];
    var item = find(list, id);
    if (!item) return false;
    if (!confirm('Delete “' + item.name + '”? This can’t be undone.')) return false;
    state[listName] = list.filter(function (x) { return x.id !== id; });
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
        if (!confirm('Replace everything on this device with the backup?')) return;
        state = data;
        save();
        render();
      } catch (err) {
        alert('That file is not a Bills Dashboard backup.');
      }
    };
    reader.readAsText(file);
  });

  // Refresh "today" if the app is left open overnight and you come back to it.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  render();
})();

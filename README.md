# Bills Dashboard

A simple, private dashboard for your monthly income and bills.

- **Income**: fixed (same amount every month) or variable (you log each month's amount from your payslip or bank deposit). End date is *Indefinite* by default.
- **Payments**: your bills, sorted by the next due date.
- **Summary**: total income this month, total to pay this month, and what's left over.
- **Payslips**: take a photo of a Portuguese payslip (recibo de vencimento) or contract, or pick a picture. The app reads it, sorts every line into earnings and deductions (IRS, Segurança Social, …) in your language, and shows gross, deductions and net. You check the numbers before saving. A saved payslip's net becomes that month's real income.
- **Extra pay (salários e dias extraordinários)**: subsídios de férias/Natal, duodécimos, overtime, work on rest days or holidays, prémios… Extras found on a payslip appear automatically; you can also add them by hand, with days.
- **Tick bills as paid** each month; the summary shows what's **still to pay**, and unpaid bills past their date are marked overdue.
- **Categories** for bills and a **"where your money goes"** ring chart.
- **Month switcher** to look back or plan ahead, and a **6-month chart** of income vs bills (tap a month to open it).
- Bills that repeat **weekly, every 3 months or yearly**, or happen **just once** (with "set aside €X a month"), and bills whose amount **changes each month** (log it, see the trend).
- **Next 14 days** list, and **calendar reminders**: one tap adds every bill to your phone's calendar with an alert 2 days before.
- **Savings goals** with progress and "€X a month until…"; money moved to a goal comes off that month's left over.
- **PIN lock**, **works offline** once opened (install it on the home screen), and **export to Excel (.csv)**.
- **Safe to spend**: how much you can spend per day until your next payday, after the bills due before then.
- **IRS summary** per year from your saved payslips (gross, IRS withheld, Segurança Social, net, subsídios, meal allowance), with which months are missing and a .csv export.
- **PDF payslips**: text PDFs are read exactly; scanned PDFs fall back to the photo reader; password-protected PDFs ask for the password. Read on the device with [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0, bundled in `vendor/pdfjs/`).
- 39 European languages.
- Day 🌞 / Night 🌙 toggle (your choice is remembered).
- Everything is saved **only in your browser on your device**. There is no server and no account.

The app is plain HTML, CSS and JavaScript with no build step and nothing to install. Payslip reading uses [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0), bundled in `vendor/tesseract/` with its Portuguese language data, so photos are read inside the browser and never uploaded. The first scan downloads about 9 MB from wherever the app is hosted.

---

## How to run it on your computer

1. Download this project: on GitHub, click the green **Code** button, then **Download ZIP**, and unzip it.
2. Double-click `index.html`. It opens in your web browser. That's it.
   (Scanning payslips needs the app opened from a web address, such as the hosted link or `python3 -m http.server`. Browsers block the reader when a page is opened straight from a file.)

## How to open it on your phone

Your phone needs to load the files from a web address. The easiest free way is **GitHub Pages**:

1. On GitHub, open this repository and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose your branch (for example `main`) and the `/ (root)` folder, then click **Save**.
3. Wait a minute or two. GitHub shows a link like `https://your-name.github.io/bills-dashboard/`.
4. Open that link on your phone.
5. Optional: add it to your home screen so it looks like an app:
   - **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** / **Install app**.

> GitHub Pages is free for public repositories. For a private repository it needs a paid GitHub plan.
> Your bills are **not** in the repository, so the website contains no personal data. Your numbers stay inside your phone's browser.

### Alternative: test it on your phone over Wi-Fi (no publishing)

If your computer and phone are on the same Wi-Fi:

1. Open a terminal in the project folder and run: `python3 -m http.server 8000`
2. Find your computer's local IP address (e.g. `192.168.1.20`).
   On Windows run `ipconfig`; on Mac open System Settings → Wi-Fi → Details.
3. On your phone, open `http://192.168.1.20:8000` (use your own IP).

This is fine for trying it out. For everyday use GitHub Pages is better: the address never changes, and the data is tied to the address you open.

## Important: where your data lives

- Data is stored per browser **and** per web address. Data you enter on your laptop does not appear on your phone, and the other way round.
- Clearing your browser's site data/history, or using a private/incognito window, removes it or keeps it from being saved.
- Use **Download backup** at the bottom of the page now and then. **Restore backup** loads that file again, for example on a new phone.

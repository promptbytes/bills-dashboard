# Bills Dashboard

A simple, private dashboard for your monthly income and bills.

- **Income**: fixed (same amount every month) or variable (you log each month's amount from your payslip or bank deposit). End date is *Indefinite* by default.
- **Payments**: your bills, sorted by the next due date.
- **Summary**: total income this month, total to pay this month, and what's left over.
- Day 🌞 / Night 🌙 toggle (your choice is remembered).
- Everything is saved **only in your browser on your device**. There is no server and no account.

The app is just three files: `index.html`, `styles.css` and `app.js`. There is nothing to install.

---

## How to run it on your computer

1. Download this project: on GitHub, click the green **Code** button, then **Download ZIP**, and unzip it.
2. Double-click `index.html`. It opens in your web browser. That's it.

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

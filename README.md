# Clear Label – setup guide

Your own allergy-checking app for iPhone. No installs needed – everything is done in your web browser on your PC.
Takes about 20–30 minutes the first time.

---

## Step 1 – Get your Claude API key (this is what pays for the checks)

1. Go to **console.anthropic.com** and sign up (this is separate from your normal Claude subscription).
2. Open **Billing** and add a small amount of credit, e.g. £5–10. A label check typically costs a penny or two.
3. Open **Limits** (in Settings) and set a **monthly spend limit** you're comfortable with. The app can never spend more than this.
4. Open **API Keys** → **Create Key** → name it `Clear Label` → copy the key (starts `sk-ant-`).
   Paste it into Notepad for now. **Never share it or put it in the app files.**

## Step 2 – Put the app files on GitHub (free)

1. Unzip `clear-label-app.zip` on your PC (right-click → Extract All).
2. Go to **github.com** and sign up / sign in.
3. Click **+** (top right) → **New repository**. Name it `clear-label`, choose **Private**, click **Create repository**.
4. On the next page click the link **uploading an existing file**.
5. Open the unzipped `clear-label-app` folder, select **everything inside it** (Ctrl+A) – including the `api` folder – and drag it onto the GitHub page.
6. Wait for the uploads to finish, then click **Commit changes**.
   Check you can see `index.html`, `app.js` and an `api` folder in the list.

## Step 3 – Put the app online with Vercel (free)

1. Go to **vercel.com** → **Sign Up** → choose **Continue with GitHub**, and allow access to your `clear-label` repository.
2. Click **Add New… → Project**, find `clear-label`, click **Import**.
3. Open **Environment Variables** and add these two:
   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your key from Step 1 |
   | `APP_PASSWORD` | a code you choose, e.g. `Mum2026` – only people with this code can use the app |
4. Click **Deploy**. After a minute you'll get a web address like `clear-label-abc.vercel.app`.

## Step 4 – Put it on the iPhones

1. On the iPhone, open **Safari** (must be Safari) and go to your Vercel web address.
2. Enter the app code from Step 3.
3. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
4. Open Clear Label from the home screen, choose the allergies, and tap **Scan barcode**. Allow the camera when asked.

Do the same on your mum's phone (text her the web address and the code).

---

## The rules you control

- **Who can use it:** only people with your `APP_PASSWORD`. Change it in Vercel → your project → Settings → Environment Variables, then Redeploy.
- **How much it can cost:** your monthly spend limit at console.anthropic.com. You can see exactly what's been used there too.
- **Free extras:** barcode lookups (Open Food Facts) are free, and "Find safe foods" answers are reused on the phone for a week, so repeat taps cost nothing.

## How it works

- **Scan barcode** → looks the product up in Open Food Facts (a free database of millions of products), then Claude explains it in plain English and suggests safer swaps.
- **Barcode not found** → take photos of the front and the ingredients; Claude reads them.
- Allergy choices and recent checks are saved on each phone and stay after the app is closed.

## Changing things later

Edit a file on GitHub (click it → pencil icon → Commit changes) and Vercel updates the app automatically within a minute. Or ask Claude to make the change and upload the new file.

# Schedule｜行程管理

一個以繁體中文呈現的個人行程管理網站。支援月曆與清單檢視、分類、關鍵字搜尋、全天行程、地點與備註，以及透過 Google 登入後跨裝置即時同步。

## 技術

- React、TypeScript、Vite
- Firebase Authentication（Google）
- Cloud Firestore（asia-east1）
- GitHub Actions / GitHub Pages

## 本機開發

```bash
npm install
npm run dev
```

Firebase Web SDK 設定位於 `src/firebase.ts`。Firebase Web API key 是前端公開設定；行程資料的存取由 `firestore.rules` 限制為登入者自己的 UID。正式使用前，需在 Firebase Authentication 啟用 Google 登入，並將 `localhost` 和正式網站網域加到授權網域。

## Firebase 設定

Firebase 專案：`schedule-yeh0429`

```bash
npx firebase-tools deploy --only auth,firestore:rules --project schedule-yeh0429
```

Google 登入使用 Firebase Authentication 的彈出視窗。Firestore 使用 `users/{uid}/events/{eventId}` 儲存行程；規則會檢查使用者 UID、欄位型別、文字長度及建立／更新時間。

## GitHub Pages

推送至 `main` 後，`.github/workflows/deploy-pages.yml` 會自動建置並部署到 GitHub Pages。首次部署時，請在 GitHub repository 的 **Settings → Pages** 將部署來源設定為 **GitHub Actions**。網站網址為 `https://yeh0429.github.io/schedule/`；請將 `yeh0429.github.io` 加到 Firebase Authentication 的授權網域。


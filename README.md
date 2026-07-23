# DanaTech website

Static company, service and game website for [maketh.au](https://maketh.au).

## Routes

- `/`: English company website
- `/en/`: compatibility redirect to the English home
- `/zh/`: Simplified Chinese company website
- `/#projects` and `/zh/#projects`: published projects, currently Little Tower Defence
- `/services/web-design-brisbane/`: English fixed-price website service
- `/services/app-development-brisbane/`: English React Native app service
- `/services/ai-receptionist-brisbane/`: English AI receptionist service
- `/zh/services/*/`: Simplified Chinese service-page counterparts
- `/privacy/`: DanaTech privacy policy
- `/games/little-tower-defence/`: Little Tower Defence game page

The repository intentionally contains no account data, databases, server-side APIs, credentials, logs, or other service data.

## Local preview

Requires Node.js 18.19 or newer. No dependency installation is needed.

```powershell
npm test
npm run serve -- --port 4173
```

Open `http://127.0.0.1:4173/`.

## Deployment

The production web root is deployed from Git:

```bash
git clone https://github.com/2666fff/maketh.au.git /www/wwwroot/maketh.au
```

For subsequent releases:

```bash
git -C /www/wwwroot/maketh.au pull --ff-only origin main
```

Point the web server document root at `/www/wwwroot/maketh.au`. Sensitive server configuration stays outside this repository.

The root `app-ads.txt` is served as a public text file for the Android app advertising configuration.

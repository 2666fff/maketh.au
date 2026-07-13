# DanaTech website

Static company and game website for [maketh.au](https://maketh.au).

## Routes

- `/en/`: English company website
- `/zh/`: Simplified Chinese company website
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

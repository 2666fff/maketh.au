# DanaTech website

Company, service and game website for [maketh.au](https://maketh.au), with a PHP/SQLite enquiry dashboard.

## Website packages

- AUD $199: Home, About and Product; 12 months of Sydney server hosting and one available .com.au or .au domain for 12 months, subject to registration eligibility.
- AUD $299: up to 10 content pages, a quote form and private owner dashboard; first-year standard domain and basic hosting.
- AUD $888: custom development including user registration/login and basic data queries, within an agreed scope; first-year basic hosting.
- Every website tier includes desktop and mobile adaptation. The former $399 tier is removed.

## Routes

- `/`, `/zh/`: English and Chinese company websites
- `/en/`: compatibility redirect to the English home
- `/#projects`, `/zh/#projects`: published projects
- `/services/web-design-brisbane/`, `/zh/services/web-design-brisbane/`: packages
- `/services/app-development-brisbane/`, `/services/ai-receptionist-brisbane/`: other services, with Chinese counterparts under `/zh/`
- `/examples/starter/`: three-page Still & Form demo (Home, About, Product)
- `/examples/business/`: six-page Everleaf demo, including a real demo enquiry form
- `/quote/`: main enquiry form; supports `?package=199|299|888|app|ai|other` and `&lang=zh`
- `/admin/`: private owner login and enquiry management
- `/api/quotes.php`: JSON API, with session/CSRF checks, validation, rate limits and duplicate-submit protection
- `/privacy/`: privacy policy
- `/games/little-tower-defence/`: released game page
- `/app-ads.txt`: public advertising declaration

Demo brands and project descriptions are illustrative and explicitly labelled. Demo submissions go to DanaTech's real owner dashboard with source `business-demo`. The dashboard is not publicly accessible, and no email notifications are sent.

## Development and verification

Use Node.js 20.11+ and PHP 8.3+ with PDO SQLite, SQLite3, mbstring and sessions.

```powershell
npm test
npm run test:quotes
```

The integration test uses its own loopback PHP server and SQLite database. It checks actual submission, validation, anonymous-access rejection, CSRF/origin checks, duplicate protection, login/logout and persistence across a PHP restart.

For static-only preview: `npm run serve -- --port 4173`. To run the complete quote flow, provision a **local test** runtime first:

```powershell
php scripts/provision-quotes.php --config="E:/your-local-runtime/config.json" --data="E:/your-local-runtime/data" --access-file="E:/your-local-runtime/access.txt" --origin="http://127.0.0.1:4173"
$env:MAKETH_QUOTES_CONFIG = 'E:/your-local-runtime/config.json'
npm run serve:full
```

Keep runtime files outside the public document root, or within the ignored `.codex_tmp/` directory which the full preview router blocks. The provisioner refuses to overwrite existing config/access files. The generated owner password appears only in the private access file.

## Production deployment

The server uses its existing PHP 8.4 FPM pool as user `www`. Website root: `/www/wwwroot/maketh.au`.

For the initial quote-system setup, provision once:

```bash
php /www/wwwroot/maketh.au/scripts/provision-quotes.php \
  --config=/etc/maketh-quotes/config.json \
  --data=/var/lib/maketh-quotes \
  --access-file=/etc/maketh-quotes/owner-access.txt \
  --origin=https://maketh.au
chown root:www /etc/maketh-quotes /etc/maketh-quotes/config.json
chmod 750 /etc/maketh-quotes
chmod 640 /etc/maketh-quotes/config.json
chown -R www:www /var/lib/maketh-quotes
chmod 700 /var/lib/maketh-quotes /var/lib/maketh-quotes/sessions
```

Install `deploy/quotes.nginx.conf` in the existing site's extension include directory, run `nginx -t`, then reload Nginx. Its exact API location permits only the required runtime directories and blocks deployment/development files from HTTP access. Both apex and www HTTPS origins are configured.

For subsequent releases:

```bash
git -C /www/wwwroot/maketh.au pull --ff-only origin main
```

Never reprovision, delete or overwrite the production database during a code update. Keep backups of the database and runtime configuration under the server's private backup policy. No customer records, sessions, passwords, database files or credentials belong in Git.

The owner dashboard supports search, paging, customer details, New/Contacted/Closed status and private notes. Use the private access file for initial sign-in. To rotate the password, generate a new PHP `password_hash` offline and update only `owner_password_hash` in the private config; invalidate existing sessions in a planned maintenance step.

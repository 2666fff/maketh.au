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
- `/services/affordable-web-design-australia/` and its `/zh/` counterpart: Australia-wide package comparison, regional delivery information and visible FAQs
- `/services/app-development-brisbane/`, `/services/ai-receptionist-brisbane/`: other services, with Chinese counterparts under `/zh/`
- `/examples/starter/`: three-page Still & Form demo (Home, About, Product)
- `/examples/business/`: six-page Everleaf demo, including a real demo enquiry form
- `/quote/`: main enquiry form; supports `?package=199|299|888|app|ai|other` and `&lang=zh`
- `/admin/`: private owner login and enquiry management
- `/api/quotes.php`: JSON API, with session/CSRF checks, validation, rate limits and duplicate-submit protection
- `/privacy/`: privacy policy
- `/games/little-tower-defence/`: released game page
- `/app-ads.txt`: public advertising declaration

Demo brands and project descriptions are illustrative and explicitly labelled. Demo submissions go to DanaTech's real owner dashboard with source `business-demo` and do not generate email. Main-site enquiries create durable owner notifications when explicitly enabled in the private runtime configuration. The advertised $299 customer package remains dashboard-only, without email notifications.

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

When upgrading from a dashboard-only version, first follow the notification
configuration migration in [the mail runbook](deploy/mail/README.md). Update the
private configuration before deploying an API that requires explicit notification
settings. Existing owner credentials and customer records must remain unchanged.

```bash
git -C /www/wwwroot/maketh.au pull --ff-only origin main
```

Never reprovision, delete or overwrite the production database during a code update. Keep backups of the database and runtime configuration under the server's private backup policy. No customer records, sessions, passwords, database files or credentials belong in Git.

The self-hosted mailbox, authenticated SMTP/IMAP, TLS renewal and main-site
notification worker are documented in [deploy/mail/README.md](deploy/mail/README.md).
Owner notifications are durable and retry failed mail submissions; the dashboard
distinguishes waiting, retrying and accepted-by-mail-server states. MTA acceptance
is not a guarantee of external inbox placement.

## Search and geographic coverage

The English and Chinese Australia guides contain matching visible package facts,
FAQs and JSON-LD (Service, Offer, Organization, BreadcrumbList and FAQPage), plus
canonical URLs, reciprocal hreflang and sitemap entries. Brisbane is the actual
meeting area; other cities are remote-service coverage, not invented offices.
Keep sales copy concise: package facts live in their cards; detailed remote city
coverage lives in the Australia guide. Do not repeat city lists, invent offices
or claim an unverified market-wide lowest price. FAQs must match visible answers
exactly. Tests check each tier's visible scope, device adaptation and exclusions.
There is no ranking or AI-answer inclusion guarantee. Demo and private enquiry
routes remain noindex. Submit `https://maketh.au/sitemap.xml` in Search Console;
it contains the 12 canonical public URLs, not alternate HTTP/www variants.

The owner dashboard supports search, paging, customer details, New/Contacted/Closed status and private notes. Use the private access file for initial sign-in. To rotate the password, generate a new PHP `password_hash` offline and update only `owner_password_hash` in the private config; invalidate existing sessions in a planned maintenance step.

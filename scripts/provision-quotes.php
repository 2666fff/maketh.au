<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$options = getopt('', ['config:', 'data:', 'access-file:', 'origin:']);
foreach (['config', 'data', 'access-file', 'origin'] as $key) if (empty($options[$key])) throw new RuntimeException('Required option: --' . $key);
if (file_exists($options['config']) || file_exists($options['access-file'])) throw new RuntimeException('Provisioning never overwrites an existing configuration or access file.');
if (!preg_match('#^https?://[^/]+$#', $options['origin'])) throw new RuntimeException('Origin must contain the scheme and host only.');
umask(0077);
foreach ([dirname($options['config']), $options['data'], $options['data'] . '/sessions', dirname($options['access-file'])] as $directory) {
    if (!is_dir($directory) && !mkdir($directory, 0700, true)) throw new RuntimeException('Cannot create runtime directory');
}
$password = bin2hex(random_bytes(18));
$config = ['database' => $options['data'] . '/quotes.sqlite', 'session_dir' => $options['data'] . '/sessions', 'owner_username' => 'owner', 'owner_password_hash' => password_hash($password, PASSWORD_DEFAULT), 'origin' => $options['origin'], 'rate_secret' => bin2hex(random_bytes(32))];
$config['allowed_origins'] = [$options['origin']];
if ($options['origin'] === 'https://maketh.au') $config['allowed_origins'][] = 'https://www.maketh.au';
$db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA journal_mode = WAL');
$db->exec("CREATE TABLE quotes (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, business TEXT NOT NULL, package TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')), notes TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL UNIQUE)");
$db->exec('CREATE INDEX quotes_created ON quotes(created_at DESC)');
$db->exec('CREATE INDEX quotes_status ON quotes(status)');
$db->exec('CREATE TABLE request_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL)');
if (file_put_contents($options['config'], json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) === false) throw new RuntimeException('Cannot write configuration');
$access = "DanaTech owner dashboard\nURL: " . $options['origin'] . "/admin/\nUsername: owner\nPassword: " . $password . "\nKeep this file private. Credentials are not stored in Git.\n";
if (file_put_contents($options['access-file'], $access) === false) throw new RuntimeException('Cannot write private access file');
echo "Quote database and owner credentials provisioned. Password withheld from output.\n";

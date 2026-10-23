<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// Private rollback snapshot using SQLite's online backup API, never a raw WAL copy.
umask(0077);
$options = getopt('', ['destination:']);
$destination = $options['destination'] ?? '';
if (!str_starts_with($destination, '/etc/maketh-quotes/backups/') || file_exists($destination)) throw new RuntimeException('New private backup directory required');
$configPath = '/etc/maketh-quotes/config.json';
$config = json_decode(file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
if (!mkdir($destination, 0700, true)) throw new RuntimeException('Cannot create backup directory');
if (!copy($configPath, $destination . '/config.json')) throw new RuntimeException('Cannot back up runtime config');
$source = new SQLite3($config['database'], SQLITE3_OPEN_READONLY);
$source->busyTimeout(5000);
$target = new SQLite3($destination . '/quotes.sqlite');
if (!$source->backup($target)) throw new RuntimeException('SQLite backup failed');
if ($target->querySingle('PRAGMA integrity_check') !== 'ok') throw new RuntimeException('Backup integrity failed');
$target->close();
$source->close();
echo "Private config and online SQLite backup verified.\n";

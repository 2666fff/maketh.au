<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^/(?:\.|scripts/|deploy/|tests/|confs\.txt|maketh\.au_key|codex_temp\.txt|breakpoint-task-skill-export)#', $path)) { http_response_code(404); exit('Not found'); }
$root = dirname(__DIR__);
$file = realpath($root . $path);
if ($file === false || ($file !== $root && !str_starts_with($file, $root . DIRECTORY_SEPARATOR))) { http_response_code(404); exit('Not found'); }
return false;

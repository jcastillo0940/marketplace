<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$publicPath = __DIR__.'/public'.$path;

if ($path !== '/' && is_file($publicPath)) {
    return false;
}

require __DIR__.'/public/index.php';

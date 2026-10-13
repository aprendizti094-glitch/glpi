<?php

/**
 * Polyfill para a classe Normalizer, funcoes normalizer_* e grapheme_* quando a extensao intl
 * do PHP nao esta ativa ou nao pode ser carregada no ambiente Apache Windows.
 * 
 * Evita os erros fatais no Twig / Symfony String:
 * 1) "Class Normalizer not found"
 * 2) "Call to undefined function Symfony\Component\String\grapheme_strlen()"
 * 3) "Call to undefined function grapheme_substr() / grapheme_strpos() / etc."
 */

if (!defined('GRAPHEME_EXTR_COUNT')) {
    define('GRAPHEME_EXTR_COUNT', 0);
}
if (!defined('GRAPHEME_EXTR_MAXBYTES')) {
    define('GRAPHEME_EXTR_MAXBYTES', 1);
}
if (!defined('GRAPHEME_EXTR_MAXCHARS')) {
    define('GRAPHEME_EXTR_MAXCHARS', 2);
}

if (!class_exists('Normalizer', false)) {
    class Normalizer
    {
        public const NONE    = 1;
        public const FORM_D  = 2;
        public const NFD     = 2;
        public const FORM_KD = 3;
        public const NFKD    = 3;
        public const FORM_C  = 4;
        public const NFC     = 4;
        public const FORM_KC = 5;
        public const NFKC    = 5;

        public static function isNormalized(string $string, int $form = self::FORM_C): bool
        {
            return true;
        }

        public static function normalize(string $string, int $form = self::FORM_C): string|false
        {
            return $string;
        }
    }
}

if (!function_exists('normalizer_is_normalized')) {
    function normalizer_is_normalized(string $string, int $form = Normalizer::FORM_C): bool
    {
        return Normalizer::isNormalized($string, $form);
    }
}

if (!function_exists('normalizer_normalize')) {
    function normalizer_normalize(string $string, int $form = Normalizer::FORM_C): string|false
    {
        return Normalizer::normalize($string, $form);
    }
}

// ==========================================
// Polyfills das funcoes grapheme_* da intl
// ==========================================

if (!function_exists('grapheme_strlen')) {
    function grapheme_strlen(string $string): int|false|null
    {
        return function_exists('mb_strlen') ? mb_strlen($string, 'UTF-8') : strlen($string);
    }
}

if (!function_exists('grapheme_substr')) {
    function grapheme_substr(string $string, int $offset, ?int $length = null): string|false
    {
        if (function_exists('mb_substr')) {
            return $length === null
                ? mb_substr($string, $offset, null, 'UTF-8')
                : mb_substr($string, $offset, $length, 'UTF-8');
        }
        return $length === null ? substr($string, $offset) : substr($string, $offset, $length);
    }
}

if (!function_exists('grapheme_strpos')) {
    function grapheme_strpos(string $haystack, string $needle, int $offset = 0): int|false
    {
        return function_exists('mb_strpos')
            ? mb_strpos($haystack, $needle, $offset, 'UTF-8')
            : strpos($haystack, $needle, $offset);
    }
}

if (!function_exists('grapheme_stripos')) {
    function grapheme_stripos(string $haystack, string $needle, int $offset = 0): int|false
    {
        return function_exists('mb_stripos')
            ? mb_stripos($haystack, $needle, $offset, 'UTF-8')
            : stripos($haystack, $needle, $offset);
    }
}

if (!function_exists('grapheme_strrpos')) {
    function grapheme_strrpos(string $haystack, string $needle, int $offset = 0): int|false
    {
        return function_exists('mb_strrpos')
            ? mb_strrpos($haystack, $needle, $offset, 'UTF-8')
            : strrpos($haystack, $needle, $offset);
    }
}

if (!function_exists('grapheme_strripos')) {
    function grapheme_strripos(string $haystack, string $needle, int $offset = 0): int|false
    {
        return function_exists('mb_strripos')
            ? mb_strripos($haystack, $needle, $offset, 'UTF-8')
            : strripos($haystack, $needle, $offset);
    }
}

if (!function_exists('grapheme_extract')) {
    function grapheme_extract(string $haystack, int $size, int $type = GRAPHEME_EXTR_COUNT, int $start = 0, ?int &$next = null): string|false
    {
        if ($type === GRAPHEME_EXTR_MAXBYTES) {
            $extracted = substr($haystack, $start, $size);
        } else {
            $extracted = function_exists('mb_substr')
                ? mb_substr($haystack, $start, $size, 'UTF-8')
                : substr($haystack, $start, $size);
        }
        $next = $start + strlen($extracted);
        return $extracted;
    }
}

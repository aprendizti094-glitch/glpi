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

// ==========================================
// Polyfill da classe Locale da ext-intl
// ==========================================

if (!class_exists('Locale', false)) {
    class Locale
    {
        public const ACTUAL_LOCALE = 0;
        public const VALID_LOCALE  = 1;

        private static string $defaultLocale = 'pt_BR';

        public static function setDefault(string $locale): bool
        {
            self::$defaultLocale = $locale;
            return true;
        }

        public static function getDefault(): string
        {
            return self::$defaultLocale;
        }

        public static function parseLocale(?string $locale): ?array
        {
            if ($locale === null || $locale === '') {
                $locale = self::$defaultLocale;
            }

            $normalized = str_replace('-', '_', $locale);
            $parts = explode('_', $normalized);

            $result = [
                'language' => strtolower($parts[0] ?? 'pt'),
            ];

            if (isset($parts[1]) && $parts[1] !== '') {
                $result['region'] = strtoupper($parts[1]);
            } else {
                $result['region'] = '';
            }

            return $result;
        }

        public static function getPrimaryLanguage(?string $locale): ?string
        {
            $parsed = self::parseLocale($locale);
            return $parsed['language'] ?? null;
        }

        public static function getRegion(?string $locale): ?string
        {
            $parsed = self::parseLocale($locale);
            return $parsed['region'] ?? null;
        }

        public static function getDisplayLanguage(?string $locale, ?string $in_locale = null): string|false
        {
            return self::getPrimaryLanguage($locale) ?? false;
        }

        public static function getDisplayRegion(?string $locale, ?string $in_locale = null): string|false
        {
            return self::getRegion($locale) ?? false;
        }

        public static function getDisplayName(?string $locale, ?string $in_locale = null): string|false
        {
            return $locale ?? false;
        }

        public static function acceptFromHttp(?string $header): string|false
        {
            if (empty($header)) {
                return self::$defaultLocale;
            }
            $parts = explode(',', $header);
            $primary = trim(explode(';', $parts[0])[0]);
            return str_replace('-', '_', $primary);
        }
    }
}

// ==========================================
// Polyfill de transliterator_transliterate e Transliterator
// ==========================================

if (!function_exists('transliterator_transliterate')) {
    function transliterator_transliterate($transliterator, string $string, int $start = 0, int $end = -1): string|false
    {
        if ($start !== 0 || $end !== -1) {
            $len = ($end === -1) ? null : ($end - $start);
            $string = substr($string, $start, $len);
        }

        static $charmap = [
            'À'=>'A', 'Á'=>'A', 'Â'=>'A', 'Ã'=>'A', 'Ä'=>'A', 'Å'=>'A', 'Æ'=>'AE', 'Ç'=>'C',
            'È'=>'E', 'É'=>'E', 'Ê'=>'E', 'Ë'=>'E', 'Ì'=>'I', 'Í'=>'I', 'Î'=>'I', 'Ï'=>'I',
            'Ð'=>'D', 'Ñ'=>'N', 'Ò'=>'O', 'Ó'=>'O', 'Ô'=>'O', 'Õ'=>'O', 'Ö'=>'O', 'Ø'=>'O',
            'Ù'=>'U', 'Ú'=>'U', 'Û'=>'U', 'Ü'=>'U', 'Ý'=>'Y', 'Þ'=>'TH', 'ß'=>'ss',
            'à'=>'a', 'á'=>'a', 'â'=>'a', 'ã'=>'a', 'ä'=>'a', 'å'=>'a', 'æ'=>'ae', 'ç'=>'c',
            'è'=>'e', 'é'=>'e', 'ê'=>'e', 'ë'=>'e', 'ì'=>'i', 'í'=>'i', 'î'=>'i', 'ï'=>'i',
            'ð'=>'d', 'ñ'=>'n', 'ò'=>'o', 'ó'=>'o', 'ô'=>'o', 'õ'=>'o', 'ö'=>'o', 'ø'=>'o',
            'ù'=>'u', 'ú'=>'u', 'û'=>'u', 'ü'=>'u', 'ý'=>'y', 'þ'=>'th', 'ÿ'=>'y',
            'Ā'=>'A', 'ā'=>'a', 'Ă'=>'A', 'ă'=>'a', 'Ą'=>'A', 'ą'=>'a',
            'Ć'=>'C', 'ć'=>'c', 'Ĉ'=>'C', 'ĉ'=>'c', 'Ċ'=>'C', 'ċ'=>'c', 'Č'=>'C', 'č'=>'c',
            'Ď'=>'D', 'ď'=>'d', 'Đ'=>'D', 'đ'=>'d',
            'Ē'=>'E', 'ē'=>'e', 'Ĕ'=>'E', 'ĕ'=>'e', 'Ė'=>'E', 'ė'=>'e', 'Ę'=>'E', 'ę'=>'e', 'Ě'=>'E', 'ě'=>'e',
            'Ĝ'=>'G', 'ĝ'=>'g', 'Ğ'=>'G', 'ğ'=>'g', 'Ġ'=>'G', 'ġ'=>'g', 'Ģ'=>'G', 'ģ'=>'g',
            'Ĥ'=>'H', 'ĥ'=>'h', 'Ħ'=>'H', 'ħ'=>'h',
            'Ĩ'=>'I', 'ĩ'=>'i', 'Ī'=>'I', 'ī'=>'i', 'Ĭ'=>'I', 'ĭ'=>'i', 'Į'=>'I', 'į'=>'i', 'İ'=>'I', 'ı'=>'i',
            'Ĳ'=>'IJ', 'ĳ'=>'ij', 'Ĵ'=>'J', 'ĵ'=>'j',
            'Ķ'=>'K', 'ķ'=>'k', 'ĸ'=>'k',
            'Ĺ'=>'L', 'ĺ'=>'l', 'Ļ'=>'L', 'ļ'=>'l', 'Ľ'=>'L', 'ľ'=>'l', 'Ŀ'=>'L', 'ŀ'=>'l', 'Ł'=>'L', 'ł'=>'l',
            'Ń'=>'N', 'ń'=>'n', 'Ņ'=>'N', 'ņ'=>'n', 'Ň'=>'N', 'ň'=>'n', 'ŉ'=>'n', 'Ŋ'=>'N', 'ŋ'=>'n',
            'Ō'=>'O', 'ō'=>'o', 'Ŏ'=>'O', 'ŏ'=>'o', 'Ő'=>'O', 'ő'=>'o', 'Œ'=>'OE', 'œ'=>'oe',
            'Ŕ'=>'R', 'ŕ'=>'r', 'Ŗ'=>'R', 'ŗ'=>'r', 'Ř'=>'R', 'ř'=>'r',
            'Ś'=>'S', 'ś'=>'s', 'Ŝ'=>'S', 'ŝ'=>'s', 'Ş'=>'S', 'ş'=>'s', 'Š'=>'S', 'š'=>'s',
            'Ţ'=>'T', 'ţ'=>'t', 'Ť'=>'T', 'ť'=>'t', 'Ŧ'=>'T', 'ŧ'=>'t',
            'Ũ'=>'U', 'ũ'=>'u', 'Ū'=>'U', 'ū'=>'u', 'Ŭ'=>'U', 'ŭ'=>'u', 'Ů'=>'U', 'ů'=>'u', 'Ű'=>'U', 'ű'=>'u', 'Ų'=>'U', 'ų'=>'u',
            'Ŵ'=>'W', 'ŵ'=>'w',
            'Ŷ'=>'Y', 'ŷ'=>'y', 'Ÿ'=>'Y',
            'Ź'=>'Z', 'ź'=>'z', 'Ż'=>'Z', 'ż'=>'z', 'Ž'=>'Z', 'ž'=>'z',
        ];
        $string = strtr($string, $charmap);

        if (function_exists('iconv')) {
            $trans = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $string);
            if ($trans !== false) {
                $string = $trans;
            }
        }

        if (is_string($transliterator) && str_contains($transliterator, 'Remove')) {
            $string = preg_replace('/[^a-zA-Z0-9\.\ \-_]/', '', $string);
        }

        return $string;
    }
}

if (!class_exists('Transliterator', false)) {
    class Transliterator
    {
        public const FORWARD = 0;
        public const REVERSE = 1;

        public string $id;

        public function __construct(string $id = '')
        {
            $this->id = $id;
        }

        public static function create(string $id, int $direction = self::FORWARD): ?static
        {
            return new static($id);
        }

        public static function createFromRules(string $rules, int $direction = self::FORWARD): ?static
        {
            return new static($rules);
        }

        public static function createInverse(self $orig): ?static
        {
            return new static($orig->id);
        }

        public function transliterate(string $string, int $start = 0, int $end = -1): string|false
        {
            return transliterator_transliterate($this->id, $string, $start, $end);
        }

        public static function listIDs(): array|false
        {
            return ['Any-Latin', 'Latin-ASCII'];
        }

        public function getErrorCode(): int|false
        {
            return 0;
        }

        public function getErrorMessage(): string|false
        {
            return '';
        }
    }
}

// ==========================================
// Polyfill de IntlDateFormatter
// ==========================================

if (!class_exists('IntlDateFormatter', false)) {
    class IntlDateFormatter
    {
        public const NONE = -1;
        public const FULL = 0;
        public const LONG = 1;
        public const MEDIUM = 2;
        public const SHORT = 3;
        public const RELATIVE_FULL = 128;
        public const RELATIVE_LONG = 129;
        public const RELATIVE_MEDIUM = 130;
        public const RELATIVE_SHORT = 131;

        public const TRADITIONAL = 0;
        public const GREGORIAN = 1;

        private string $locale;
        private int $dateType;
        private int $timeType;
        private ?string $pattern;

        public function __construct(
            ?string $locale = null,
            int $dateType = self::FULL,
            int $timeType = self::FULL,
            $timezone = null,
            $calendar = null,
            ?string $pattern = ''
        ) {
            $this->locale = $locale ?? 'en_US';
            $this->dateType = $dateType;
            $this->timeType = $timeType;
            $this->pattern = $pattern;
        }

        public static function create(
            ?string $locale = null,
            int $dateType = self::FULL,
            int $timeType = self::FULL,
            $timezone = null,
            $calendar = null,
            ?string $pattern = ''
        ): ?static {
            return new static($locale, $dateType, $timeType, $timezone, $calendar, $pattern);
        }

        public function format($datetime): string|false
        {
            if ($datetime instanceof \DateTimeInterface) {
                return $datetime->format('Y-m-d H:i:s');
            }
            if (is_numeric($datetime)) {
                return date('Y-m-d H:i:s', (int)$datetime);
            }
            return (string)$datetime;
        }

        public static function formatObject($object, $format = null, ?string $locale = null): string|false
        {
            if ($object instanceof \DateTimeInterface) {
                if (is_string($format) && str_contains($format, 'MMMM y')) {
                    return $object->format('F Y');
                }
                return $object->format('Y-m-d H:i:s');
            }
            return false;
        }

        public function getCalendar(): int|false
        {
            return self::GREGORIAN;
        }

        public function getPattern(): string|false
        {
            return $this->pattern ?? 'Y-m-d H:i:s';
        }

        public function getTimeZoneId(): string|false
        {
            return date_default_timezone_get();
        }

        public function getLocale(int $type = 0): string|false
        {
            return $this->locale;
        }
    }
}

// ==========================================
// Polyfill da classe NumberFormatter da intl
// ==========================================

if (!class_exists('NumberFormatter', false)) {
    class NumberFormatter
    {
        public const PATTERN_DECIMAL = 0;
        public const DECIMAL = 1;
        public const CURRENCY = 2;
        public const PERCENT = 3;
        public const SCIENTIFIC = 4;
        public const SPELLOUT = 5;
        public const ORDINAL = 6;
        public const DURATION = 7;
        public const NUMBERING_SYSTEM = 8;
        public const PATTERN_RULEBASED = 9;
        public const DEFAULT_STYLE = 1;

        public const ROUND_CEILING = 0;
        public const ROUND_FLOOR = 1;
        public const ROUND_DOWN = 2;
        public const ROUND_UP = 3;
        public const ROUND_HALFEVEN = 4;
        public const ROUND_HALFDOWN = 5;
        public const ROUND_HALFUP = 6;

        public const PAD_BEFORE_PREFIX = 0;
        public const PAD_AFTER_PREFIX = 1;
        public const PAD_BEFORE_SUFFIX = 2;
        public const PAD_AFTER_SUFFIX = 3;

        public const PARSE_INT_ONLY = 0;
        public const GROUPING_USED = 1;
        public const DECIMAL_ALWAYS_SHOWN = 2;
        public const MAX_INTEGER_DIGITS = 3;
        public const MIN_INTEGER_DIGITS = 4;
        public const INTEGER_DIGITS = 5;
        public const MAX_FRACTION_DIGITS = 6;
        public const MIN_FRACTION_DIGITS = 7;
        public const FRACTION_DIGITS = 8;
        public const MULTIPLIER = 9;
        public const GROUPING_SIZE = 10;
        public const ROUNDING_MODE = 11;
        public const ROUNDING_INCREMENT = 12;
        public const FORMAT_WIDTH = 13;
        public const PADDING_POSITION = 14;
        public const SECONDARY_GROUPING_SIZE = 15;
        public const SIGNIFICANT_DIGITS_USED = 16;
        public const MIN_SIGNIFICANT_DIGITS = 17;
        public const MAX_SIGNIFICANT_DIGITS = 18;
        public const LENIENT_PARSE = 19;

        public const POSITIVE_PREFIX = 0;
        public const POSITIVE_SUFFIX = 1;
        public const NEGATIVE_PREFIX = 2;
        public const NEGATIVE_SUFFIX = 3;
        public const PADDING_CHARACTER = 4;
        public const CURRENCY_CODE = 5;
        public const DEFAULT_RULESET = 6;
        public const PUBLIC_RULESETS = 7;

        public const DECIMAL_SEPARATOR_SYMBOL = 0;
        public const GROUPING_SEPARATOR_SYMBOL = 1;
        public const PATTERN_SEPARATOR_SYMBOL = 2;
        public const PERCENT_SYMBOL = 3;
        public const ZERO_DIGIT_SYMBOL = 4;
        public const DIGIT_SYMBOL = 5;
        public const MINUS_SIGN_SYMBOL = 6;
        public const PLUS_SIGN_SYMBOL = 7;
        public const CURRENCY_SYMBOL = 8;
        public const INTL_CURRENCY_SYMBOL = 9;
        public const MONETARY_SEPARATOR_SYMBOL = 10;
        public const EXPONENTIAL_SYMBOL = 11;
        public const PERMILL_SYMBOL = 12;
        public const PAD_ESCAPE_SYMBOL = 13;
        public const INFINITY_SYMBOL = 14;
        public const NAN_SYMBOL = 15;
        public const SIGNIFICANT_DIGIT_SYMBOL = 16;
        public const MONETARY_GROUPING_SEPARATOR_SYMBOL = 17;

        public const TYPE_DEFAULT = 1;
        public const TYPE_INT32 = 2;
        public const TYPE_INT64 = 3;
        public const TYPE_DOUBLE = 4;
        public const TYPE_CURRENCY = 5;

        protected string $locale;
        protected int $style;
        protected ?string $pattern;
        protected array $attributes = [];
        protected array $textAttributes = [];
        protected array $symbols = [];

        public function __construct(string $locale, int $style = self::DEFAULT_STYLE, ?string $pattern = null)
        {
            $this->locale = $locale ?: 'pt_BR';
            $this->style = $style;
            $this->pattern = $pattern;

            $is_br = str_contains(strtolower($this->locale), 'pt');
            $this->symbols[self::DECIMAL_SEPARATOR_SYMBOL] = $is_br ? ',' : '.';
            $this->symbols[self::GROUPING_SEPARATOR_SYMBOL] = $is_br ? '.' : ',';
            $this->symbols[self::PLUS_SIGN_SYMBOL] = '+';
            $this->symbols[self::MINUS_SIGN_SYMBOL] = '-';
            $this->symbols[self::CURRENCY_SYMBOL] = $is_br ? 'R$' : '$';
            $this->symbols[self::INTL_CURRENCY_SYMBOL] = $is_br ? 'BRL' : 'USD';
            $this->attributes[self::GROUPING_SIZE] = 3;
            $this->attributes[self::FRACTION_DIGITS] = 2;
            $this->attributes[self::MIN_FRACTION_DIGITS] = 0;
            $this->attributes[self::MAX_FRACTION_DIGITS] = 2;
        }

        public static function create(string $locale, int $style, ?string $pattern = null): ?NumberFormatter
        {
            return new self($locale, $style, $pattern);
        }

        public function format(int|float $num, int $type = self::TYPE_DEFAULT): string|false
        {
            if ($this->style === self::SPELLOUT) {
                return self::spellout((int)$num, $this->locale);
            }
            if ($this->style === self::CURRENCY) {
                return $this->formatCurrency((float)$num, $this->symbols[self::INTL_CURRENCY_SYMBOL] ?? 'BRL');
            }
            if ($this->style === self::PERCENT) {
                return number_format($num * 100, $this->attributes[self::MAX_FRACTION_DIGITS] ?? 0) . '%';
            }
            $dec = $this->attributes[self::MAX_FRACTION_DIGITS] ?? (is_float($num) ? 2 : 0);
            $dec_sep = $this->symbols[self::DECIMAL_SEPARATOR_SYMBOL] ?? ',';
            $grp_sep = $this->symbols[self::GROUPING_SEPARATOR_SYMBOL] ?? '.';
            return number_format((float)$num, $dec, $dec_sep, $grp_sep);
        }

        public function formatCurrency(float $amount, string $currency): string|false
        {
            $dec_sep = $this->symbols[self::DECIMAL_SEPARATOR_SYMBOL] ?? ',';
            $grp_sep = $this->symbols[self::GROUPING_SEPARATOR_SYMBOL] ?? '.';
            return $currency . ' ' . number_format($amount, 2, $dec_sep, $grp_sep);
        }

        public function parse(string $string, int $type = self::TYPE_DOUBLE, ?int &$offset = null): int|float|false
        {
            $clean = preg_replace('/[^\d\.\,\-]/', '', $string);
            if (str_contains($clean, ',') && str_contains($clean, '.')) {
                $clean = str_replace('.', '', $clean);
                $clean = str_replace(',', '.', $clean);
            } elseif (str_contains($clean, ',')) {
                $clean = str_replace(',', '.', $clean);
            }
            if (!is_numeric($clean)) {
                return false;
            }
            if ($type === self::TYPE_INT32 || $type === self::TYPE_INT64) {
                return (int)$clean;
            }
            return (float)$clean;
        }

        public function parseCurrency(string $string, string &$currency, ?int &$offset = null): float|false
        {
            preg_match('/[A-Z]{3}|\$|R\$/', $string, $m);
            $currency = $m[0] ?? 'BRL';
            return (float)$this->parse($string, self::TYPE_DOUBLE, $offset);
        }

        public function setAttribute(int $attribute, int|float $value): bool
        {
            $this->attributes[$attribute] = $value;
            return true;
        }

        public function getAttribute(int $attribute): int|float|false
        {
            return $this->attributes[$attribute] ?? false;
        }

        public function setTextAttribute(int $attribute, string $value): bool
        {
            $this->textAttributes[$attribute] = $value;
            return true;
        }

        public function getTextAttribute(int $attribute): string|false
        {
            return $this->textAttributes[$attribute] ?? false;
        }

        public function setSymbol(int $symbol, string $value): bool
        {
            $this->symbols[$symbol] = $value;
            return true;
        }

        public function getSymbol(int $symbol): string|false
        {
            return $this->symbols[$symbol] ?? false;
        }

        public function setPattern(string $pattern): bool
        {
            $this->pattern = $pattern;
            return true;
        }

        public function getPattern(): string|false
        {
            return $this->pattern ?? '';
        }

        public function getLocale(int $type = 0): string|false
        {
            return $this->locale;
        }

        public function getErrorCode(): int
        {
            return 0;
        }

        public function getErrorMessage(): string
        {
            return 'U_ZERO_ERROR';
        }

        public static function spellout(int $n, string $locale): string
        {
            $pt = [
                0 => 'zero', 1 => 'um', 2 => 'dois', 3 => 'três', 4 => 'quatro', 5 => 'cinco',
                6 => 'seis', 7 => 'sete', 8 => 'oito', 9 => 'nove', 10 => 'dez',
                11 => 'onze', 12 => 'doze', 13 => 'treze', 14 => 'quatorze', 15 => 'quinze',
                16 => 'dezesseis', 17 => 'dezessete', 18 => 'dezoito', 19 => 'dezenove', 20 => 'vinte',
                30 => 'trinta', 40 => 'quarenta', 50 => 'cinquenta', 60 => 'sessenta',
                70 => 'setenta', 80 => 'oitenta', 90 => 'noventa', 100 => 'cem'
            ];
            $en = [
                0 => 'zero', 1 => 'one', 2 => 'two', 3 => 'three', 4 => 'four', 5 => 'five',
                6 => 'six', 7 => 'seven', 8 => 'eight', 9 => 'nine', 10 => 'ten',
                11 => 'eleven', 12 => 'twelve', 13 => 'thirteen', 14 => 'fourteen', 15 => 'fifteen',
                16 => 'sixteen', 17 => 'seventeen', 18 => 'eighteen', 19 => 'nineteen', 20 => 'twenty',
                30 => 'thirty', 40 => 'forty', 50 => 'fifty', 60 => 'sixty',
                70 => 'seventy', 80 => 'eighty', 90 => 'ninety', 100 => 'one hundred'
            ];

            $map = str_contains(strtolower($locale), 'en') ? $en : $pt;
            return $map[$n] ?? (string)$n;
        }
    }
}




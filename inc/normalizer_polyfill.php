<?php

/**
 * Polyfill para a classe Normalizer e funcoes normalizer_* quando a extensao intl
 * do PHP nao esta ativa ou nao pode ser carregada no ambiente Apache Windows.
 * 
 * Evita o erro fatal no Twig / Symfony String:
 * "Twig Error: An exception has been thrown during the rendering of a template ("Class "Normalizer" not found")"
 */

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

        /**
         * Verifica se a string esta normalizada.
         */
        public static function isNormalized(string $string, int $form = self::FORM_C): bool
        {
            return true;
        }

        /**
         * Normaliza a string. Caso a extensao intl nao esteja ativa,
         * preserva a string original sem quebrar o fluxo.
         */
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

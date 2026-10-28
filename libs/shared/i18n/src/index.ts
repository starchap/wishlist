import daCommon from './locales/da.json';
import enCommon from './locales/en.json';

export const SUPPORTED_LOCALES = ['da', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'da';

export type TranslationDictionary = Record<string, string>;

export interface DomainI18nNamespace<N extends string, Dict extends TranslationDictionary> {
  readonly namespace: N;
  readonly dictionaries: Record<Locale, Dict>;
  t: (locale: Locale, key: keyof Dict & string, params?: Record<string, string | number>) => string;
}

/**
 * Creates a strictly typed, domain-scoped i18n namespace.
 * Every DDD bounded context defines its own translations using this factory.
 */
export function defineDomainI18n<N extends string, Dict extends TranslationDictionary>(
  namespace: N,
  dictionaries: Record<Locale, Dict>
): DomainI18nNamespace<N, Dict> {
  return {
    namespace,
    dictionaries,
    t(locale: Locale, key: keyof Dict & string, params?: Record<string, string | number>): string {
      const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      let text: string = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? `${namespace}.${key}`;
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          text = text.replaceAll(`{{${paramKey}}}`, String(paramValue));
        }
      }
      return text;
    }
  };
}

export function resolveLocale(raw?: string | null): Locale {
  if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
    return raw as Locale;
  }
  return DEFAULT_LOCALE;
}

export const commonI18n = defineDomainI18n('common', {
  da: daCommon,
  en: enCommon
});

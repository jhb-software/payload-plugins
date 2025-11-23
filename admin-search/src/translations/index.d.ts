export type GenericTranslationsObject = {
    [key: string]: GenericTranslationsObject | string;
};
export type NestedKeysStripped<T> = T extends object ? {
    [K in keyof T]-?: K extends string ? T[K] extends object ? `${K}:${NestedKeysStripped<T[K]>}` : `${StripCountVariants<K>}` : never;
}[keyof T] : '';
export type StripCountVariants<TKey> = TKey extends `${infer Base}_many` | `${infer Base}_one` | `${infer Base}_other` ? Base : TKey;
export declare const translations: {
    de: GenericTranslationsObject;
    en: GenericTranslationsObject;
};
export type PluginAdminSearchTranslations = GenericTranslationsObject;
export type PluginAdminSearchTranslationKeys = NestedKeysStripped<PluginAdminSearchTranslations>;

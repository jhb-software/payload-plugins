import type { PluginAdminSearchTranslationKeys } from '../translations/index.js';
/** Hook which returns a translation function for the plugin translations. */
export declare const usePluginTranslation: () => {
    t: (key: PluginAdminSearchTranslationKeys) => string;
};

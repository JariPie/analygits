import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChromeStorage } from './useChromeStorage';

export type LanguageOption = 'system' | 'en' | 'de';

export function useLanguagePreference() {
    const { i18n } = useTranslation();
    const [language, setLanguage, isLoaded] = useChromeStorage<LanguageOption>('param_language', 'system');

    useEffect(() => {
        if (!isLoaded) return;

        let targetLang = language;

        if (language === 'system') {
            // Try chrome.i18n first, fallback to navigator
            const systemLang = chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
            targetLang = systemLang.startsWith('de') ? 'de' : 'en';
        }

        if (i18n.language !== targetLang) {
            i18n.changeLanguage(targetLang);
        }
    }, [language, isLoaded, i18n]);

    return { language, setLanguage, isLoaded };
}

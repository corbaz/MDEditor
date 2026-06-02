import type { Locale } from '../../lib/format';

interface LocaleSwitchProps {
    locale: Locale;
    onLocaleChange: (locale: Locale) => void;
}

export function LocaleSwitch({ locale, onLocaleChange }: LocaleSwitchProps) {
    return (
        <div
            className="localeSwitch segmentedSwitch"
            role="group"
            aria-label="Language"
        >
            <button
                type="button"
                className={locale === 'es' ? 'active' : ''}
                onClick={() => onLocaleChange('es')}
            >
                ES
            </button>
            <button
                type="button"
                className={locale === 'en' ? 'active' : ''}
                onClick={() => onLocaleChange('en')}
            >
                US
            </button>
        </div>
    );
}

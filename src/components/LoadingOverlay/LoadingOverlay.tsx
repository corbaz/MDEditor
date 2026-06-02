import type { Locale } from '../../lib/format';

interface LoadingOverlayProps {
    visible: boolean;
    locale: Locale;
}

export function LoadingOverlay({ visible, locale }: LoadingOverlayProps) {
    if (!visible) return null;

    return (
        <div
            className="loadingOverlay"
            aria-label={locale === 'es' ? 'Cargando...' : 'Loading...'}
        >
            <div className="spinner" />
            <span className="spinnerLabel">
                {locale === 'es' ? 'Cargando...' : 'Loading...'}
            </span>
        </div>
    );
}

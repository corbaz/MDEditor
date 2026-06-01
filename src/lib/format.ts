export type Locale = 'es' | 'en';

export const getByteSize = (value: string) => new Blob([value]).size;

export const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

export const formatSavedAt = (value: number | null, locale: Locale) => {
    if (!value) return locale === 'es' ? 'sin guardar' : 'not saved';

    return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
};

export const normalizeFileName = (value: string) => {
    const trimmed = value.trim() || 'untitled.md';
    return trimmed.toLowerCase().endsWith('.md')
        ? trimmed
        : `${trimmed}.md`;
};

export type InlineStyleKind = 'textColor' | 'highlight' | 'font';

export const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const sanitizeStyleValue = (value: string) =>
    value.replace(/[;"<>]/g, '').trim();

export const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getStyleDeclaration = (kind: InlineStyleKind, value: string) => {
    const cleanValue = sanitizeStyleValue(value);
    if (kind === 'textColor') return { property: 'color', value: cleanValue };
    if (kind === 'highlight')
        return { property: 'background-color', value: cleanValue };
    return { property: 'font-family', value: cleanValue };
};

export const mergeStyle = (
    currentStyle: string,
    kind: InlineStyleKind,
    value: string
) => {
    const styles = new Map<string, string>();
    currentStyle
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .forEach((declaration) => {
            const separatorIndex = declaration.indexOf(':');
            if (separatorIndex < 0) return;
            styles.set(
                declaration.slice(0, separatorIndex).trim().toLowerCase(),
                declaration.slice(separatorIndex + 1).trim()
            );
        });

    const nextStyle = getStyleDeclaration(kind, value);
    styles.set(nextStyle.property, nextStyle.value);

    return Array.from(styles.entries())
        .map(([property, styleValue]) => `${property}: ${styleValue}`)
        .join('; ');
};

export const getStyledMarkdown = (
    kind: InlineStyleKind,
    value: string,
    selectionText: string
) => {
    const content = escapeHtml(selectionText);
    return `<span style="${mergeStyle('', kind, value)}">${content}</span>`;
};

export const replaceSelectedTextInMarkdown = (
    source: string,
    selectedText: string,
    kind: InlineStyleKind,
    value: string
) => {
    const escapedSelection = escapeRegExp(escapeHtml(selectedText));
    const styledTextPattern = new RegExp(
        `<(span|mark)([^>]*)style=["']([^"']*)["']([^>]*)>${escapedSelection}</\\1>`,
        'i'
    );
    const styledTextMatch = source.match(styledTextPattern);
    if (styledTextMatch?.index !== undefined) {
        const [
            fullMatch,
            tagName,
            beforeStyle = '',
            currentStyle = '',
            afterStyle = '',
        ] = styledTextMatch;
        const merged = `<${tagName}${beforeStyle}style="${mergeStyle(currentStyle, kind, value)}"${afterStyle}>${escapeHtml(selectedText)}</${tagName}>`;
        return `${source.slice(0, styledTextMatch.index)}${merged}${source.slice(styledTextMatch.index + fullMatch.length)}`;
    }

    const replacement = getStyledMarkdown(kind, value, selectedText);
    const directIndex = source.indexOf(selectedText);
    if (directIndex >= 0) {
        return `${source.slice(0, directIndex)}${replacement}${source.slice(directIndex + selectedText.length)}`;
    }

    const normalizedSelection = selectedText.replace(/\s+/g, ' ').trim();
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const normalizedLine = line.replace(/\s+/g, ' ');
        const lineIndex = normalizedLine.indexOf(normalizedSelection);
        if (lineIndex >= 0) {
            const prefix = line.slice(0, lineIndex);
            const suffix = line.slice(lineIndex + normalizedSelection.length);
            lines[index] = `${prefix}${replacement}${suffix}`;
            return lines.join('\n');
        }
    }

    return source;
};

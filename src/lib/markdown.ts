// HTML element names that should be preserved inside markdown when found in <brackets>.
// Anything else (e.g. <nombre_rama>, <commit>, <archivo.zip>) is a placeholder, not HTML,
// and causes Lexical's parser to silently fail to render the document.
const KNOWN_HTML_ELEMENTS = new Set([
    'a',
    'abbr',
    'address',
    'area',
    'article',
    'aside',
    'audio',
    'b',
    'base',
    'bdi',
    'bdo',
    'blockquote',
    'body',
    'br',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'col',
    'colgroup',
    'data',
    'datalist',
    'dd',
    'del',
    'details',
    'dfn',
    'dialog',
    'div',
    'dl',
    'dt',
    'em',
    'embed',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'head',
    'header',
    'hgroup',
    'hr',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'link',
    'main',
    'map',
    'mark',
    'math',
    'menu',
    'meta',
    'meter',
    'nav',
    'noscript',
    'object',
    'ol',
    'optgroup',
    'option',
    'output',
    'p',
    'picture',
    'pre',
    'progress',
    'q',
    'rp',
    'rt',
    'ruby',
    's',
    'samp',
    'script',
    'section',
    'select',
    'slot',
    'small',
    'source',
    'span',
    'strong',
    'style',
    'sub',
    'summary',
    'sup',
    'svg',
    'table',
    'tbody',
    'td',
    'template',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'title',
    'tr',
    'track',
    'u',
    'ul',
    'var',
    'video',
    'wbr',
]);

export const normalizeMarkdownForRichEditor = (value: string): string => {
    // Step 1: strip HTML tags from heading lines (e.g. ## Heading <br/>)
    const withNormalizedHeadings = value
        .split('\n')
        .map((line) => {
            if (!/^\s*#{1,6}\s/.test(line) || !/[<>]/.test(line)) return line;
            return line
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replace(/\s{2,}/g, ' ')
                .trimEnd();
        })
        .join('\n');

    // Step 2: escape non-HTML angle-bracket placeholders like <nombre_rama>, <commit>, <archivo.zip>.
    // MDXEditor's internal pipeline (micromark) treats these as unclosed JSX elements and silently
    // fails to render the entire document. Backslash-escaping the < at tokenizer level (before any
    // entity decoding) is more reliable than HTML entities (&lt;) which can be decoded and re-exposed.
    const withEscapedPlaceholders = withNormalizedHeadings.replace(
        /<([^>]*)>/g,
        (match, inner) => {
            const trimmed = inner.trim();
            // Preserve HTML comments (<!-- ... -->) and DOCTYPE declarations
            if (trimmed.startsWith('!--') || /^!DOCTYPE/i.test(trimmed))
                return match;
            // Extract the element name (strip leading / for closing tags, stop at whitespace or /)
            const tagName = trimmed
                .replace(/^\//, '')
                .split(/[\s\n\r/]/)[0]
                .toLowerCase();
            // Only known HTML elements are safe to pass through to the MDX parser
            if (KNOWN_HTML_ELEMENTS.has(tagName)) return match;
            // Everything else is a placeholder — use backslash escape at tokenizer level
            return `\\<${inner}\\>`;
        }
    );

    // Step 3: escape bare { } that MDX treats as JS expression delimiters.
    // Any {text} or standalone { not part of a valid JS expression will cause a parse error.
    const withEscapedBraces = withEscapedPlaceholders.replace(/[{}]/g, (ch) =>
        ch === '{' ? '\\{' : '\\}'
    );

    // Step 4: escape bare '<' not followed by a valid HTML/JSX tag-start character.
    // The <tag> regex in step 2 only matches when there is a closing '>', so comparison
    // operators like "5 < 10" or "value < end" pass through as raw '<'. MDXEditor's MDX
    // pipeline (micromark) treats a bare '<' as an unclosed JSX element and silently
    // discards the entire document, leaving the editor blank.
    return withEscapedBraces.replace(/(?<!\\)<(?![a-zA-Z/!?])/g, '\\<');
};

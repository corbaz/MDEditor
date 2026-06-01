import {
    escapeHtml,
    sanitizeStyleValue,
    escapeRegExp,
    getStyleDeclaration,
    mergeStyle,
    getStyledMarkdown,
    replaceSelectedTextInMarkdown,
} from '../lib/inline-style';

// Characterization tests — pin ACTUAL current output.
// These tests describe what the function does today, not what it "should" do.
// Fixing quirky behavior is out of scope (spec R20).

describe('escapeHtml', () => {
    it('escapes < and >', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes &', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes double quote', () => {
        expect(escapeHtml('"value"')).toBe('&quot;value&quot;');
    });

    it('escapes single quote', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('returns plain text unchanged', () => {
        expect(escapeHtml('plain text')).toBe('plain text');
    });

    it('returns empty string unchanged', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('escapes all special chars in a combined string', () => {
        expect(escapeHtml('<a href="x">it\'s & fun</a>')).toBe(
            '&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; fun&lt;/a&gt;'
        );
    });
});

describe('sanitizeStyleValue', () => {
    it('returns safe value unchanged', () => {
        expect(sanitizeStyleValue('#fff')).toBe('#fff');
    });

    it('strips trailing semicolon', () => {
        expect(sanitizeStyleValue('red;')).toBe('red');
    });

    it('strips angle brackets', () => {
        expect(sanitizeStyleValue('<red>')).toBe('red');
    });

    it('trims surrounding whitespace', () => {
        expect(sanitizeStyleValue('  red  ')).toBe('red');
    });

    it('strips double quotes', () => {
        expect(sanitizeStyleValue('"red"')).toBe('red');
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeStyleValue('')).toBe('');
    });
});

describe('escapeRegExp', () => {
    it('escapes dot', () => {
        expect(escapeRegExp('a.b')).toBe('a\\.b');
    });

    it('escapes plus', () => {
        expect(escapeRegExp('a+b')).toBe('a\\+b');
    });

    it('escapes dollar sign', () => {
        expect(escapeRegExp('$100')).toBe('\\$100');
    });

    it('escapes parentheses', () => {
        expect(escapeRegExp('(test)')).toBe('\\(test\\)');
    });

    it('escapes asterisk and question mark', () => {
        expect(escapeRegExp('a*b?')).toBe('a\\*b\\?');
    });

    it('returns plain text unchanged', () => {
        expect(escapeRegExp('hello')).toBe('hello');
    });

    it('returns empty string unchanged', () => {
        expect(escapeRegExp('')).toBe('');
    });
});

describe('getStyleDeclaration', () => {
    it('returns color property for textColor kind', () => {
        expect(getStyleDeclaration('textColor', 'red')).toEqual({
            property: 'color',
            value: 'red',
        });
    });

    it('returns background-color property for highlight kind', () => {
        expect(getStyleDeclaration('highlight', 'yellow')).toEqual({
            property: 'background-color',
            value: 'yellow',
        });
    });

    it('returns font-family property for font kind', () => {
        expect(getStyleDeclaration('font', 'Arial')).toEqual({
            property: 'font-family',
            value: 'Arial',
        });
    });

    it('sanitizes the value (strips semicolons)', () => {
        expect(getStyleDeclaration('textColor', 'red;')).toEqual({
            property: 'color',
            value: 'red',
        });
    });
});

describe('mergeStyle', () => {
    it('sets a property on an empty style string', () => {
        expect(mergeStyle('', 'textColor', 'red')).toBe('color: red');
    });

    it('overwrites an existing property of the same kind', () => {
        expect(mergeStyle('color: blue', 'textColor', 'red')).toBe('color: red');
    });

    it('preserves unrelated properties when adding a new one', () => {
        const result = mergeStyle('background-color: yellow', 'textColor', 'red');
        expect(result).toContain('color: red');
        expect(result).toContain('background-color: yellow');
    });

    it('merges textColor and highlight independently', () => {
        const result = mergeStyle('color: blue; background-color: yellow', 'textColor', 'red');
        expect(result).toBe('color: red; background-color: yellow');
    });

    it('handles font-family', () => {
        expect(mergeStyle('', 'font', 'Arial')).toBe('font-family: Arial');
    });
});

describe('getStyledMarkdown', () => {
    it('wraps text in span with textColor style', () => {
        expect(getStyledMarkdown('textColor', 'red', 'hello')).toBe(
            '<span style="color: red">hello</span>'
        );
    });

    it('wraps text in span with highlight style', () => {
        expect(getStyledMarkdown('highlight', 'yellow', 'world')).toBe(
            '<span style="background-color: yellow">world</span>'
        );
    });

    it('HTML-escapes the selection text', () => {
        expect(getStyledMarkdown('textColor', 'red', '<b>bold</b>')).toBe(
            '<span style="color: red">&lt;b&gt;bold&lt;/b&gt;</span>'
        );
    });

    it('handles empty selection', () => {
        expect(getStyledMarkdown('textColor', 'red', '')).toBe(
            '<span style="color: red"></span>'
        );
    });
});

describe('replaceSelectedTextInMarkdown', () => {
    it('replaces plain text with a styled span', () => {
        const result = replaceSelectedTextInMarkdown('hello world', 'hello', 'textColor', 'red');
        expect(result).toBe('<span style="color: red">hello</span> world');
    });

    it('returns source unchanged when selection is not found', () => {
        const result = replaceSelectedTextInMarkdown('hello world', 'xyz', 'textColor', 'red');
        expect(result).toBe('hello world');
    });

    it('merges style when selection is already wrapped in a span with existing style', () => {
        const source = '<span style="color: blue">hello</span> world';
        const result = replaceSelectedTextInMarkdown(source, 'hello', 'textColor', 'red');
        expect(result).toBe('<span style="color: red">hello</span> world');
    });

    it('merges style when source is a span with mark tag', () => {
        const source = '<mark style="background-color: yellow">hello</mark> world';
        const result = replaceSelectedTextInMarkdown(source, 'hello', 'highlight', 'lime');
        expect(result).toContain('background-color: lime');
    });

    it('replaces only the first occurrence when text appears multiple times', () => {
        // Direct indexOf finds the first occurrence
        const result = replaceSelectedTextInMarkdown('hi hi', 'hi', 'textColor', 'red');
        expect(result).toBe('<span style="color: red">hi</span> hi');
    });

    it('handles selection with special HTML chars', () => {
        const result = replaceSelectedTextInMarkdown('a & b', 'a & b', 'textColor', 'red');
        expect(result).toBe('<span style="color: red">a &amp; b</span>');
    });
});

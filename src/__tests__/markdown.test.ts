import { normalizeMarkdownForRichEditor } from '../App';

// Characterization tests — pin ACTUAL current output.
// These tests describe what the function does today, not what it "should" do.
// Fixing quirky behavior is out of scope (spec R20).

describe('normalizeMarkdownForRichEditor', () => {
    describe('HTML stripping in heading lines', () => {
        it('strips <br/> from a heading line and collapses trailing space', () => {
            expect(normalizeMarkdownForRichEditor('## Title <br/>')).toBe('## Title');
        });

        it('strips arbitrary HTML tag from a heading line', () => {
            expect(normalizeMarkdownForRichEditor('# Heading <span>text</span>')).toBe('# Heading text');
        });

        it('does NOT strip HTML from a non-heading line', () => {
            const input = 'Some <b>bold</b> text';
            // non-heading: HTML passes through the stripping step; still may be
            // processed by the placeholder-escape step if not in KNOWN_HTML_ELEMENTS
            const result = normalizeMarkdownForRichEditor(input);
            expect(result).toBe('Some <b>bold</b> text');
        });

        it('preserves heading text when no HTML is present', () => {
            expect(normalizeMarkdownForRichEditor('## Plain heading')).toBe('## Plain heading');
        });
    });

    describe('non-HTML angle-bracket placeholder escaping', () => {
        it('escapes <nombre_rama>', () => {
            expect(normalizeMarkdownForRichEditor('<nombre_rama>')).toBe('\\<nombre_rama\\>');
        });

        it('escapes <commit>', () => {
            expect(normalizeMarkdownForRichEditor('<commit>')).toBe('\\<commit\\>');
        });

        it('escapes <archivo.zip>', () => {
            expect(normalizeMarkdownForRichEditor('<archivo.zip>')).toBe('\\<archivo.zip\\>');
        });

        it('does NOT escape known HTML element <br/>', () => {
            expect(normalizeMarkdownForRichEditor('<br/>')).toBe('<br/>');
        });

        it('does NOT escape known HTML element <div>', () => {
            expect(normalizeMarkdownForRichEditor('<div>')).toBe('<div>');
        });
    });

    describe('bare < escaping', () => {
        it('escapes bare < in comparison "5 < 10"', () => {
            expect(normalizeMarkdownForRichEditor('5 < 10')).toBe('5 \\< 10');
        });

        it('escapes < when not followed by tag-start characters', () => {
            expect(normalizeMarkdownForRichEditor('value < end')).toBe('value \\< end');
        });
    });

    describe('curly-brace escaping', () => {
        it('escapes single {value}', () => {
            expect(normalizeMarkdownForRichEditor('{value}')).toBe('\\{value\\}');
        });

        it('escapes standalone { and }', () => {
            expect(normalizeMarkdownForRichEditor('a { b } c')).toBe('a \\{ b \\} c');
        });
    });

    describe('HTML comment preservation', () => {
        it('preserves <!-- comment -->', () => {
            expect(normalizeMarkdownForRichEditor('<!-- comment -->')).toBe('<!-- comment -->');
        });

        it('preserves <!-- multi word comment -->', () => {
            expect(normalizeMarkdownForRichEditor('<!-- multi word comment -->')).toBe('<!-- multi word comment -->');
        });
    });

    describe('edge cases', () => {
        it('returns empty string unchanged', () => {
            expect(normalizeMarkdownForRichEditor('')).toBe('');
        });

        it('preserves plain text unchanged', () => {
            expect(normalizeMarkdownForRichEditor('just plain text')).toBe('just plain text');
        });

        it('handles multiline input', () => {
            const input = '## Heading <br/>\nSome text\n{code}';
            const result = normalizeMarkdownForRichEditor(input);
            expect(result).toBe('## Heading\nSome text\n\\{code\\}');
        });
    });
});

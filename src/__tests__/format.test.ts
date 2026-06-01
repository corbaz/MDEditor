import {
    formatFileSize,
    formatSavedAt,
    normalizeFileName,
    getByteSize,
} from '../lib/format';

// Characterization tests — pin ACTUAL current output.
// These tests describe what the function does today, not what it "should" do.
// Fixing quirky behavior is out of scope (spec R20).

describe('formatFileSize', () => {
    describe('bytes range (< 1024)', () => {
        it('formats 0 as "0 B"', () => {
            expect(formatFileSize(0)).toBe('0 B');
        });

        it('formats 1 as "1 B"', () => {
            expect(formatFileSize(1)).toBe('1 B');
        });

        it('formats 1023 as "1023 B"', () => {
            expect(formatFileSize(1023)).toBe('1023 B');
        });
    });

    describe('KB range (>= 1024, < 1024*1024)', () => {
        it('formats exactly 1024 as "1.0 KB" (< 10 KB: one decimal)', () => {
            expect(formatFileSize(1024)).toBe('1.0 KB');
        });

        it('formats 9 * 1024 (9216) as "9.0 KB" (still < 10 KB threshold)', () => {
            expect(formatFileSize(9 * 1024)).toBe('9.0 KB');
        });

        it('formats 10 * 1024 (10240) as "10 KB" (>= 10 KB: no decimal)', () => {
            expect(formatFileSize(10 * 1024)).toBe('10 KB');
        });

        it('formats 1024*1024 - 1 as "1024 KB"', () => {
            expect(formatFileSize(1024 * 1024 - 1)).toBe('1024 KB');
        });
    });

    describe('MB range (>= 1024*1024)', () => {
        it('formats exactly 1024*1024 as "1.0 MB" (< 10 MB: one decimal)', () => {
            expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
        });

        it('formats 1.5 * 1024 * 1024 as "1.5 MB"', () => {
            expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
        });

        it('formats 10 * 1024 * 1024 as "10 MB" (>= 10 MB: no decimal)', () => {
            expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
        });

        it('formats 10 * 1024 * 1024 + 1 as "10 MB"', () => {
            expect(formatFileSize(10 * 1024 * 1024 + 1)).toBe('10 MB');
        });
    });
});

describe('formatSavedAt', () => {
    it('returns "sin guardar" for null value with es locale', () => {
        expect(formatSavedAt(null, 'es')).toBe('sin guardar');
    });

    it('returns "not saved" for null value with en locale', () => {
        expect(formatSavedAt(null, 'en')).toBe('not saved');
    });

    it('returns "not saved" for 0 value with en locale (falsy)', () => {
        // value=0 is falsy — treated same as null
        expect(formatSavedAt(0, 'en')).toBe('not saved');
    });

    it('returns a non-empty string for a valid timestamp with es locale', () => {
        const ts = new Date('2024-06-15T12:00:00Z').getTime();
        const result = formatSavedAt(ts, 'es');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        // es locale uses dd/mm/yy format — should contain '15'
        expect(result).toContain('15');
    });

    it('returns a non-empty string for a valid timestamp with en locale', () => {
        const ts = new Date('2024-06-15T12:00:00Z').getTime();
        const result = formatSavedAt(ts, 'en');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        // en locale uses mm/dd/yy format — should contain '06' (June)
        expect(result).toContain('06');
    });

    it('produces different strings for es vs en locale for the same timestamp', () => {
        const ts = new Date('2024-01-15T12:00:00Z').getTime();
        const es = formatSavedAt(ts, 'es');
        const en = formatSavedAt(ts, 'en');
        expect(es).not.toBe(en);
    });
});

describe('normalizeFileName', () => {
    it('returns value unchanged when it already ends with .md', () => {
        expect(normalizeFileName('file.md')).toBe('file.md');
    });

    it('appends .md when extension is missing', () => {
        expect(normalizeFileName('file')).toBe('file.md');
    });

    it('does NOT append .md to .MD (case-sensitive endsWith)', () => {
        // Quirk: endsWith('.md') is case-sensitive — 'FILE.MD' does not end with '.md'
        expect(normalizeFileName('FILE.MD')).toBe('FILE.MD');
    });

    it('does NOT append .md to .MD uppercase extension', () => {
        expect(normalizeFileName('a.MD')).toBe('a.MD');
    });

    it('trims whitespace before checking', () => {
        expect(normalizeFileName('  doc  ')).toBe('doc.md');
    });

    it('returns "untitled.md" for an empty string', () => {
        expect(normalizeFileName('')).toBe('untitled.md');
    });

    it('returns "untitled.md" for whitespace-only string', () => {
        expect(normalizeFileName('   ')).toBe('untitled.md');
    });
});

describe('getByteSize', () => {
    it('returns 0 for empty string', () => {
        expect(getByteSize('')).toBe(0);
    });

    it('returns 3 for ASCII string "abc" (1 byte/char in UTF-8)', () => {
        expect(getByteSize('abc')).toBe(3);
    });

    it('returns 3 for euro sign "€" (3 bytes in UTF-8)', () => {
        expect(getByteSize('€')).toBe(3);
    });

    it('returns 4 for emoji "😀" (4 bytes in UTF-8)', () => {
        expect(getByteSize('😀')).toBe(4);
    });

    it('returns byte count, not character count', () => {
        // '€' is 1 char but 3 bytes; getByteSize should reflect UTF-8 byte length
        expect(getByteSize('€')).toBeGreaterThan('€'.length);
    });
});

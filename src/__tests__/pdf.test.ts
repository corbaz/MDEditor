import {
    getItemFontSize,
    computeHeadingThresholds,
    groupItemsIntoLines,
    buildPageMarkdown,
    decodePdfDataUrl,
} from '../App';

// Characterization tests — pin ACTUAL current output.
// These tests describe what the function does today, not what it "should" do.
// Fixing quirky behavior is out of scope (spec R20).

describe('getItemFontSize', () => {
    it('computes size from [3, 4] as 5 (Pythagorean)', () => {
        expect(getItemFontSize([3, 4])).toBe(5);
    });

    it('computes size from [12, 0] as 12', () => {
        expect(getItemFontSize([12, 0])).toBe(12);
    });

    it('returns 0 for undefined transform', () => {
        expect(getItemFontSize(undefined)).toBe(0);
    });

    it('returns 0 for empty array', () => {
        expect(getItemFontSize([])).toBe(0);
    });

    it('returns 0 for single-element array (length < 2)', () => {
        expect(getItemFontSize([12])).toBe(0);
    });

    it('rounds result: [5, 5] => Math.round(sqrt(50)) = 7', () => {
        expect(getItemFontSize([5, 5])).toBe(7);
    });
});

describe('computeHeadingThresholds', () => {
    it('returns defaults when sizes array is empty', () => {
        expect(computeHeadingThresholds([])).toEqual({ h1: 22, h2: 16, h3: 13, body: 11 });
    });

    it('returns defaults when all sizes are zero or negative', () => {
        expect(computeHeadingThresholds([0, 0, -1])).toEqual({ h1: 22, h2: 16, h3: 13, body: 11 });
    });

    it('picks most-frequent size as body and derives thresholds', () => {
        // body=11 (3 times), h1=11*1.85, h2=11*1.4, h3=11*1.15
        const result = computeHeadingThresholds([11, 11, 11, 14, 22]);
        expect(result.body).toBe(11);
        expect(result.h1).toBe(20.35);
        expect(result.h2).toBeCloseTo(15.4, 5);
        expect(result.h3).toBeCloseTo(12.65, 5);
    });

    it('uses single-element array as body', () => {
        const result = computeHeadingThresholds([10]);
        expect(result.body).toBe(10);
        expect(result.h1).toBe(18.5);
    });
});

describe('groupItemsIntoLines', () => {
    it('returns empty array for empty input', () => {
        expect(groupItemsIntoLines([])).toEqual([]);
    });

    it('groups items with the same Y into one line, sorted left-to-right', () => {
        const items = [
            { str: 'World', transform: [12, 0, 0, 12, 50, 100] },
            { str: 'Hello', transform: [12, 0, 0, 12, 10, 100] },
        ];
        const result = groupItemsIntoLines(items);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Hello World');
    });

    it('produces two separate lines for distinct Y values', () => {
        const items = [
            { str: 'Hello', transform: [12, 0, 0, 12, 10, 100] },
            { str: 'Line2', transform: [12, 0, 0, 12, 10, 200] },
        ];
        const result = groupItemsIntoLines(items);
        expect(result).toHaveLength(2);
    });

    it('sorts lines top-to-bottom (descending Y)', () => {
        const items = [
            { str: 'Hello', transform: [12, 0, 0, 12, 10, 100] },
            { str: 'Line2', transform: [12, 0, 0, 12, 10, 200] },
        ];
        const result = groupItemsIntoLines(items);
        // Higher Y comes first (top of page)
        expect(result[0].y).toBe(200);
        expect(result[1].y).toBe(100);
    });

    it('skips items with empty or whitespace-only str', () => {
        const items = [
            { str: '', transform: [12, 0, 0, 12, 10, 100] },
            { str: '   ', transform: [12, 0, 0, 12, 20, 100] },
            { str: 'Hi', transform: [12, 0, 0, 12, 30, 100] },
        ];
        const result = groupItemsIntoLines(items);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Hi');
    });

    it('groups items within Y tolerance of 2 into one line', () => {
        const items = [
            { str: 'A', transform: [12, 0, 0, 12, 10, 100] },
            { str: 'B', transform: [12, 0, 0, 12, 50, 101] }, // y=101, within tolerance 2 of y=100
        ];
        const result = groupItemsIntoLines(items);
        expect(result).toHaveLength(1);
    });

    it('uses fontSize from the item with the largest computed size', () => {
        const items = [
            { str: 'Small', transform: [12, 0, 0, 12, 10, 100] },
            { str: 'Big', transform: [24, 0, 0, 24, 50, 100] },
        ];
        const result = groupItemsIntoLines(items);
        expect(result[0].fontSize).toBe(24);
    });
});

describe('buildPageMarkdown', () => {
    const thresholds = { h1: 22, h2: 16, h3: 13, body: 11 };

    it('returns empty string when lines and images are both empty', () => {
        expect(buildPageMarkdown([], [], thresholds, 'Página', 1)).toBe('');
    });

    it('renders lines above h1 threshold as ### heading', () => {
        const lines = [{ text: 'Big Title', fontSize: 24, y: 700 }];
        const result = buildPageMarkdown(lines, [], thresholds, 'Página', 1);
        expect(result).toBe('### Big Title');
    });

    it('renders lines above h2 threshold as #### heading', () => {
        const lines = [{ text: 'Section', fontSize: 17, y: 700 }];
        const result = buildPageMarkdown(lines, [], thresholds, 'Página', 1);
        expect(result).toBe('#### Section');
    });

    it('renders lines above h3 threshold as ##### heading', () => {
        const lines = [{ text: 'Sub', fontSize: 14, y: 700 }];
        const result = buildPageMarkdown(lines, [], thresholds, 'Página', 1);
        expect(result).toBe('##### Sub');
    });

    it('renders body text as a paragraph', () => {
        const lines = [{ text: 'Body text', fontSize: 11, y: 600 }];
        const result = buildPageMarkdown(lines, [], thresholds, 'Página', 1);
        expect(result).toBe('Body text');
    });

    it('combines heading and body text with blank line between', () => {
        const lines = [
            { text: 'Big Title', fontSize: 24, y: 700 },
            { text: 'Body text', fontSize: 11, y: 600 },
        ];
        const result = buildPageMarkdown(lines, [], thresholds, 'Página', 1);
        expect(result).toBe('### Big Title\n\nBody text');
    });

    it('appends image markdown for each image', () => {
        const images = ['data:image/jpeg;base64,/9j/abc'];
        const result = buildPageMarkdown([], images, thresholds, 'Página', 1);
        expect(result).toBe(`![Página 1 imagen 1](data:image/jpeg;base64,/9j/abc)`);
    });

    it('numbers multiple images sequentially', () => {
        const images = ['url1', 'url2'];
        const result = buildPageMarkdown([], images, thresholds, 'Página', 2);
        expect(result).toContain('imagen 1');
        expect(result).toContain('imagen 2');
    });
});

describe('decodePdfDataUrl', () => {
    it('decodes a base64 data URL to a Uint8Array', () => {
        // 'QUJD' is base64 for 'ABC' (bytes 65, 66, 67)
        const result = decodePdfDataUrl('data:application/pdf;base64,QUJD');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([65, 66, 67]);
    });

    it('returns empty Uint8Array for missing base64 part', () => {
        const result = decodePdfDataUrl('data:application/pdf;base64,');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBe(0);
    });

    it('extracts only the base64 portion after the comma', () => {
        // 'dGVzdA==' is base64 for 'test'
        const result = decodePdfDataUrl('data:application/pdf;base64,dGVzdA==');
        expect(result.length).toBe(4);
        expect(Array.from(result)).toEqual([116, 101, 115, 116]);
    });
});

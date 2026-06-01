export type PdfTextItem = {
    str?: string;
    hasEOL?: boolean;
    transform?: number[]; // [a, b, c, d, x, y] — current text matrix
    width?: number;
};

export type PdfRawLine = {
    text: string;
    fontSize: number;
    y: number;
};

export type PdfImageData = {
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
    kind?: number;
};

export type PdfPageLike = {
    objs: { get: (ref: string, cb: (d: PdfImageData | null) => void) => void };
    commonObjs: {
        get: (ref: string, cb: (d: PdfImageData | null) => void) => void;
    };
};

/** pdfjs operator codes that represent raster image drawing. */
export const PDF_IMAGE_OPS = new Set([82, 83, 85, 88]); // paintJpegXObject | paintInlineImageXObject | paintImageXObject | paintImageMaskXObject
export const PDF_MIN_IMAGE_PX = 50; // skip icons / decorations smaller than this

export const decodePdfDataUrl = (dataUrl: string) => {
    const [, base64 = ''] = dataUrl.split(',', 2);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
};

/** Font size from a pdfjs text matrix [a, b, c, d, x, y]. */
export const getItemFontSize = (transform: number[] | undefined): number => {
    if (!transform || transform.length < 2) return 0;
    return Math.round(Math.sqrt(transform[0] ** 2 + transform[1] ** 2));
};

/** Determine font-size thresholds for h1/h2/h3 based on the modal body size. */
export const computeHeadingThresholds = (
    sizes: number[]
): { h1: number; h2: number; h3: number; body: number } => {
    const pos = sizes.filter((s) => s > 0);
    if (!pos.length) return { h1: 22, h2: 16, h3: 13, body: 11 };

    const freq = new Map<number, number>();
    for (const s of pos) freq.set(s, (freq.get(s) ?? 0) + 1);
    const body = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    return { h1: body * 1.85, h2: body * 1.4, h3: body * 1.15, body };
};

/** Group pdfjs text items into visual lines sorted top → bottom. */
export const groupItemsIntoLines = (items: PdfTextItem[]): PdfRawLine[] => {
    const Y_TOL = 2;
    const groups = new Map<
        number,
        Array<{ x: number; text: string; fontSize: number }>
    >();

    for (const item of items) {
        const str = (item.str ?? '').replace(/\s+/g, ' ');
        if (!str) continue;

        const t = item.transform;
        const y = t ? Math.round(t[5]) : 0;
        const x = t ? (t[4] ?? 0) : 0;
        const fontSize = getItemFontSize(t);

        let key: number | undefined;
        for (const k of groups.keys()) {
            if (Math.abs(k - y) <= Y_TOL) {
                key = k;
                break;
            }
        }
        const groupY = key ?? y;
        if (!groups.has(groupY)) groups.set(groupY, []);
        groups.get(groupY)!.push({ x, text: str, fontSize });
    }

    return [...groups.entries()]
        .sort((a, b) => b[0] - a[0]) // descending Y → top of page first
        .map(([y, parts]) => {
            const sorted = [...parts].sort((a, b) => a.x - b.x);
            return {
                y,
                text: sorted
                    .map((p) => p.text)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim(),
                fontSize: Math.max(...sorted.map((p) => p.fontSize)),
            };
        })
        .filter((l) => l.text.length > 0);
};

/** Build the markdown block for a single PDF page (no page-header wrapper). */
export const buildPageMarkdown = (
    lines: PdfRawLine[],
    images: string[],
    thresholds: { h1: number; h2: number; h3: number; body: number },
    pageLabel: string,
    pageNum: number
): string => {
    if (!lines.length && !images.length) return '';

    const parts: string[] = [];
    let para: string[] = [];
    const paraGap = thresholds.body * 2.5;

    const flushPara = () => {
        if (para.length) {
            parts.push(para.join(' '));
            para = [];
        }
    };

    let prevY: number | null = null;

    for (const { text, fontSize, y } of lines) {
        const gap = prevY !== null ? prevY - y : 0;
        prevY = y;

        // Headings are shifted one level down (###/####/#####) so they nest
        // cleanly under the ## Page N section header added by the caller.
        if (fontSize >= thresholds.h1) {
            flushPara();
            parts.push(`### ${text}`);
        } else if (fontSize >= thresholds.h2) {
            flushPara();
            parts.push(`#### ${text}`);
        } else if (fontSize >= thresholds.h3) {
            flushPara();
            parts.push(`##### ${text}`);
        } else {
            if (gap > paraGap) flushPara();
            para.push(text);
        }
    }
    flushPara();

    for (let j = 0; j < images.length; j++) {
        parts.push(`![${pageLabel} ${pageNum} imagen ${j + 1}](${images[j]})`);
    }

    return parts.join('\n\n').trim();
};

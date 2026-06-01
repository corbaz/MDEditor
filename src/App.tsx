import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
    GlobalWorkerOptions,
    getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
    ChevronDown,
    Download,
    Eye,
    ExternalLink,
    FilePlus,
    Folder,
    FolderOpen,
    Highlighter,
    Palette,
    Printer,
    Save,
    Trash2,
    X,
} from 'lucide-react';
import {
    BlockTypeSelect,
    BoldItalicUnderlineToggles,
    CodeToggle,
    CreateLink,
    InsertCodeBlock,
    InsertImage,
    InsertTable,
    InsertThematicBreak,
    StrikeThroughSupSubToggles,
    codeBlockPlugin,
    codeMirrorPlugin,
    headingsPlugin,
    imagePlugin,
    linkDialogPlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    quotePlugin,
    tablePlugin,
    thematicBreakPlugin,
    toolbarPlugin,
    type MDXEditorMethods,
    ListsToggle,
    MDXEditor,
    UndoRedo,
} from '@mdxeditor/editor';
import './App.css';
import { getByteSize, formatFileSize, formatSavedAt, normalizeFileName, type Locale } from './lib/format';
import { normalizeMarkdownForRichEditor } from './lib/markdown';

type Theme = 'light' | 'dark';
type ViewMode = 'editor' | 'source' | 'preview';
type MaybeFileHandle = {
    name?: string;
    createWritable?: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
    }>;
};

type RecentDocument = {
    filename: string;
    updatedAt: number;
    filePath?: string;
    folderPath?: string;
    sizeBytes?: number;
};

type LocalFontData = {
    family: string;
};

type WindowWithLocalFonts = Window & {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
};

type InlineStyleKind = 'textColor' | 'highlight' | 'font';

type PdfViewerDocument = {
    filePath: string;
    filename: string;
    dataUrl: string;
};

type EditorDocument = {
    filename: string;
    markdown: string;
    updatedAt?: number;
    filePath?: string;
    folderPath?: string;
    sizeBytes?: number;
};

type PdfTextItem = {
    str?: string;
    hasEOL?: boolean;
    transform?: number[]; // [a, b, c, d, x, y] — current text matrix
    width?: number;
};

type PdfRawLine = {
    text: string;
    fontSize: number;
    y: number;
};

type PdfImageData = {
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
    kind?: number;
};

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const isRenderableImageSrc = (src: string) =>
    /^(data:image\/|https?:\/\/|blob:)/i.test(src);

const toLocalImagePath = (src: string) => {
    const decoded = decodeURI(src.trim()).replace(/^@/, '');
    if (decoded.startsWith('file://')) return decoded.replace(/^file:\/\//, '');
    if (decoded.startsWith('/')) return decoded;
    return null;
};


export const decodePdfDataUrl = (dataUrl: string) => {
    const [, base64 = ''] = dataUrl.split(',', 2);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
};

// ── PDF extraction helpers ────────────────────────────────────────────────

/** pdfjs operator codes that represent raster image drawing. */
const PDF_IMAGE_OPS = new Set([82, 83, 85, 88]); // paintJpegXObject | paintInlineImageXObject | paintImageXObject | paintImageMaskXObject
const PDF_MIN_IMAGE_PX = 50; // skip icons / decorations smaller than this

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

/** Resolve an image XObject from the page's object store (async-safe). */
const resolvePageObject = (
    page: {
        objs: {
            get: (ref: string, cb: (d: PdfImageData | null) => void) => void;
        };
        commonObjs: {
            get: (ref: string, cb: (d: PdfImageData | null) => void) => void;
        };
    },
    ref: string
): Promise<PdfImageData | null> =>
    new Promise((resolve) => {
        let settled = false;
        const done = (data: PdfImageData | null) => {
            if (!settled) {
                settled = true;
                resolve(data ?? null);
            }
        };
        try {
            page.objs.get(ref, done);
        } catch {
            try {
                page.commonObjs.get(ref, done);
            } catch {
                done(null);
            }
        }
        // Safety: never hang if the object is not reachable
        setTimeout(() => done(null), 5_000);
    });

/** Convert raw pdfjs image data (any kind) to a JPEG data URL via canvas. */
const pdfImageToDataUrl = (imgData: {
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
    kind?: number;
}): string | null => {
    try {
        const { data, width, height, kind } = imgData;
        if (!width || !height) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        let rgba: Uint8ClampedArray;

        if (kind === 1) {
            // GRAYSCALE_1BPP — 1 bit/pixel, rows byte-aligned, MSB first
            const bpr = Math.ceil(width / 8);
            rgba = new Uint8ClampedArray(width * height * 4);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const bit = (data[r * bpr + (c >> 3)] >> (7 - (c & 7))) & 1;
                    const v = bit ? 0 : 255; // 1 = ink (black), 0 = paper (white)
                    const px = (r * width + c) * 4;
                    rgba[px] = v;
                    rgba[px + 1] = v;
                    rgba[px + 2] = v;
                    rgba[px + 3] = 255;
                }
            }
        } else if (kind === 2) {
            // RGB_24BPP — 3 bytes/pixel
            rgba = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < width * height; i++) {
                const s = i * 3;
                const d = i * 4;
                rgba[d] = data[s];
                rgba[d + 1] = data[s + 1];
                rgba[d + 2] = data[s + 2];
                rgba[d + 3] = 255;
            }
        } else {
            // RGBA_32BPP (kind === 3) or unknown — treat as 4 bytes/pixel
            if (data.length !== width * height * 4) return null;
            if (data instanceof Uint8ClampedArray) {
                rgba = data;
            } else {
                // Copy to a plain ArrayBuffer to satisfy ImageData constructor
                const plain = data.buffer.slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength
                ) as ArrayBuffer;
                rgba = new Uint8ClampedArray(plain);
            }
        }

        ctx.putImageData(
            new ImageData(
                rgba as Uint8ClampedArray<ArrayBuffer>,
                width,
                height
            ),
            0,
            0
        );
        return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
        return null;
    }
};

type PdfPageLike = {
    objs: { get: (ref: string, cb: (d: PdfImageData | null) => void) => void };
    commonObjs: {
        get: (ref: string, cb: (d: PdfImageData | null) => void) => void;
    };
};

/** Extract all raster images from a page, returning JPEG data URLs.
 *  Requires ops from page.getOperatorList() (pre-fetched, shared with text pass). */
const extractPageImages = async (
    page: PdfPageLike,
    ops: { fnArray: number[]; argsArray: unknown[][] }
): Promise<string[]> => {
    const seen = new Set<string>();
    const urls: string[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
        if (!PDF_IMAGE_OPS.has(ops.fnArray[i])) continue;

        const ref = String(ops.argsArray[i]?.[0] ?? '');
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);

        const imgData = await resolvePageObject(page, ref);
        if (
            !imgData?.data ||
            (imgData.width ?? 0) < PDF_MIN_IMAGE_PX ||
            (imgData.height ?? 0) < PDF_MIN_IMAGE_PX
        )
            continue;

        const url = pdfImageToDataUrl(imgData);
        if (url) urls.push(url);
    }

    return urls;
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

// ── Main extraction entry point ───────────────────────────────────────────

const extractMarkdownFromPdf = async (
    dataUrl: string,
    filename: string,
    locale: Locale
): Promise<string> => {
    const loadingTask = getDocument({ data: decodePdfDataUrl(dataUrl) });

    try {
        const pdfDocument = await loadingTask.promise;
        const pageContents: Array<{ lines: PdfRawLine[]; images: string[] }> =
            [];
        const allFontSizes: number[] = [];

        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum += 1) {
            const page = await pdfDocument.getPage(pageNum);

            // Run text extraction and image resource loading in parallel
            const [textContent, ops] = await Promise.all([
                page.getTextContent(),
                page.getOperatorList(),
            ]);

            const lines = groupItemsIntoLines(
                textContent.items as PdfTextItem[]
            );
            lines.forEach((l) => allFontSizes.push(l.fontSize));

            const images = await extractPageImages(page, ops);
            pageContents.push({ lines, images });

            page.cleanup?.();
        }

        // Two-pass: collect all font sizes → compute thresholds → build markdown
        const thresholds = computeHeadingThresholds(allFontSizes);
        const pageLabel = locale === 'es' ? 'Pagina' : 'Page';
        const title = filename.replace(/\.[^.]+$/u, '') || 'document';

        const sections = pageContents
            .map((content, i) => {
                const md = buildPageMarkdown(
                    content.lines,
                    content.images,
                    thresholds,
                    pageLabel,
                    i + 1
                );
                if (!md) return '';
                if (pageContents.length === 1) return md;
                return `## ${pageLabel} ${i + 1}\n\n${md}`;
            })
            .filter(Boolean);

        return [`# ${title}`, ...sections].join('\n\n---\n\n').trim() + '\n';
    } finally {
        await loadingTask.destroy();
    }
};

function PreviewImage({
    src = '',
    alt = '',
    width,
    height,
}: {
    src?: string;
    alt?: string;
    width?: string | number;
    height?: string | number;
}) {
    const [resolvedImage, setResolvedImage] = useState({
        source: src,
        resolved: src,
    });
    const localPath = toLocalImagePath(src);
    const shouldResolveLocalImage =
        Boolean(localPath) && !isRenderableImageSrc(src);
    const displaySrc =
        shouldResolveLocalImage && resolvedImage.source === src
            ? resolvedImage.resolved
            : src;

    useEffect(() => {
        let cancelled = false;
        const localPath = toLocalImagePath(src);

        if (!localPath || isRenderableImageSrc(src)) return;

        const loadLocalImage = async () => {
            try {
                const dataUrl =
                    await window.electronAPI?.readLocalImageAsDataUrl(
                        localPath
                    );
                if (!cancelled)
                    setResolvedImage({ source: src, resolved: dataUrl ?? src });
            } catch {
                if (!cancelled)
                    setResolvedImage({ source: src, resolved: src });
            }
        };

        void loadLocalImage();

        return () => {
            cancelled = true;
        };
    }, [src]);

    return (
        <img
            className="previewImage"
            src={displaySrc}
            alt={alt}
            width={width}
            height={height}
            style={{
                maxWidth: '100%',
                width: width ? undefined : 'auto',
                height: height ? undefined : 'auto',
            }}
        />
    );
}

const initialMarkdown = '';

const textColors = [
    '#111827',
    '#dc2626',
    '#2563eb',
    '#16a34a',
    '#9333ea',
    '#ea580c',
];
const highlightColors = [
    '#fef08a',
    '#bbf7d0',
    '#bfdbfe',
    '#fecdd3',
    '#e9d5ff',
    '#fed7aa',
];
const fallbackFonts = [
    'System',
    'Arial',
    'Calibri',
    'Cambria',
    'Georgia',
    'Helvetica',
    'Menlo',
    'Segoe UI',
    'Times New Roman',
    'Verdana',
];

const getReadableMarkdown = (value: string) =>
    value.replace(
        /data:image\/[^)\s"']+/gi,
        (match) => `${match.slice(0, 100)}...`
    );


const fileToBase64 = async (file: File) => {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(
            ...bytes.subarray(index, index + chunkSize)
        );
    }

    return btoa(binary);
};

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

const esTranslations: Record<string, string> = {
    Undo: 'Deshacer',
    Redo: 'Rehacer',
    Bold: 'Negrita',
    Italic: 'Cursiva',
    Underline: 'Subrayado',
    Strikethrough: 'Tachado',
    Superscript: 'Superíndice',
    Subscript: 'Subíndice',
    Code: 'Código',
    Paragraph: 'Párrafo',
    Quote: 'Cita',
    'Bulleted list': 'Lista con viñetas',
    'Numbered list': 'Lista numerada',
    'Task list': 'Lista de tareas',
    'Create link': 'Crear enlace',
    'Insert image': 'Insertar imagen',
    'Insert table': 'Insertar tabla',
    'Insert code block': 'Insertar bloque de código',
    'Insert thematic break': 'Insertar separador',
    'Rich text': 'Texto enriquecido',
    Source: 'Fuente',
    Diff: 'Diferencias',
    'Upload an image': 'Subir una imagen',
    'Upload an image from your device:':
        'Subir una imagen desde tu dispositivo:',
    'Or add an image from an URL:': 'O agregar una imagen desde una URL:',
    'Add an image from an URL:': 'Agregar una imagen desde una URL:',
    'Select or paste an image src': 'Selecciona o pega una URL de imagen',
    'Alt:': 'Texto alternativo:',
    'Title:': 'Título:',
    'Width:': 'Ancho:',
    'Height:': 'Alto:',
    Save: 'Guardar',
    Cancel: 'Cancelar',
    URL: 'URL',
    'Select or paste an URL': 'Selecciona o pega una URL',
    'Anchor text': 'Texto del enlace',
    'Link title': 'Título del enlace',
    'Set URL': 'Guardar URL',
    'Cancel change': 'Cancelar cambio',
    'Edit link URL': 'Editar enlace',
    'Copy to clipboard': 'Copiar al portapapeles',
    'Copied!': 'Copiado!',
    'Remove link': 'Eliminar enlace',
};

function App() {
    const [locale, setLocale] = useState<Locale>('es');
    const [theme, setTheme] = useState<Theme>('dark');
    const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
    const [pdfViewerDocument, setPdfViewerDocument] =
        useState<PdfViewerDocument | null>(null);
    const [pdfViewerUrl, setPdfViewerUrl] = useState('');
    const [editorDocumentKey, setEditorDocumentKey] = useState('document.md');
    const [markdown, setMarkdown] = useState(initialMarkdown);
    const [fileName, setFileName] = useState('document.md');
    const [filePath, setFilePath] = useState('');
    const [folderPath, setFolderPath] = useState('');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [fileHandle, setFileHandle] = useState<MaybeFileHandle | null>(null);
    const [isLoadingLatest, setIsLoadingLatest] = useState(true);
    const [isLoadingDocument, setIsLoadingDocument] = useState(false);
    const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(
        []
    );
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isEditingFileName, setIsEditingFileName] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('editor');
    const [selectedTextColor, setSelectedTextColor] = useState(textColors[0]);
    const [selectedHighlightColor, setSelectedHighlightColor] = useState(
        highlightColors[0]
    );
    const [selectedFont, setSelectedFont] = useState(fallbackFonts[0]);
    const [availableFonts, setAvailableFonts] = useState(fallbackFonts);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
        'idle'
    );
    const editorRef = useRef<MDXEditorMethods>(null);
    const previewExportRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileNameInputRef = useRef<HTMLInputElement>(null);
    const hasLoadedLatestRef = useRef(false);
    const lastPersistedRef = useRef('');
    const lastSelectedTextRef = useRef('');
    const fileNameBeforeEditRef = useRef('');
    const saveStatusTimeoutRef = useRef<number | null>(null);
    const lastAutoSavedSignatureRef = useRef('');
    const pendingEditorMarkdownRef = useRef<string | null>(null);

    const translation = (
        key: string,
        defaultValue: string,
        interpolations?: Record<string, string | number>
    ) => {
        if (key === 'toolbar.blockTypes.heading' && interpolations?.level) {
            return `H${interpolations.level}`;
        }

        const translated =
            locale === 'en'
                ? defaultValue
                : (esTranslations[defaultValue] ?? defaultValue);
        return Object.entries(interpolations ?? {}).reduce(
            (label, [name, value]) =>
                label.replaceAll(`{{${name}}}`, String(value)),
            translated
        );
    };

    const imageUploadHandler = useMemo(
        () => async (image: File) => {
            const base64 = await fileToBase64(image);
            const savedPath = await window.electronAPI?.saveImageFile({
                name: image.name,
                type: image.type,
                base64,
            });

            if (savedPath) return savedPath;

            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('image read failed'));
                reader.readAsDataURL(image);
            });
        },
        []
    );

    useEffect(() => {
        window.localStorage.setItem('md-editor-theme', theme);
        document.documentElement.style.colorScheme = theme;
        document.documentElement.dataset.appTheme = theme;
    }, [theme]);

    const imagePreviewHandler = useMemo(
        () => async (src: string) => {
            const localPath = toLocalImagePath(src);
            if (!localPath || isRenderableImageSrc(src)) return src;

            try {
                return (
                    (await window.electronAPI?.readLocalImageAsDataUrl(
                        localPath
                    )) ?? src
                );
            } catch {
                return src;
            }
        },
        []
    );

    const getContent = useCallback(() => markdown, [markdown]);

    const currentSizeBytes = useMemo(() => getByteSize(markdown), [markdown]);

    const getDocumentSignature = useCallback(
        (
            nextFileName = fileName,
            nextMarkdown = markdown,
            nextFilePath = filePath
        ) => `${nextFileName}\n${nextFilePath}\n${nextMarkdown}`,
        [fileName, filePath, markdown]
    );

    const rememberSavedSignature = useCallback(
        (
            nextFileName = fileName,
            nextMarkdown = markdown,
            nextFilePath = filePath
        ) => {
            lastAutoSavedSignatureRef.current = getDocumentSignature(
                nextFileName,
                nextMarkdown,
                nextFilePath
            );
        },
        [fileName, filePath, getDocumentSignature, markdown]
    );

    const showSavedState = useCallback(() => {
        setSaveStatus('saved');
        if (saveStatusTimeoutRef.current !== null) {
            window.clearTimeout(saveStatusTimeoutRef.current);
        }
        saveStatusTimeoutRef.current = window.setTimeout(() => {
            setSaveStatus('idle');
        }, 1400);
    }, []);

    const refreshRecentDocuments = useCallback(async () => {
        const recent = await window.electronAPI?.loadRecentDocuments();
        setRecentDocuments(recent ?? []);
    }, []);

    useEffect(() => {
        return () => {
            if (saveStatusTimeoutRef.current !== null) {
                window.clearTimeout(saveStatusTimeoutRef.current);
            }
        };
    }, []);

    const persistLatestDocument = useCallback(
        async (
            nextFileName = fileName,
            nextMarkdown = markdown,
            refreshHistory = false,
            metadata: {
                filePath?: string;
                folderPath?: string;
                sizeBytes?: number;
                previousFilename?: string;
            } = {}
        ) => {
            const nextFilePath = metadata.filePath ?? filePath;
            const nextFolderPath = metadata.folderPath ?? folderPath;
            const nextSizeBytes =
                metadata.sizeBytes ?? getByteSize(nextMarkdown);
            const signature = `${nextFileName}\n${nextFilePath}\n${nextMarkdown}`;
            if (signature === lastPersistedRef.current) return;
            lastPersistedRef.current = signature;

            const saved = await window.electronAPI?.saveLatestDocument({
                filename: nextFileName,
                markdown: nextMarkdown,
                filePath: nextFilePath,
                folderPath: nextFolderPath,
                sizeBytes: nextSizeBytes,
                previousFilename: metadata.previousFilename,
            });
            setLastSavedAt(saved?.updatedAt ?? Date.now());
            if (refreshHistory) await refreshRecentDocuments();
        },
        [fileName, filePath, folderPath, markdown, refreshRecentDocuments]
    );

    useEffect(() => {
        let cancelled = false;

        const loadLatestDocument = async () => {
            const latest = await window.electronAPI?.loadLatestDocument();
            if (cancelled) return;

            const rawMarkdown = latest?.markdown ?? '';
            const nextMarkdown = normalizeMarkdownForRichEditor(rawMarkdown);
            const nextFileName = latest?.filename || 'document.md';
            const nextFilePath = latest?.filePath ?? '';
            pendingEditorMarkdownRef.current = nextMarkdown;
            setMarkdown(nextMarkdown);
            setFileName(nextFileName);
            setFilePath(nextFilePath);
            setFolderPath(latest?.folderPath ?? '');
            setLastSavedAt(latest?.updatedAt ?? null);
            setEditorDocumentKey(
                `${nextFileName}\n${nextFilePath}\n${latest?.updatedAt ?? 0}`
            );
            await refreshRecentDocuments();
            lastAutoSavedSignatureRef.current = `${nextFileName}\n${nextFilePath}\n${nextMarkdown}`;
            hasLoadedLatestRef.current = true;
            setIsLoadingLatest(false);
        };

        void loadLatestDocument();

        return () => {
            cancelled = true;
        };
    }, [refreshRecentDocuments]);

    useEffect(() => {
        const content = pendingEditorMarkdownRef.current;
        if (content === null) return;
        let raf2: number;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                editorRef.current?.setMarkdown(content);
                pendingEditorMarkdownRef.current = null;
                setIsLoadingDocument(false);
            });
        });
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, [editorDocumentKey]);

    const loadMarkdownIntoEditor = useCallback(
        async (document: EditorDocument, refreshHistory = true) => {
            setIsLoadingDocument(true);
            const normalizedMarkdown = normalizeMarkdownForRichEditor(
                document.markdown
            );
            pendingEditorMarkdownRef.current = normalizedMarkdown;

            setMarkdown(normalizedMarkdown);
            setFileName(document.filename || 'document.md');
            setFilePath(document.filePath ?? '');
            setFolderPath(document.folderPath ?? '');
            setLastSavedAt(document.updatedAt ?? Date.now());
            setFileHandle(null);
            setEditorDocumentKey(
                `${document.filename || 'document.md'}\n${document.filePath ?? ''}\n${document.updatedAt ?? Date.now()}`
            );
            setViewMode('editor');
            setIsHistoryOpen(false);
            setIsEditingFileName(false);

            await persistLatestDocument(
                document.filename,
                normalizedMarkdown,
                refreshHistory,
                {
                    filePath: document.filePath,
                    folderPath: document.folderPath,
                    sizeBytes: document.sizeBytes,
                }
            );
            rememberSavedSignature(
                document.filename,
                normalizedMarkdown,
                document.filePath ?? ''
            );
        },
        [persistLatestDocument, rememberSavedSignature]
    );

    const autosaveDocument = useCallback(async () => {
        const content = getContent();
        const signature = getDocumentSignature(fileName, content, filePath);

        if (signature === lastAutoSavedSignatureRef.current) return;

        setSaveStatus('saving');

        try {
            if (filePath) {
                const saved = await window.electronAPI?.writeMarkdownFile?.({
                    filePath,
                    markdown: content,
                });

                if (saved) {
                    setFileName(saved.filename);
                    setFilePath(saved.filePath);
                    setFolderPath(saved.folderPath);
                    setLastSavedAt(saved.updatedAt);
                    await persistLatestDocument(
                        saved.filename,
                        content,
                        false,
                        {
                            filePath: saved.filePath,
                            folderPath: saved.folderPath,
                            sizeBytes: saved.sizeBytes,
                        }
                    );
                    rememberSavedSignature(
                        saved.filename,
                        content,
                        saved.filePath
                    );
                    showSavedState();
                    return;
                }
            }

            if (fileHandle?.createWritable) {
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                setLastSavedAt(Date.now());
                await persistLatestDocument(fileName, content, false, {
                    sizeBytes: getByteSize(content),
                });
                rememberSavedSignature(fileName, content, filePath);
                showSavedState();
                return;
            }

            await persistLatestDocument(fileName, content, false);
            rememberSavedSignature(fileName, content, filePath);
            showSavedState();
        } catch (error) {
            console.error('autosave failed', error);
            setSaveStatus('idle');
        }
    }, [
        fileHandle,
        fileName,
        filePath,
        getContent,
        getDocumentSignature,
        persistLatestDocument,
        rememberSavedSignature,
        showSavedState,
    ]);

    useEffect(() => {
        if (!hasLoadedLatestRef.current || isEditingFileName) return;

        const timeout = window.setTimeout(() => {
            void autosaveDocument();
        }, 2500);

        return () => window.clearTimeout(timeout);
    }, [autosaveDocument, fileName, isEditingFileName, markdown]);

    useEffect(() => {
        if (!isEditingFileName) return;
        fileNameInputRef.current?.focus();
        fileNameInputRef.current?.select();
    }, [isEditingFileName]);

    useEffect(() => {
        const loadFonts = async () => {
            try {
                const localFonts = await (
                    window as WindowWithLocalFonts
                ).queryLocalFonts?.();
                const fontNames = Array.from(
                    new Set(
                        localFonts?.map((font) => font.family).filter(Boolean)
                    )
                ).sort((a, b) => a.localeCompare(b));

                if (fontNames.length > 0) {
                    setAvailableFonts(['System', ...fontNames]);
                }
            } catch {
                setAvailableFonts(fallbackFonts);
            }
        };

        void loadFonts();
    }, []);

    const rememberSelection = () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (selectedText) lastSelectedTextRef.current = selectedText;
    };

    const applyInlineStyle = (kind: InlineStyleKind, value: string) => {
        const selectedText =
            window.getSelection()?.toString().trim() ||
            lastSelectedTextRef.current;
        if (!selectedText) return;

        const nextMarkdown = replaceSelectedTextInMarkdown(
            markdown,
            selectedText,
            kind,
            value
        );
        if (nextMarkdown === markdown) return;

        setMarkdown(nextMarkdown);
        editorRef.current?.setMarkdown(nextMarkdown);
        lastSelectedTextRef.current = '';
    };

    const downloadMarkdown = () => {
        const blob = new Blob([getContent()], {
            type: 'text/markdown;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName.endsWith('.md')
            ? fileName
            : `${fileName}.md`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const renderPreviewMarkdown = () => (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            urlTransform={(url) => {
                if (
                    /^data:image\/(?:gif|jpeg|jpg|png|webp|svg\+xml);base64,/i.test(
                        url
                    )
                )
                    return url;
                return url;
            }}
            components={{
                img: ({ src = '', alt = '', width, height }) => (
                    <PreviewImage
                        src={src}
                        alt={alt}
                        width={width}
                        height={height}
                    />
                ),
            }}
        >
            {markdown}
        </ReactMarkdown>
    );

    const waitForPreviewAssets = useCallback(async (root: HTMLElement) => {
        const images = Array.from(root.querySelectorAll('img'));
        await Promise.all(
            images.map(
                (image) =>
                    new Promise<void>((resolve) => {
                        if (image.complete) {
                            resolve();
                            return;
                        }
                        image.addEventListener('load', () => resolve(), {
                            once: true,
                        });
                        image.addEventListener('error', () => resolve(), {
                            once: true,
                        });
                    })
            )
        );
    }, []);

    const buildPreviewPdfHtml = useCallback(
        (previewHtml: string) => {
            const documentTitle = escapeHtml(
                fileName.replace(/\.[^.]+$/u, '') || 'document'
            );

            return `<!DOCTYPE html>
<html lang="${locale}">
    <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>
            @page {
                size: A4;
                margin: 14mm;
            }
            * { box-sizing: border-box; }
            html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                color: #111827;
                font-family: "Segoe UI", Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.65;
            }
            .page { width: 100%; }
            h1, h2, h3, h4, h5, h6 {
                color: #0f172a;
                line-height: 1.25;
                margin: 0 0 0.65em;
                page-break-after: avoid;
            }
            p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
            ul, ol { padding-left: 1.5em; }
            li + li { margin-top: 0.3em; }
            a { color: #1d4ed8; text-decoration: none; }
            img {
                display: block;
                max-width: 100%;
                height: auto;
                page-break-inside: avoid;
            }
            blockquote {
                border-left: 4px solid #cbd5e1;
                padding: 0.2em 0 0.2em 1em;
                color: #334155;
            }
            pre {
                overflow: hidden;
                white-space: pre-wrap;
                word-break: break-word;
                background: #0f172a;
                color: #e2e8f0;
                padding: 1em;
                border-radius: 12px;
            }
            code { font-family: "Cascadia Code", Consolas, monospace; }
            :not(pre) > code {
                background: #e5e7eb;
                color: #111827;
                border-radius: 6px;
                padding: 0.15em 0.4em;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid #cbd5e1;
                padding: 0.55em 0.7em;
                text-align: left;
                vertical-align: top;
            }
            th { background: #f8fafc; }
            hr {
                border: 0;
                border-top: 1px solid #cbd5e1;
                margin: 1.5em 0;
            }
        </style>
    </head>
    <body>
        <main class="page">${previewHtml}</main>
    </body>
</html>`;
        },
        [fileName, locale]
    );

    const exportPdf = useCallback(async () => {
        const previewRoot = previewExportRef.current;
        if (!previewRoot) return;

        await waitForPreviewAssets(previewRoot);

        const pdfName = fileName.replace(/\.[^.]+$/u, '') || 'document';
        return await window.electronAPI?.exportPreviewPdf?.({
            filename: `${pdfName}.pdf`,
            html: buildPreviewPdfHtml(previewRoot.innerHTML),
        });
    }, [buildPreviewPdfHtml, fileName, waitForPreviewAssets]);

    const downloadPdf = useCallback(async () => {
        await exportPdf();
    }, [exportPdf]);

    const openGeneratedPdfPreview = useCallback(() => {
        setPdfViewerDocument(null);
        setIsPdfPreviewOpen(true);
    }, []);

    const openPdf = useCallback(async () => {
        const selected = await window.electronAPI?.pickPdfFile?.();
        if (!selected?.filePath) return;

        const resolvedPdf = await window.electronAPI?.readPdfFileAsDataUrl?.(
            selected.filePath
        );
        if (!resolvedPdf?.dataUrl) return;

        setPdfViewerDocument({
            filePath: resolvedPdf.filePath,
            filename: resolvedPdf.filename,
            dataUrl: resolvedPdf.dataUrl,
        });
        setIsPdfPreviewOpen(true);
    }, []);

    const closePdfViewer = useCallback(() => {
        setIsPdfPreviewOpen(false);
        setPdfViewerDocument(null);
    }, []);

    useEffect(() => {
        if (!pdfViewerDocument?.dataUrl) return;

        const blobUrl = URL.createObjectURL(
            new Blob([decodePdfDataUrl(pdfViewerDocument.dataUrl)], {
                type: 'application/pdf',
            })
        );
        // Syncing blob URL (external resource) into state — not derived state
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPdfViewerUrl(blobUrl);

        return () => {
            URL.revokeObjectURL(blobUrl);
        };
    }, [pdfViewerDocument]);

    const exportOpenedPdfAsMarkdown = useCallback(async () => {
        if (!pdfViewerDocument) return;

        try {
            const markdown = await extractMarkdownFromPdf(
                pdfViewerDocument.dataUrl,
                pdfViewerDocument.filename,
                locale
            );

            const suggestedFilename = pdfViewerDocument.filename.replace(
                /\.pdf$/i,
                '.md'
            );

            // Load directly into editor as unsaved document — user decides when to save
            closePdfViewer();
            await loadMarkdownIntoEditor(
                {
                    filename: suggestedFilename,
                    markdown,
                    filePath: undefined,
                    folderPath: pdfViewerDocument.filePath
                        ? pdfViewerDocument.filePath
                              .replace(/[^\\/]+$/, '')
                              .replace(/[\\/]+$/, '')
                        : undefined,
                },
                false
            );
        } catch (error) {
            console.error('pdf to markdown export failed', error);
            window.alert(
                locale === 'es'
                    ? 'No se pudo exportar el PDF a Markdown.'
                    : 'Could not export the PDF to Markdown.'
            );
        }
    }, [closePdfViewer, loadMarkdownIntoEditor, locale, pdfViewerDocument]);

    const embeddedPdfUrl = useMemo(() => {
        if (!pdfViewerDocument || !pdfViewerUrl) return '';

        return `${pdfViewerUrl}#toolbar=1&navpanes=0&view=FitH`;
    }, [pdfViewerDocument, pdfViewerUrl]);

    const printCurrentDocument = useCallback(async () => {
        if (pdfViewerDocument?.filePath) {
            await window.electronAPI?.printPdfFile?.(
                pdfViewerDocument.filePath
            );
            return;
        }

        const previewRoot = previewExportRef.current;
        if (!previewRoot) return;

        await waitForPreviewAssets(previewRoot);

        const pdfName = fileName.replace(/\.[^.]+$/u, '') || 'document';
        await window.electronAPI?.printPreviewPdf?.({
            filename: `${pdfName}.pdf`,
            html: buildPreviewPdfHtml(previewRoot.innerHTML),
        });
    }, [
        buildPreviewPdfHtml,
        fileName,
        pdfViewerDocument,
        waitForPreviewAssets,
    ]);

    const createNewDocument = async () => {
        await persistLatestDocument(fileName, getContent(), true);
        const nextFileName = `untitled-${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[-:T]/g, '')}.md`;

        setMarkdown('');
        editorRef.current?.setMarkdown('');
        setFileName(nextFileName);
        setFilePath('');
        setFolderPath('');
        setLastSavedAt(null);
        setFileHandle(null);
        setEditorDocumentKey(`${nextFileName}\nnew`);
        setViewMode('editor');
        setIsHistoryOpen(false);
        fileNameBeforeEditRef.current = nextFileName;
        setIsEditingFileName(true);
        lastPersistedRef.current = '';
    };

    const resetToBlankDocument = () => {
        const nextFileName = `untitled-${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[-:T]/g, '')}.md`;

        setMarkdown('');
        editorRef.current?.setMarkdown('');
        setFileName(nextFileName);
        setFilePath('');
        setFolderPath('');
        setLastSavedAt(null);
        setFileHandle(null);
        setEditorDocumentKey(`${nextFileName}\nblank`);
        setViewMode('editor');
        setIsHistoryOpen(false);
        fileNameBeforeEditRef.current = nextFileName;
        setIsEditingFileName(true);
        lastPersistedRef.current = '';
    };

    const openRecentDocument = async (selectedFileName: string) => {
        if (!selectedFileName || selectedFileName === fileName) return;

        setIsHistoryOpen(false);
        setIsLoadingDocument(true);

        try {
            await persistLatestDocument(fileName, getContent());
            const selected =
                await window.electronAPI?.loadRecentDocument(selectedFileName);
            if (!selected) {
                setIsLoadingDocument(false);
                return;
            }

            await loadMarkdownIntoEditor(selected, true);
        } catch {
            setIsLoadingDocument(false);
        }
    };

    const openFromDevice = async () => {
        const electronDocument = await window.electronAPI?.openMarkdownFile?.();
        if (electronDocument) {
            await loadMarkdownIntoEditor(electronDocument, true);
            return;
        }

        const picker = window as Window & {
            showOpenFilePicker?: (
                options: unknown
            ) => Promise<
                Array<{ name?: string; getFile: () => Promise<File> }>
            >;
        };
        if (!picker.showOpenFilePicker) {
            fileInputRef.current?.click();
            return;
        }
        const [handle] = await picker.showOpenFilePicker({
            types: [
                {
                    description: 'Markdown',
                    accept: { 'text/markdown': ['.md'] },
                },
            ],
            multiple: false,
        });
        if (!handle) return;
        const file = await handle.getFile();
        const content = await file.text();
        await loadMarkdownIntoEditor(
            {
                filename: handle.name ?? file.name ?? 'document.md',
                markdown: content,
                filePath: '',
                folderPath: '',
                updatedAt: file.lastModified || Date.now(),
                sizeBytes: file.size,
            },
            true
        );
        setFileHandle(handle as unknown as MaybeFileHandle);
    };

    const onFallbackFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = '';
        const content = await file.text();
        await loadMarkdownIntoEditor(
            {
                filename: file.name || 'document.md',
                markdown: content,
                filePath: '',
                folderPath: '',
                updatedAt: file.lastModified || Date.now(),
                sizeBytes: file.size,
            },
            true
        );
    };

    const saveToDevice = async () => {
        setSaveStatus('saving');
        const content = getContent();
        const previousFilename = fileName;
        try {
            if (filePath) {
                const saved = await window.electronAPI?.writeMarkdownFile?.({
                    filePath,
                    markdown: content,
                });
                if (saved) {
                    setFileName(saved.filename);
                    setFilePath(saved.filePath);
                    setFolderPath(saved.folderPath);
                    setLastSavedAt(saved.updatedAt);
                    await persistLatestDocument(saved.filename, content, true, {
                        filePath: saved.filePath,
                        folderPath: saved.folderPath,
                        sizeBytes: saved.sizeBytes,
                    });
                    rememberSavedSignature(
                        saved.filename,
                        content,
                        saved.filePath
                    );
                    showSavedState();
                    return;
                }
            }

            await persistLatestDocument(fileName, content, true);
            const electronSaved = await window.electronAPI?.saveMarkdownFile?.({
                filename: fileName,
                markdown: content,
            });
            if (electronSaved) {
                setFileName(electronSaved.filename);
                setFilePath(electronSaved.filePath);
                setFolderPath(electronSaved.folderPath);
                setLastSavedAt(electronSaved.updatedAt);
                setFileHandle(null);
                await persistLatestDocument(
                    electronSaved.filename,
                    content,
                    true,
                    {
                        filePath: electronSaved.filePath,
                        folderPath: electronSaved.folderPath,
                        sizeBytes: electronSaved.sizeBytes,
                        previousFilename:
                            previousFilename === electronSaved.filename
                                ? undefined
                                : previousFilename,
                    }
                );
                rememberSavedSignature(
                    electronSaved.filename,
                    content,
                    electronSaved.filePath
                );
                showSavedState();
                return;
            }

            if (fileHandle?.createWritable) {
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                setLastSavedAt(Date.now());
                rememberSavedSignature(fileName, content, filePath);
                showSavedState();
                return;
            }
            const saver = window as Window & {
                showSaveFilePicker?: (
                    options: unknown
                ) => Promise<MaybeFileHandle>;
            };
            if (!saver.showSaveFilePicker) {
                downloadMarkdown();
                rememberSavedSignature(fileName, content, filePath);
                showSavedState();
                return;
            }
            const handle = await saver.showSaveFilePicker({
                suggestedName: fileName.endsWith('.md')
                    ? fileName
                    : `${fileName}.md`,
                types: [
                    {
                        description: 'Markdown',
                        accept: { 'text/markdown': ['.md'] },
                    },
                ],
            });
            if (!handle.createWritable) {
                downloadMarkdown();
                rememberSavedSignature(fileName, content, filePath);
                showSavedState();
                return;
            }
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            setFileHandle(handle);
            if (handle.name) setFileName(handle.name);
            setLastSavedAt(Date.now());
            rememberSavedSignature(handle.name ?? fileName, content, filePath);
            showSavedState();
        } catch (error) {
            setSaveStatus('idle');
            throw error;
        }
    };

    const deleteCurrentFile = async () => {
        const message = filePath
            ? locale === 'es'
                ? `Eliminar del disco?\n${filePath}`
                : `Delete from disk?\n${filePath}`
            : locale === 'es'
              ? 'Este documento no tiene archivo en disco. Se limpiara el editor.'
              : 'This document has no file on disk. The editor will be cleared.';

        if (!window.confirm(message)) return;

        await window.electronAPI?.deleteMarkdownFile?.({
            filename: fileName,
            filePath,
        });
        resetToBlankDocument();
        await refreshRecentDocuments();
    };

    const visibleFolder =
        folderPath || (locale === 'es' ? 'Nuevo sin guardar' : 'New unsaved');
    const actionLabels = {
        create: locale === 'es' ? 'Nuevo' : 'New',
        open: locale === 'es' ? 'Abrir archivo' : 'Open file',
        save:
            saveStatus === 'saved'
                ? locale === 'es'
                    ? 'Guardado'
                    : 'Saved'
                : locale === 'es'
                  ? 'Guardar'
                  : 'Save',
        delete: locale === 'es' ? 'Eliminar archivo' : 'Delete file',
        downloadMd: locale === 'es' ? 'Descargar .md' : 'Download .md',
        previewPdf: locale === 'es' ? 'Vista previa PDF' : 'Preview PDF',
        openPdf: locale === 'es' ? 'Abrir PDF' : 'Open PDF',
        downloadPdf: locale === 'es' ? 'Descargar .pdf' : 'Download .pdf',
        print: locale === 'es' ? 'Imprimir' : 'Print',
        exportPdfAsMd: locale === 'es' ? 'Exportar a .md' : 'Export to .md',
    };

    return (
        <main
            className={`app ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}
        >
            <header className="appHeader">
                <div className="headerLeft">
                    <h1>MD Editor</h1>
                    <button
                        type="button"
                        className="iconBtn actionIcon"
                        onClick={() => void createNewDocument()}
                        aria-label={actionLabels.create}
                        data-label={actionLabels.create}
                    >
                        <FilePlus size={16} />
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon"
                        onClick={openFromDevice}
                        aria-label={actionLabels.open}
                        data-label={actionLabels.open}
                    >
                        <FolderOpen size={16} />
                    </button>
                    <button
                        type="button"
                        className={`iconBtn actionIcon saveBtn ${saveStatus}`}
                        onClick={saveToDevice}
                        aria-label={actionLabels.save}
                        data-label={actionLabels.save}
                    >
                        <Save size={16} />
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon dangerBtn"
                        onClick={() => void deleteCurrentFile()}
                        aria-label={actionLabels.delete}
                        data-label={actionLabels.delete}
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon actionBadgeBtn"
                        onClick={downloadMarkdown}
                        aria-label={actionLabels.downloadMd}
                        data-label={actionLabels.downloadMd}
                    >
                        <Download size={16} />
                        <span className="iconBadge">MD</span>
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon actionBadgeBtn"
                        onClick={openGeneratedPdfPreview}
                        aria-label={actionLabels.previewPdf}
                        data-label={actionLabels.previewPdf}
                    >
                        <Eye size={16} />
                        <span className="iconBadge">PDF</span>
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon actionBadgeBtn"
                        onClick={() => void openPdf()}
                        aria-label={actionLabels.openPdf}
                        data-label={actionLabels.openPdf}
                    >
                        <ExternalLink size={16} />
                        <span className="iconBadge">PDF</span>
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon actionBadgeBtn"
                        onClick={() => void downloadPdf()}
                        aria-label={actionLabels.downloadPdf}
                        data-label={actionLabels.downloadPdf}
                    >
                        <Download size={16} />
                        <span className="iconBadge">PDF</span>
                    </button>
                </div>
                <div className="fileHistory">
                    {isEditingFileName ? (
                        <input
                            ref={fileNameInputRef}
                            className="fileNameEditor"
                            value={fileName}
                            onChange={(event) =>
                                setFileName(event.target.value)
                            }
                            onBlur={() => {
                                const previousFilename =
                                    fileNameBeforeEditRef.current;
                                const normalized = normalizeFileName(fileName);
                                setFileName(normalized);
                                setIsEditingFileName(false);
                                void persistLatestDocument(
                                    normalized,
                                    markdown,
                                    true,
                                    {
                                        previousFilename:
                                            previousFilename === normalized
                                                ? undefined
                                                : previousFilename,
                                    }
                                );
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.currentTarget.blur();
                                }
                                if (event.key === 'Escape') {
                                    setIsEditingFileName(false);
                                }
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            className="fileHistoryTrigger"
                            onClick={() => setIsHistoryOpen((open) => !open)}
                            onDoubleClick={() => {
                                fileNameBeforeEditRef.current = fileName;
                                setIsEditingFileName(true);
                            }}
                        >
                            <span>{fileName}</span>
                            <ChevronDown size={14} />
                        </button>
                    )}
                    {isHistoryOpen && (
                        <div className="fileHistoryMenu">
                            {recentDocuments.length === 0 ? (
                                <button type="button" disabled>
                                    {locale === 'es'
                                        ? 'Sin recientes'
                                        : 'No recent files'}
                                </button>
                            ) : (
                                recentDocuments.map((document) => (
                                    <button
                                        key={`${document.filename}-${document.updatedAt}`}
                                        type="button"
                                        className={
                                            document.filename === fileName
                                                ? 'active'
                                                : ''
                                        }
                                        onClick={() =>
                                            void openRecentDocument(
                                                document.filename
                                            )
                                        }
                                    >
                                        {document.filename}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="fileMeta" title={folderPath || visibleFolder}>
                    <Folder size={13} />
                    <span className="fileMetaFolder">{visibleFolder}</span>
                    <span>{formatFileSize(currentSizeBytes)}</span>
                    <span>{formatSavedAt(lastSavedAt, locale)}</span>
                </div>
                <div
                    className="themeSwitch segmentedSwitch"
                    role="group"
                    aria-label="Theme"
                >
                    <button
                        type="button"
                        className={theme === 'light' ? 'active' : ''}
                        onClick={() => setTheme('light')}
                    >
                        Light
                    </button>
                    <button
                        type="button"
                        className={theme === 'dark' ? 'active' : ''}
                        onClick={() => setTheme('dark')}
                    >
                        Dark
                    </button>
                </div>
                <div
                    className="localeSwitch segmentedSwitch"
                    role="group"
                    aria-label="Language"
                >
                    <button
                        type="button"
                        className={locale === 'es' ? 'active' : ''}
                        onClick={() => setLocale('es')}
                    >
                        ES
                    </button>
                    <button
                        type="button"
                        className={locale === 'en' ? 'active' : ''}
                        onClick={() => setLocale('en')}
                    >
                        US
                    </button>
                </div>
                <div
                    className="modeSwitch segmentedSwitch"
                    role="group"
                    aria-label="View mode"
                >
                    <button
                        type="button"
                        className={viewMode === 'editor' ? 'active' : ''}
                        onClick={() => setViewMode('editor')}
                    >
                        Editor
                    </button>
                    <button
                        type="button"
                        className={viewMode === 'source' ? 'active' : ''}
                        onClick={() => setViewMode('source')}
                    >
                        .md
                    </button>
                    <button
                        type="button"
                        className={viewMode === 'preview' ? 'active' : ''}
                        onClick={() => setViewMode('preview')}
                    >
                        Preview
                    </button>
                </div>
            </header>

            <section className="workspace">
                {viewMode === 'editor' && (
                    <div className="editorWrap">
                        <MDXEditor
                            key={editorDocumentKey}
                            ref={editorRef}
                            markdown={markdown}
                            onChange={setMarkdown}
                            translation={translation}
                            className="editor"
                            plugins={[
                                headingsPlugin(),
                                listsPlugin(),
                                linkPlugin(),
                                linkDialogPlugin(),
                                quotePlugin(),
                                tablePlugin(),
                                imagePlugin({
                                    imageUploadHandler,
                                    imagePreviewHandler,
                                    allowSetImageDimensions: true,
                                }),
                                codeBlockPlugin({
                                    defaultCodeBlockLanguage: 'txt',
                                }),
                                codeMirrorPlugin({
                                    codeBlockLanguages: {
                                        txt: 'Text',
                                        js: 'JavaScript',
                                        ts: 'TypeScript',
                                        css: 'CSS',
                                        html: 'HTML',
                                        json: 'JSON',
                                        md: 'Markdown',
                                        bash: 'Bash',
                                    },
                                }),
                                thematicBreakPlugin(),
                                markdownShortcutPlugin(),
                                toolbarPlugin({
                                    toolbarContents: () => (
                                        <>
                                            <UndoRedo />
                                            <BoldItalicUnderlineToggles />
                                            <StrikeThroughSupSubToggles />
                                            <CodeToggle />
                                            <BlockTypeSelect />
                                            <ListsToggle />
                                            <CreateLink />
                                            <InsertImage />
                                            <InsertTable />
                                            <InsertCodeBlock />
                                            <InsertThematicBreak />
                                            <div
                                                className="styleTools"
                                                onMouseDown={rememberSelection}
                                            >
                                                <div
                                                    className="styleToolGroup"
                                                    title={
                                                        locale === 'es'
                                                            ? 'Color de texto'
                                                            : 'Text color'
                                                    }
                                                >
                                                    <Palette size={15} />
                                                    {textColors.map((color) => (
                                                        <button
                                                            key={color}
                                                            type="button"
                                                            className="colorSwatch"
                                                            style={{
                                                                backgroundColor:
                                                                    color,
                                                            }}
                                                            aria-label={
                                                                locale === 'es'
                                                                    ? 'Color de texto'
                                                                    : 'Text color'
                                                            }
                                                            onMouseDown={(
                                                                event
                                                            ) =>
                                                                event.preventDefault()
                                                            }
                                                            onClick={() => {
                                                                setSelectedTextColor(
                                                                    color
                                                                );
                                                                applyInlineStyle(
                                                                    'textColor',
                                                                    color
                                                                );
                                                            }}
                                                        />
                                                    ))}
                                                    <input
                                                        type="color"
                                                        value={
                                                            selectedTextColor
                                                        }
                                                        aria-label={
                                                            locale === 'es'
                                                                ? 'Elegir color de texto'
                                                                : 'Choose text color'
                                                        }
                                                        onChange={(event) => {
                                                            setSelectedTextColor(
                                                                event.target
                                                                    .value
                                                            );
                                                            applyInlineStyle(
                                                                'textColor',
                                                                event.target
                                                                    .value
                                                            );
                                                        }}
                                                    />
                                                </div>
                                                <div
                                                    className="styleToolGroup"
                                                    title={
                                                        locale === 'es'
                                                            ? 'Fondo resaltado'
                                                            : 'Highlight'
                                                    }
                                                >
                                                    <Highlighter size={15} />
                                                    {highlightColors.map(
                                                        (color) => (
                                                            <button
                                                                key={color}
                                                                type="button"
                                                                className="colorSwatch"
                                                                style={{
                                                                    backgroundColor:
                                                                        color,
                                                                }}
                                                                aria-label={
                                                                    locale ===
                                                                    'es'
                                                                        ? 'Fondo resaltado'
                                                                        : 'Highlight'
                                                                }
                                                                onMouseDown={(
                                                                    event
                                                                ) =>
                                                                    event.preventDefault()
                                                                }
                                                                onClick={() => {
                                                                    setSelectedHighlightColor(
                                                                        color
                                                                    );
                                                                    applyInlineStyle(
                                                                        'highlight',
                                                                        color
                                                                    );
                                                                }}
                                                            />
                                                        )
                                                    )}
                                                    <input
                                                        type="color"
                                                        value={
                                                            selectedHighlightColor
                                                        }
                                                        aria-label={
                                                            locale === 'es'
                                                                ? 'Elegir fondo resaltado'
                                                                : 'Choose highlight'
                                                        }
                                                        onChange={(event) => {
                                                            setSelectedHighlightColor(
                                                                event.target
                                                                    .value
                                                            );
                                                            applyInlineStyle(
                                                                'highlight',
                                                                event.target
                                                                    .value
                                                            );
                                                        }}
                                                    />
                                                </div>
                                                <select
                                                    className="fontSelect"
                                                    value={selectedFont}
                                                    title={
                                                        locale === 'es'
                                                            ? 'Fuente'
                                                            : 'Font'
                                                    }
                                                    aria-label={
                                                        locale === 'es'
                                                            ? 'Fuente'
                                                            : 'Font'
                                                    }
                                                    onMouseDown={
                                                        rememberSelection
                                                    }
                                                    onChange={(event) => {
                                                        setSelectedFont(
                                                            event.target.value
                                                        );
                                                        if (
                                                            event.target
                                                                .value !==
                                                            'System'
                                                        ) {
                                                            applyInlineStyle(
                                                                'font',
                                                                event.target
                                                                    .value
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {availableFonts.map(
                                                        (font) => (
                                                            <option
                                                                key={font}
                                                                value={font}
                                                            >
                                                                {font}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>
                                        </>
                                    ),
                                }),
                            ]}
                        />
                    </div>
                )}

                {viewMode === 'source' && (
                    <textarea
                        className="sourceEditor"
                        value={getReadableMarkdown(markdown)}
                        spellCheck={false}
                        readOnly
                    />
                )}

                {viewMode === 'preview' && (
                    <aside className="previewWrap fullPreview">
                        <div className="previewHeader previewHeaderRow">
                            <span>Preview</span>
                            <button
                                type="button"
                                className={`iconBtn actionIcon saveBtn ${saveStatus}`}
                                onClick={() => void saveToDevice()}
                                aria-label={actionLabels.save}
                                data-label={actionLabels.save}
                            >
                                <Save size={14} />
                            </button>
                            <button
                                type="button"
                                className="iconBtn actionIcon"
                                onClick={() => void printCurrentDocument()}
                                aria-label={actionLabels.print}
                                data-label={actionLabels.print}
                            >
                                <Printer size={14} />
                            </button>
                        </div>
                        <div className="pdfPreviewViewport screenPreviewViewport">
                            <div className="pdfPreviewPage pdfPreviewPageVisible">
                                {renderPreviewMarkdown()}
                            </div>
                        </div>
                    </aside>
                )}
            </section>

            <div className="pdfPreviewStaging" aria-hidden="true">
                <div ref={previewExportRef} className="pdfPreviewPage">
                    {renderPreviewMarkdown()}
                </div>
            </div>

            {isPdfPreviewOpen && (
                <div
                    className="pdfPreviewOverlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                        pdfViewerDocument
                            ? locale === 'es'
                                ? 'Visor PDF'
                                : 'PDF viewer'
                            : locale === 'es'
                              ? 'Vista previa PDF'
                              : 'PDF preview'
                    }
                    onClick={closePdfViewer}
                >
                    <div
                        className="pdfPreviewModal"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="previewHeader pdfPreviewModalHeader">
                            <div className="pdfPreviewHeadingGroup">
                                <span>
                                    {pdfViewerDocument
                                        ? locale === 'es'
                                            ? 'PDF abierto'
                                            : 'Opened PDF'
                                        : locale === 'es'
                                          ? 'Vista previa PDF'
                                          : 'PDF preview'}
                                </span>
                                {pdfViewerDocument && (
                                    <strong className="pdfPreviewFileName">
                                        {pdfViewerDocument.filename}
                                    </strong>
                                )}
                            </div>
                            {pdfViewerDocument && (
                                <button
                                    type="button"
                                    className="iconBtn actionIcon actionBadgeBtn"
                                    onClick={() =>
                                        void exportOpenedPdfAsMarkdown()
                                    }
                                    aria-label={actionLabels.exportPdfAsMd}
                                    data-label={actionLabels.exportPdfAsMd}
                                >
                                    <Download size={14} />
                                    <span className="iconBadge">MD</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="iconBtn actionIcon"
                                onClick={() => void printCurrentDocument()}
                                aria-label={actionLabels.print}
                                data-label={actionLabels.print}
                            >
                                <Printer size={14} />
                            </button>
                            <button
                                type="button"
                                className="iconBtn actionIcon"
                                onClick={closePdfViewer}
                                aria-label={
                                    locale === 'es' ? 'Cerrar' : 'Close'
                                }
                                data-label={
                                    locale === 'es' ? 'Cerrar' : 'Close'
                                }
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="pdfPreviewViewport">
                            {pdfViewerDocument ? (
                                <iframe
                                    className="pdfViewerFrame"
                                    src={embeddedPdfUrl}
                                    title={pdfViewerDocument.filename}
                                />
                            ) : (
                                <div className="pdfPreviewPage pdfPreviewPageVisible">
                                    {renderPreviewMarkdown()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown"
                className="hiddenFileInput"
                onChange={onFallbackFileChange}
            />
            {(isLoadingLatest || isLoadingDocument) && (
                <div
                    className="loadingOverlay"
                    aria-label={locale === 'es' ? 'Cargando...' : 'Loading...'}
                >
                    <div className="spinner" />
                    <span className="spinnerLabel">
                        {locale === 'es' ? 'Cargando...' : 'Loading...'}
                    </span>
                </div>
            )}
        </main>
    );
}

export default App;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    GlobalWorkerOptions,
    getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
    Download,
    Eye,
    ExternalLink,
    FilePlus,
    FolderOpen,
    Highlighter,
    Palette,
    Save,
    Trash2,
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
import { getByteSize, normalizeFileName, type Locale } from './lib/format';
import { normalizeMarkdownForRichEditor } from './lib/markdown';
import { escapeHtml, replaceSelectedTextInMarkdown, type InlineStyleKind } from './lib/inline-style';
import {
    decodePdfDataUrl,
    computeHeadingThresholds,
    groupItemsIntoLines,
    buildPageMarkdown,
    PDF_IMAGE_OPS,
    PDF_MIN_IMAGE_PX,
    type PdfTextItem,
    type PdfRawLine,
    type PdfImageData,
    type PdfPageLike,
} from './lib/pdf';

import type { Theme, ViewMode, MaybeFileHandle, RecentDocument, PdfViewerDocument } from './types';
import { LoadingOverlay } from './components/LoadingOverlay/LoadingOverlay';
import { StatusBar } from './components/StatusBar/StatusBar';
import { PreviewContent } from './components/PreviewPane/PreviewContent';
import { ThemeSwitch } from './components/ThemeSwitch/ThemeSwitch';
import { LocaleSwitch } from './components/LocaleSwitch/LocaleSwitch';
import { ViewModeSwitch } from './components/ViewModeSwitch/ViewModeSwitch';
import { FileHistoryMenu } from './components/FileHistoryMenu/FileHistoryMenu';
import { PreviewPane } from './components/PreviewPane/PreviewPane';
import { PdfModal } from './components/PdfModal/PdfModal';

type LocalFontData = {
    family: string;
};

type WindowWithLocalFonts = Window & {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
};

type EditorDocument = {
    filename: string;
    markdown: string;
    updatedAt?: number;
    filePath?: string;
    folderPath?: string;
    sizeBytes?: number;
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

    const commitFileNameRename = () => {
        const previousFilename = fileNameBeforeEditRef.current;
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
    };

    const handleFileNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
            setIsEditingFileName(false);
        }
    };

    const startFileNameRename = () => {
        fileNameBeforeEditRef.current = fileName;
        setIsEditingFileName(true);
    };

    return (
        <main
            className={`app ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}
            data-testid="app-root"
        >
            <header className="appHeader" data-testid="app-header">
                <div className="headerLeft">
                    <h1>MD Editor</h1>
                    <button
                        type="button"
                        className="iconBtn actionIcon"
                        onClick={() => void createNewDocument()}
                        aria-label={actionLabels.create}
                        data-label={actionLabels.create}
                        data-testid="btn-new"
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
                        data-testid="btn-save"
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
                <FileHistoryMenu
                    fileName={fileName}
                    recentDocuments={recentDocuments}
                    isEditingFileName={isEditingFileName}
                    isHistoryOpen={isHistoryOpen}
                    locale={locale}
                    fileNameInputRef={fileNameInputRef}
                    onFileNameChange={setFileName}
                    onFileNameCommit={commitFileNameRename}
                    onFileNameKeyDown={handleFileNameKeyDown}
                    onToggleHistory={() => setIsHistoryOpen((open) => !open)}
                    onStartRename={startFileNameRename}
                    onSelectRecent={(filename) => void openRecentDocument(filename)}
                />
                <ThemeSwitch
                    theme={theme}
                    onThemeChange={setTheme}
                />
                <LocaleSwitch
                    locale={locale}
                    onLocaleChange={setLocale}
                />
                <ViewModeSwitch
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                />
            </header>

            <section className="workspace" data-testid="workspace">
                {viewMode === 'editor' && (
                    <div className="editorWrap" data-testid="editor-wrap">
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
                        data-testid="source-editor"
                    />
                )}

                {viewMode === 'preview' && (
                    <PreviewPane
                        markdown={markdown}
                        saveStatus={saveStatus}
                        saveLabel={actionLabels.save}
                        printLabel={actionLabels.print}
                        onSave={() => void saveToDevice()}
                        onPrint={() => void printCurrentDocument()}
                    />
                )}
            </section>

            <StatusBar
                folderPath={folderPath}
                visibleFolder={visibleFolder}
                currentSizeBytes={currentSizeBytes}
                lastSavedAt={lastSavedAt}
                locale={locale}
            />

            <div className="pdfPreviewStaging" aria-hidden="true">
                <div ref={previewExportRef} className="pdfPreviewPage">
                    <PreviewContent markdown={markdown} />
                </div>
            </div>

            <PdfModal
                open={isPdfPreviewOpen}
                pdfViewerDocument={pdfViewerDocument}
                embeddedPdfUrl={embeddedPdfUrl}
                markdown={markdown}
                locale={locale}
                exportLabel={actionLabels.exportPdfAsMd}
                printLabel={actionLabels.print}
                onClose={closePdfViewer}
                onExportPdfAsMarkdown={() => void exportOpenedPdfAsMarkdown()}
                onPrint={() => void printCurrentDocument()}
            />

            <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown"
                className="hiddenFileInput"
                onChange={onFallbackFileChange}
            />
            <LoadingOverlay
                visible={isLoadingLatest || isLoadingDocument}
                locale={locale}
            />
        </main>
    );
}

export default App;

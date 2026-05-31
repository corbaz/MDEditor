import type PrismNamespace from 'prismjs';

declare global {
    var Prism: typeof PrismNamespace;

    interface Window {
        electronAPI?: {
            readLocalImageAsDataUrl: (filePath: string) => Promise<string>;
            saveImageFile: (image: {
                name: string;
                type: string;
                base64: string;
            }) => Promise<string>;
            openMarkdownFile: () => Promise<{
                filename: string;
                markdown: string;
                filePath: string;
                folderPath: string;
                sizeBytes: number;
                updatedAt: number;
            } | null>;
            fileExists: (filePath: string) => Promise<boolean>;
            writeMarkdownFile: (document: {
                filePath: string;
                markdown: string;
            }) => Promise<{
                filename: string;
                markdown: string;
                filePath: string;
                folderPath: string;
                sizeBytes: number;
                updatedAt: number;
            } | null>;
            saveMarkdownFile: (document: {
                filename: string;
                markdown: string;
            }) => Promise<{
                filename: string;
                markdown: string;
                filePath: string;
                folderPath: string;
                sizeBytes: number;
                updatedAt: number;
            } | null>;
            deleteMarkdownFile: (document: {
                filename: string;
                filePath?: string;
            }) => Promise<{
                deleted: boolean;
            }>;
            saveLatestDocument: (document: {
                filename: string;
                markdown: string;
                filePath?: string;
                folderPath?: string;
                sizeBytes?: number;
                previousFilename?: string;
            }) => Promise<{
                filename: string;
                markdown: string;
                updatedAt: number;
                filePath?: string;
                folderPath?: string;
                sizeBytes?: number;
            }>;
            loadLatestDocument: () => Promise<{
                filename: string;
                markdown: string;
                updatedAt: number;
                filePath?: string;
                folderPath?: string;
                sizeBytes?: number;
            } | null>;
            loadRecentDocuments: () => Promise<
                Array<{
                    filename: string;
                    updatedAt: number;
                    filePath?: string;
                    folderPath?: string;
                    sizeBytes?: number;
                }>
            >;
            loadRecentDocument: (filename: string) => Promise<{
                filename: string;
                markdown: string;
                updatedAt: number;
                filePath?: string;
                folderPath?: string;
                sizeBytes?: number;
            } | null>;
            exportPreviewPdf: (document: {
                filename: string;
                html: string;
            }) => Promise<{
                filename: string;
                filePath: string;
            } | null>;
            printPreviewPdf: (document: {
                filename: string;
                html: string;
            }) => Promise<boolean>;
            pickPdfFile: () => Promise<{
                filePath: string;
                filename: string;
            } | null>;
            readPdfFileAsDataUrl: (filePath: string) => Promise<{
                dataUrl: string;
                filename: string;
                filePath: string;
            } | null>;
            printPdfFile: (filePath: string) => Promise<boolean>;
        };
    }
}

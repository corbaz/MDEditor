export type Theme = 'light' | 'dark';
export type ViewMode = 'editor' | 'source' | 'preview';
export type MaybeFileHandle = {
    name?: string;
    createWritable?: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
    }>;
};

export type RecentDocument = {
    filename: string;
    updatedAt: number;
    filePath?: string;
    folderPath?: string;
    sizeBytes?: number;
};

export type PdfViewerDocument = {
    filePath: string;
    filename: string;
    dataUrl: string;
};

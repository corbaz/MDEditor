import { Folder } from 'lucide-react';
import { formatFileSize, formatSavedAt } from '../../lib/format';
import type { Locale } from '../../lib/format';

interface StatusBarProps {
    folderPath: string;
    visibleFolder: string;
    currentSizeBytes: number;
    lastSavedAt: number | null;
    locale: Locale;
}

export function StatusBar({
    folderPath,
    visibleFolder,
    currentSizeBytes,
    lastSavedAt,
    locale,
}: StatusBarProps) {
    return (
        <footer className="app-footer" data-testid="app-footer-status">
            <div className="fileMeta" title={folderPath || visibleFolder}>
                <Folder size={13} />
                <span className="fileMetaFolder">{visibleFolder}</span>
                <span>{formatFileSize(currentSizeBytes)}</span>
                <span>{formatSavedAt(lastSavedAt, locale)}</span>
            </div>
        </footer>
    );
}

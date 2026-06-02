import type { RefObject } from 'react';
import { Download, Eye, ExternalLink, FilePlus, FolderOpen, Save, Trash2 } from 'lucide-react';
import type { Theme, ViewMode, RecentDocument } from '../../types';
import type { Locale } from '../../lib/format';
import { FileHistoryMenu } from '../FileHistoryMenu/FileHistoryMenu';
import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch';
import { LocaleSwitch } from '../LocaleSwitch/LocaleSwitch';
import { ViewModeSwitch } from '../ViewModeSwitch/ViewModeSwitch';

export interface ActionLabels {
    create: string;
    open: string;
    save: string;
    delete: string;
    downloadMd: string;
    previewPdf: string;
    openPdf: string;
    downloadPdf: string;
    print: string;
    exportPdfAsMd: string;
}

interface AppHeaderProps {
    // switches
    theme: Theme;
    locale: Locale;
    viewMode: ViewMode;
    // file history menu
    fileName: string;
    recentDocuments: RecentDocument[];
    isEditingFileName: boolean;
    isHistoryOpen: boolean;
    fileNameInputRef: RefObject<HTMLInputElement | null>;
    // action labels
    actionLabels: ActionLabels;
    // save status (for saveBtn className)
    saveStatus: string;
    // callbacks — action buttons
    onNew: () => void;
    onOpen: () => void;
    onSave: () => void;
    onDelete: () => void;
    onDownloadMd: () => void;
    onPreviewPdf: () => void;
    onOpenPdf: () => void;
    onDownloadPdf: () => void;
    // callbacks — switches
    onThemeChange: (theme: Theme) => void;
    onLocaleChange: (locale: Locale) => void;
    onViewModeChange: (mode: ViewMode) => void;
    // callbacks — file history menu
    onFileNameChange: (value: string) => void;
    onFileNameCommit: () => void;
    onFileNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onToggleHistory: () => void;
    onStartRename: () => void;
    onSelectRecent: (filename: string) => void;
}

export function AppHeader({
    theme,
    locale,
    viewMode,
    fileName,
    recentDocuments,
    isEditingFileName,
    isHistoryOpen,
    fileNameInputRef,
    actionLabels,
    saveStatus,
    onNew,
    onOpen,
    onSave,
    onDelete,
    onDownloadMd,
    onPreviewPdf,
    onOpenPdf,
    onDownloadPdf,
    onThemeChange,
    onLocaleChange,
    onViewModeChange,
    onFileNameChange,
    onFileNameCommit,
    onFileNameKeyDown,
    onToggleHistory,
    onStartRename,
    onSelectRecent,
}: AppHeaderProps) {
    return (
        <header className="appHeader" data-testid="app-header">
            <div className="headerLeft">
                <h1>MD Editor</h1>
                <button
                    type="button"
                    className="iconBtn actionIcon"
                    onClick={onNew}
                    aria-label={actionLabels.create}
                    data-label={actionLabels.create}
                    data-testid="btn-new"
                >
                    <FilePlus size={16} />
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon"
                    onClick={onOpen}
                    aria-label={actionLabels.open}
                    data-label={actionLabels.open}
                >
                    <FolderOpen size={16} />
                </button>
                <button
                    type="button"
                    className={`iconBtn actionIcon saveBtn ${saveStatus}`}
                    onClick={onSave}
                    aria-label={actionLabels.save}
                    data-label={actionLabels.save}
                    data-testid="btn-save"
                >
                    <Save size={16} />
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon dangerBtn"
                    onClick={onDelete}
                    aria-label={actionLabels.delete}
                    data-label={actionLabels.delete}
                >
                    <Trash2 size={16} />
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon actionBadgeBtn"
                    onClick={onDownloadMd}
                    aria-label={actionLabels.downloadMd}
                    data-label={actionLabels.downloadMd}
                >
                    <Download size={16} />
                    <span className="iconBadge">MD</span>
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon actionBadgeBtn"
                    onClick={onPreviewPdf}
                    aria-label={actionLabels.previewPdf}
                    data-label={actionLabels.previewPdf}
                >
                    <Eye size={16} />
                    <span className="iconBadge">PDF</span>
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon actionBadgeBtn"
                    onClick={onOpenPdf}
                    aria-label={actionLabels.openPdf}
                    data-label={actionLabels.openPdf}
                >
                    <ExternalLink size={16} />
                    <span className="iconBadge">PDF</span>
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon actionBadgeBtn"
                    onClick={onDownloadPdf}
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
                onFileNameChange={onFileNameChange}
                onFileNameCommit={onFileNameCommit}
                onFileNameKeyDown={onFileNameKeyDown}
                onToggleHistory={onToggleHistory}
                onStartRename={onStartRename}
                onSelectRecent={onSelectRecent}
            />
            <ThemeSwitch
                theme={theme}
                onThemeChange={onThemeChange}
            />
            <LocaleSwitch
                locale={locale}
                onLocaleChange={onLocaleChange}
            />
            <ViewModeSwitch
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
            />
        </header>
    );
}

import type { RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Locale } from '../../lib/format';
import type { RecentDocument } from '../../types';

interface FileHistoryMenuProps {
    fileName: string;
    recentDocuments: RecentDocument[];
    isEditingFileName: boolean;
    isHistoryOpen: boolean;
    locale: Locale;
    fileNameInputRef: RefObject<HTMLInputElement | null>;
    onFileNameChange: (value: string) => void;
    onFileNameCommit: () => void;
    onFileNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onToggleHistory: () => void;
    onStartRename: () => void;
    onSelectRecent: (filename: string) => void;
}

export function FileHistoryMenu({
    fileName,
    recentDocuments,
    isEditingFileName,
    isHistoryOpen,
    locale,
    fileNameInputRef,
    onFileNameChange,
    onFileNameCommit,
    onFileNameKeyDown,
    onToggleHistory,
    onStartRename,
    onSelectRecent,
}: FileHistoryMenuProps) {
    return (
        <div className="fileHistory">
            {isEditingFileName ? (
                <input
                    ref={fileNameInputRef}
                    className="fileNameEditor"
                    value={fileName}
                    onChange={(event) => onFileNameChange(event.target.value)}
                    onBlur={onFileNameCommit}
                    onKeyDown={onFileNameKeyDown}
                />
            ) : (
                <button
                    type="button"
                    className="fileHistoryTrigger"
                    onClick={onToggleHistory}
                    onDoubleClick={onStartRename}
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
                                onClick={() => onSelectRecent(document.filename)}
                            >
                                {document.filename}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

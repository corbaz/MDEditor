import { Printer, Save } from 'lucide-react';
import { PreviewContent } from './PreviewContent';

interface PreviewPaneProps {
    markdown: string;
    saveStatus: 'idle' | 'saving' | 'saved';
    saveLabel: string;
    printLabel: string;
    onSave: () => void;
    onPrint: () => void;
}

export function PreviewPane({
    markdown,
    saveStatus,
    saveLabel,
    printLabel,
    onSave,
    onPrint,
}: PreviewPaneProps) {
    return (
        <aside className="previewWrap fullPreview" data-testid="preview-wrap">
            <div className="previewHeader previewHeaderRow">
                <span>Preview</span>
                <button
                    type="button"
                    className={`iconBtn actionIcon saveBtn ${saveStatus}`}
                    onClick={onSave}
                    aria-label={saveLabel}
                    data-label={saveLabel}
                >
                    <Save size={14} />
                </button>
                <button
                    type="button"
                    className="iconBtn actionIcon"
                    onClick={onPrint}
                    aria-label={printLabel}
                    data-label={printLabel}
                >
                    <Printer size={14} />
                </button>
            </div>
            <div className="pdfPreviewViewport screenPreviewViewport">
                <div className="pdfPreviewPage pdfPreviewPageVisible">
                    <PreviewContent markdown={markdown} />
                </div>
            </div>
        </aside>
    );
}

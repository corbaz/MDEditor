import { Download, Printer, X } from 'lucide-react';
import type { Locale } from '../../lib/format';
import type { PdfViewerDocument } from '../../types';
import { PreviewContent } from '../PreviewPane/PreviewContent';

interface PdfModalProps {
    open: boolean;
    pdfViewerDocument: PdfViewerDocument | null;
    embeddedPdfUrl: string;
    markdown: string;
    locale: Locale;
    exportLabel: string;
    printLabel: string;
    onClose: () => void;
    onExportPdfAsMarkdown: () => void;
    onPrint: () => void;
}

export function PdfModal({
    open,
    pdfViewerDocument,
    embeddedPdfUrl,
    markdown,
    locale,
    exportLabel,
    printLabel,
    onClose,
    onExportPdfAsMarkdown,
    onPrint,
}: PdfModalProps) {
    if (!open) return null;

    return (
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
            onClick={onClose}
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
                            onClick={onExportPdfAsMarkdown}
                            aria-label={exportLabel}
                            data-label={exportLabel}
                        >
                            <Download size={14} />
                            <span className="iconBadge">MD</span>
                        </button>
                    )}
                    <button
                        type="button"
                        className="iconBtn actionIcon"
                        onClick={onPrint}
                        aria-label={printLabel}
                        data-label={printLabel}
                    >
                        <Printer size={14} />
                    </button>
                    <button
                        type="button"
                        className="iconBtn actionIcon"
                        onClick={onClose}
                        aria-label={locale === 'es' ? 'Cerrar' : 'Close'}
                        data-label={locale === 'es' ? 'Cerrar' : 'Close'}
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
                            <PreviewContent markdown={markdown} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

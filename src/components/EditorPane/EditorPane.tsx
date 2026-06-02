import { forwardRef } from 'react';
import {
    BlockTypeSelect,
    BoldItalicUnderlineToggles,
    CodeToggle,
    CreateLink,
    InsertCodeBlock,
    InsertImage,
    InsertTable,
    InsertThematicBreak,
    ListsToggle,
    MDXEditor,
    StrikeThroughSupSubToggles,
    UndoRedo,
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
} from '@mdxeditor/editor';
import type { Locale } from '../../lib/format';
import { EditorStyleTools } from './EditorStyleTools';

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

type EditorPaneProps = {
    locale: Locale;
    markdown: string;
    editorDocumentKey: string;
    imageUploadHandler: (image: File) => Promise<string>;
    imagePreviewHandler: (src: string) => Promise<string>;
    textColors: string[];
    highlightColors: string[];
    availableFonts: string[];
    selectedTextColor: string;
    selectedHighlightColor: string;
    selectedFont: string;
    onApplyTextColor: (color: string) => void;
    onApplyHighlight: (color: string) => void;
    onApplyFont: (font: string) => void;
    onRememberSelection: () => void;
    onChange: (markdown: string) => void;
};

export const EditorPane = forwardRef<MDXEditorMethods, EditorPaneProps>(
    function EditorPane(
        {
            locale,
            markdown,
            editorDocumentKey,
            imageUploadHandler,
            imagePreviewHandler,
            textColors,
            highlightColors,
            availableFonts,
            selectedTextColor,
            selectedHighlightColor,
            selectedFont,
            onApplyTextColor,
            onApplyHighlight,
            onApplyFont,
            onRememberSelection,
            onChange,
        },
        ref
    ) {
        const translation = (
            key: string,
            defaultValue: string,
            interpolations?: Record<string, string | number>
        ) => {
            if (
                key === 'toolbar.blockTypes.heading' &&
                interpolations?.level
            ) {
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

        return (
            <div className="editorWrap" data-testid="editor-wrap">
                <MDXEditor
                    key={editorDocumentKey}
                    ref={ref}
                    markdown={markdown}
                    onChange={onChange}
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
                                    <EditorStyleTools
                                        locale={locale}
                                        textColors={textColors}
                                        highlightColors={highlightColors}
                                        availableFonts={availableFonts}
                                        selectedTextColor={selectedTextColor}
                                        selectedHighlightColor={
                                            selectedHighlightColor
                                        }
                                        selectedFont={selectedFont}
                                        onApplyTextColor={onApplyTextColor}
                                        onApplyHighlight={onApplyHighlight}
                                        onApplyFont={onApplyFont}
                                        onRememberSelection={onRememberSelection}
                                    />
                                </>
                            ),
                        }),
                    ]}
                />
            </div>
        );
    }
);

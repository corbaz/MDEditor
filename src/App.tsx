import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { ChevronDown, Download, FilePlus, Folder, FolderOpen, Highlighter, Palette, Save, Trash2 } from 'lucide-react'
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
} from '@mdxeditor/editor'
import './App.css'

type Locale = 'es' | 'en'
type ViewMode = 'editor' | 'source' | 'preview'
type MaybeFileHandle = {
  name?: string
  createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
}

type RecentDocument = {
  filename: string
  updatedAt: number
  filePath?: string
  folderPath?: string
  sizeBytes?: number
}

type LocalFontData = {
  family: string
}

type WindowWithLocalFonts = Window & {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

type InlineStyleKind = 'textColor' | 'highlight' | 'font'

const isRenderableImageSrc = (src: string) =>
  /^(data:image\/|https?:\/\/|blob:)/i.test(src)

const toLocalImagePath = (src: string) => {
  const decoded = decodeURI(src.trim()).replace(/^@/, '')
  if (decoded.startsWith('file://')) return decoded.replace(/^file:\/\//, '')
  if (decoded.startsWith('/')) return decoded
  return null
}

function PreviewImage({
  src = '',
  alt = '',
  width,
  height,
}: {
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
}) {
  const [resolvedSrc, setResolvedSrc] = useState(src)

  useEffect(() => {
    let cancelled = false
    const localPath = toLocalImagePath(src)

    if (!localPath || isRenderableImageSrc(src)) {
      setResolvedSrc(src)
      return
    }

    const loadLocalImage = async () => {
      try {
        const dataUrl = await window.electronAPI?.readLocalImageAsDataUrl(localPath)
        if (!cancelled && dataUrl) setResolvedSrc(dataUrl)
      } catch {
        if (!cancelled) setResolvedSrc(src)
      }
    }

    void loadLocalImage()

    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <img
      className="previewImage"
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      style={{
        maxWidth: '100%',
        width: width ? undefined : 'auto',
        height: height ? undefined : 'auto',
      }}
    />
  )
}

const initialMarkdown = ''

const textColors = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c']
const highlightColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecdd3', '#e9d5ff', '#fed7aa']
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
]

const getReadableMarkdown = (value: string) =>
  value.replace(/data:image\/[^)\s"']+/gi, (match) => `${match.slice(0, 100)}...`)

const getByteSize = (value: string) => new Blob([value]).size

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const formatSavedAt = (value: number | null, locale: Locale) => {
  if (!value) return locale === 'es' ? 'sin guardar' : 'not saved'

  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const fileToBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const sanitizeStyleValue = (value: string) => value.replace(/[;"<>]/g, '').trim()

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getStyleDeclaration = (kind: InlineStyleKind, value: string) => {
  const cleanValue = sanitizeStyleValue(value)
  if (kind === 'textColor') return { property: 'color', value: cleanValue }
  if (kind === 'highlight') return { property: 'background-color', value: cleanValue }
  return { property: 'font-family', value: cleanValue }
}

const mergeStyle = (currentStyle: string, kind: InlineStyleKind, value: string) => {
  const styles = new Map<string, string>()
  currentStyle
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const separatorIndex = declaration.indexOf(':')
      if (separatorIndex < 0) return
      styles.set(
        declaration.slice(0, separatorIndex).trim().toLowerCase(),
        declaration.slice(separatorIndex + 1).trim(),
      )
    })

  const nextStyle = getStyleDeclaration(kind, value)
  styles.set(nextStyle.property, nextStyle.value)

  return Array.from(styles.entries())
    .map(([property, styleValue]) => `${property}: ${styleValue}`)
    .join('; ')
}

const getStyledMarkdown = (kind: InlineStyleKind, value: string, selectionText: string) => {
  const content = escapeHtml(selectionText)
  return `<span style="${mergeStyle('', kind, value)}">${content}</span>`
}

const replaceSelectedTextInMarkdown = (
  source: string,
  selectedText: string,
  kind: InlineStyleKind,
  value: string,
) => {
  const escapedSelection = escapeRegExp(escapeHtml(selectedText))
  const styledTextPattern = new RegExp(
    `<(span|mark)([^>]*)style=["']([^"']*)["']([^>]*)>${escapedSelection}</\\1>`,
    'i',
  )
  const styledTextMatch = source.match(styledTextPattern)
  if (styledTextMatch?.index !== undefined) {
    const [fullMatch, tagName, beforeStyle = '', currentStyle = '', afterStyle = ''] = styledTextMatch
    const merged = `<${tagName}${beforeStyle}style="${mergeStyle(currentStyle, kind, value)}"${afterStyle}>${escapeHtml(selectedText)}</${tagName}>`
    return `${source.slice(0, styledTextMatch.index)}${merged}${source.slice(styledTextMatch.index + fullMatch.length)}`
  }

  const replacement = getStyledMarkdown(kind, value, selectedText)
  const directIndex = source.indexOf(selectedText)
  if (directIndex >= 0) {
    return `${source.slice(0, directIndex)}${replacement}${source.slice(directIndex + selectedText.length)}`
  }

  const normalizedSelection = selectedText.replace(/\s+/g, ' ').trim()
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const normalizedLine = line.replace(/\s+/g, ' ')
    const lineIndex = normalizedLine.indexOf(normalizedSelection)
    if (lineIndex >= 0) {
      const prefix = line.slice(0, lineIndex)
      const suffix = line.slice(lineIndex + normalizedSelection.length)
      lines[index] = `${prefix}${replacement}${suffix}`
      return lines.join('\n')
    }
  }

  return source
}

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
  'Upload an image from your device:': 'Subir una imagen desde tu dispositivo:',
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
}

function App() {
  const [locale, setLocale] = useState<Locale>('es')
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [fileName, setFileName] = useState('document.md')
  const [filePath, setFilePath] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [fileHandle, setFileHandle] = useState<MaybeFileHandle | null>(null)
  const [isLoadingLatest, setIsLoadingLatest] = useState(true)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([])
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isEditingFileName, setIsEditingFileName] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')
  const [selectedTextColor, setSelectedTextColor] = useState(textColors[0])
  const [selectedHighlightColor, setSelectedHighlightColor] = useState(highlightColors[0])
  const [selectedFont, setSelectedFont] = useState(fallbackFonts[0])
  const [availableFonts, setAvailableFonts] = useState(fallbackFonts)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const editorRef = useRef<MDXEditorMethods>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileNameInputRef = useRef<HTMLInputElement>(null)
  const hasLoadedLatestRef = useRef(false)
  const lastPersistedRef = useRef('')
  const lastSelectedTextRef = useRef('')
  const fileNameBeforeEditRef = useRef('')

  const translation = (
    key: string,
    defaultValue: string,
    interpolations?: Record<string, string | number>,
  ) => {
    if (key === 'toolbar.blockTypes.heading' && interpolations?.level) {
      return `H${interpolations.level}`
    }

    const translated = locale === 'en' ? defaultValue : esTranslations[defaultValue] ?? defaultValue
    return Object.entries(interpolations ?? {}).reduce(
      (label, [name, value]) => label.replaceAll(`{{${name}}}`, String(value)),
      translated,
    )
  }

  const imageUploadHandler = useMemo(
    () => async (image: File) => {
      const base64 = await fileToBase64(image)
      const savedPath = await window.electronAPI?.saveImageFile({
        name: image.name,
        type: image.type,
        base64,
      })

      if (savedPath) return savedPath

      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('image read failed'))
        reader.readAsDataURL(image)
      })
    },
    [],
  )

  const imagePreviewHandler = useMemo(
    () => async (src: string) => {
      const localPath = toLocalImagePath(src)
      if (!localPath || isRenderableImageSrc(src)) return src

      try {
        return await window.electronAPI?.readLocalImageAsDataUrl(localPath) ?? src
      } catch {
        return src
      }
    },
    [],
  )

  const getContent = () => markdown

  const currentSizeBytes = useMemo(() => getByteSize(markdown), [markdown])

  const refreshRecentDocuments = async () => {
    const recent = await window.electronAPI?.loadRecentDocuments()
    setRecentDocuments(recent ?? [])
  }

  const persistLatestDocument = async (
    nextFileName = fileName,
    nextMarkdown = getContent(),
    refreshHistory = false,
    metadata: { filePath?: string; folderPath?: string; sizeBytes?: number; previousFilename?: string } = {},
  ) => {
    const nextFilePath = metadata.filePath ?? filePath
    const nextFolderPath = metadata.folderPath ?? folderPath
    const nextSizeBytes = metadata.sizeBytes ?? getByteSize(nextMarkdown)
    const signature = `${nextFileName}\n${nextFilePath}\n${nextMarkdown}`
    if (signature === lastPersistedRef.current) return
    lastPersistedRef.current = signature

    const saved = await window.electronAPI?.saveLatestDocument({
      filename: nextFileName,
      markdown: nextMarkdown,
      filePath: nextFilePath,
      folderPath: nextFolderPath,
      sizeBytes: nextSizeBytes,
      previousFilename: metadata.previousFilename,
    })
    setLastSavedAt(saved?.updatedAt ?? Date.now())
    if (refreshHistory) await refreshRecentDocuments()
  }

  useEffect(() => {
    let cancelled = false

    const loadLatestDocument = async () => {
      const latest = await window.electronAPI?.loadLatestDocument()
      if (cancelled) return

      const nextMarkdown = latest?.markdown ?? ''
      setMarkdown(nextMarkdown)
      setFileName(latest?.filename || 'document.md')
      setFilePath(latest?.filePath ?? '')
      setFolderPath(latest?.folderPath ?? '')
      setLastSavedAt(latest?.updatedAt ?? null)
      editorRef.current?.setMarkdown(nextMarkdown)
      await refreshRecentDocuments()
      hasLoadedLatestRef.current = true
      setIsLoadingLatest(false)
    }

    void loadLatestDocument()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedLatestRef.current || isEditingFileName) return

    const timeout = window.setTimeout(() => {
      void persistLatestDocument(fileName, markdown)
    }, 2500)

    return () => window.clearTimeout(timeout)
  }, [fileName, markdown, isEditingFileName])

  useEffect(() => {
    if (!isEditingFileName) return
    fileNameInputRef.current?.focus()
    fileNameInputRef.current?.select()
  }, [isEditingFileName])

  useEffect(() => {
    const loadFonts = async () => {
      try {
        const localFonts = await (window as WindowWithLocalFonts).queryLocalFonts?.()
        const fontNames = Array.from(
          new Set(localFonts?.map((font) => font.family).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b))

        if (fontNames.length > 0) {
          setAvailableFonts(['System', ...fontNames])
        }
      } catch {
        setAvailableFonts(fallbackFonts)
      }
    }

    void loadFonts()
  }, [])

  const rememberSelection = () => {
    const selectedText = window.getSelection()?.toString().trim()
    if (selectedText) lastSelectedTextRef.current = selectedText
  }

  const applyInlineStyle = (kind: InlineStyleKind, value: string) => {
    const selectedText = window.getSelection()?.toString().trim() || lastSelectedTextRef.current
    if (!selectedText) return

    const nextMarkdown = replaceSelectedTextInMarkdown(markdown, selectedText, kind, value)
    if (nextMarkdown === markdown) return

    setMarkdown(nextMarkdown)
    editorRef.current?.setMarkdown(nextMarkdown)
    lastSelectedTextRef.current = ''
  }

  const downloadMarkdown = () => {
    const blob = new Blob([getContent()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const normalizeFileName = (value: string) => {
    const trimmed = value.trim() || 'untitled.md'
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`
  }

  const createNewDocument = async () => {
    await persistLatestDocument(fileName, getContent(), true)
    const nextFileName = `untitled-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[-:T]/g, '')}.md`

    setMarkdown('')
    editorRef.current?.setMarkdown('')
    setFileName(nextFileName)
    setFilePath('')
    setFolderPath('')
    setLastSavedAt(null)
    setFileHandle(null)
    setViewMode('editor')
    setIsHistoryOpen(false)
    fileNameBeforeEditRef.current = nextFileName
    setIsEditingFileName(true)
    lastPersistedRef.current = ''
  }

  const resetToBlankDocument = () => {
    const nextFileName = `untitled-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[-:T]/g, '')}.md`

    setMarkdown('')
    editorRef.current?.setMarkdown('')
    setFileName(nextFileName)
    setFilePath('')
    setFolderPath('')
    setLastSavedAt(null)
    setFileHandle(null)
    setViewMode('editor')
    setIsHistoryOpen(false)
    fileNameBeforeEditRef.current = nextFileName
    setIsEditingFileName(true)
    lastPersistedRef.current = ''
  }

  const openRecentDocument = async (selectedFileName: string) => {
    if (!selectedFileName || selectedFileName === fileName) return

    setIsHistoryOpen(false)
    setIsLoadingDocument(true)

    try {
      await persistLatestDocument(fileName, getContent())
      const selected = await window.electronAPI?.loadRecentDocument(selectedFileName)
      if (!selected) return

      setMarkdown(selected.markdown)
      editorRef.current?.setMarkdown(selected.markdown)
      setFileName(selected.filename)
      setFilePath(selected.filePath ?? '')
      setFolderPath(selected.folderPath ?? '')
      setLastSavedAt(selected.updatedAt ?? null)
      setFileHandle(null)
      await persistLatestDocument(selected.filename, selected.markdown, true, {
        filePath: selected.filePath,
        folderPath: selected.folderPath,
        sizeBytes: selected.sizeBytes,
      })
    } finally {
      setIsLoadingDocument(false)
    }
  }

  const openFromDevice = async () => {
    const electronDocument = await window.electronAPI?.openMarkdownFile?.()
    if (electronDocument) {
      setMarkdown(electronDocument.markdown)
      editorRef.current?.setMarkdown(electronDocument.markdown)
      setFileName(electronDocument.filename)
      setFilePath(electronDocument.filePath)
      setFolderPath(electronDocument.folderPath)
      setLastSavedAt(electronDocument.updatedAt)
      setFileHandle(null)
      await persistLatestDocument(electronDocument.filename, electronDocument.markdown, true, {
        filePath: electronDocument.filePath,
        folderPath: electronDocument.folderPath,
        sizeBytes: electronDocument.sizeBytes,
      })
      return
    }

    const picker = window as Window & {
      showOpenFilePicker?: (options: unknown) => Promise<Array<{ name?: string; getFile: () => Promise<File> }>>
    }
    if (!picker.showOpenFilePicker) {
      fileInputRef.current?.click()
      return
    }
    const [handle] = await picker.showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      multiple: false,
    })
    if (!handle) return
    const file = await handle.getFile()
    const content = await file.text()
    setMarkdown(content)
    editorRef.current?.setMarkdown(content)
    setFileName(handle.name ?? file.name ?? 'document.md')
    setFilePath('')
    setFolderPath('')
    setLastSavedAt(file.lastModified || Date.now())
    setFileHandle(handle as unknown as MaybeFileHandle)
    await persistLatestDocument(handle.name ?? file.name ?? 'document.md', content, true, {
      sizeBytes: file.size,
    })
  }

  const onFallbackFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setMarkdown(content)
    editorRef.current?.setMarkdown(content)
    setFileName(file.name || 'document.md')
    setFilePath('')
    setFolderPath('')
    setLastSavedAt(file.lastModified || Date.now())
    setFileHandle(null)
    event.target.value = ''
    await persistLatestDocument(file.name || 'document.md', content, true, {
      sizeBytes: file.size,
    })
  }

  const saveToDevice = async () => {
    setSaveStatus('saving')
    const content = getContent()
    const previousFilename = fileName
    try {
      if (filePath) {
        const saved = await window.electronAPI?.writeMarkdownFile?.({
          filePath,
          markdown: content,
        })
        if (saved) {
          setFileName(saved.filename)
          setFilePath(saved.filePath)
          setFolderPath(saved.folderPath)
          setLastSavedAt(saved.updatedAt)
          await persistLatestDocument(saved.filename, content, true, {
            filePath: saved.filePath,
            folderPath: saved.folderPath,
            sizeBytes: saved.sizeBytes,
          })
          setSaveStatus('saved')
          window.setTimeout(() => setSaveStatus('idle'), 1400)
          return
        }
      }

      await persistLatestDocument(fileName, content, true)
      const electronSaved = await window.electronAPI?.saveMarkdownFile?.({
        filename: fileName,
        markdown: content,
      })
      if (electronSaved) {
        setFileName(electronSaved.filename)
        setFilePath(electronSaved.filePath)
        setFolderPath(electronSaved.folderPath)
        setLastSavedAt(electronSaved.updatedAt)
        setFileHandle(null)
        await persistLatestDocument(electronSaved.filename, content, true, {
          filePath: electronSaved.filePath,
          folderPath: electronSaved.folderPath,
          sizeBytes: electronSaved.sizeBytes,
          previousFilename: previousFilename === electronSaved.filename ? undefined : previousFilename,
        })
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 1400)
        return
      }

      if (fileHandle?.createWritable) {
        const writable = await fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
        setLastSavedAt(Date.now())
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 1400)
        return
      }
      const saver = window as Window & {
        showSaveFilePicker?: (options: unknown) => Promise<MaybeFileHandle>
      }
      if (!saver.showSaveFilePicker) {
        downloadMarkdown()
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 1400)
        return
      }
      const handle = await saver.showSaveFilePicker({
        suggestedName: fileName.endsWith('.md') ? fileName : `${fileName}.md`,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      })
      if (!handle.createWritable) {
        downloadMarkdown()
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 1400)
        return
      }
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      setFileHandle(handle)
      if (handle.name) setFileName(handle.name)
      setLastSavedAt(Date.now())
      setSaveStatus('saved')
      window.setTimeout(() => setSaveStatus('idle'), 1400)
    } catch (error) {
      setSaveStatus('idle')
      throw error
    }
  }

  const deleteCurrentFile = async () => {
    const message = filePath
      ? locale === 'es'
        ? `Eliminar del disco?\n${filePath}`
        : `Delete from disk?\n${filePath}`
      : locale === 'es'
        ? 'Este documento no tiene archivo en disco. Se limpiara el editor.'
        : 'This document has no file on disk. The editor will be cleared.'

    if (!window.confirm(message)) return

    await window.electronAPI?.deleteMarkdownFile?.({
      filename: fileName,
      filePath,
    })
    resetToBlankDocument()
    await refreshRecentDocuments()
  }

  const visibleFolder = folderPath || (locale === 'es' ? 'Nuevo sin guardar' : 'New unsaved')

  return (
    <main className="app">
      <header className="appHeader">
        <div className="headerLeft">
          <h1>MD Editor</h1>
          <button type="button" className="textBtn" onClick={() => void createNewDocument()} title={locale === 'es' ? 'Nuevo' : 'New'}>
            <FilePlus size={16} />
            <span>{locale === 'es' ? 'Nuevo' : 'New'}</span>
          </button>
          <button type="button" className="iconBtn" onClick={openFromDevice} title={locale === 'es' ? 'Abrir archivo' : 'Open file'}>
            <FolderOpen size={16} />
          </button>
          <button
            type="button"
            className={`iconBtn saveBtn ${saveStatus}`}
            onClick={saveToDevice}
            title={saveStatus === 'saved' ? (locale === 'es' ? 'Guardado' : 'Saved') : 'Save'}
          >
            <Save size={16} />
          </button>
          <button type="button" className="iconBtn dangerBtn" onClick={() => void deleteCurrentFile()} title={locale === 'es' ? 'Eliminar archivo' : 'Delete file'}>
            <Trash2 size={16} />
          </button>
          <button type="button" className="iconBtn" onClick={downloadMarkdown} title="Download .md">
            <Download size={16} />
          </button>
        </div>
        <div className="fileHistory">
          {isEditingFileName ? (
            <input
              ref={fileNameInputRef}
              className="fileNameEditor"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              onBlur={() => {
                const previousFilename = fileNameBeforeEditRef.current
                const normalized = normalizeFileName(fileName)
                setFileName(normalized)
                setIsEditingFileName(false)
                void persistLatestDocument(normalized, markdown, true, {
                  previousFilename: previousFilename === normalized ? undefined : previousFilename,
                })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  setIsEditingFileName(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="fileHistoryTrigger"
              onClick={() => setIsHistoryOpen((open) => !open)}
              onDoubleClick={() => {
                fileNameBeforeEditRef.current = fileName
                setIsEditingFileName(true)
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
                  {locale === 'es' ? 'Sin recientes' : 'No recent files'}
                </button>
              ) : (
                recentDocuments.map((document) => (
                  <button
                    key={`${document.filename}-${document.updatedAt}`}
                    type="button"
                    className={document.filename === fileName ? 'active' : ''}
                    onClick={() => void openRecentDocument(document.filename)}
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
        <div className="localeSwitch" role="group" aria-label="Language">
          <button type="button" className={locale === 'es' ? 'active' : ''} onClick={() => setLocale('es')}>ES</button>
          <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>US</button>
        </div>
      </header>

      <div className="modeSwitch" role="group" aria-label="View mode">
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

      <section className="workspace">
        {viewMode === 'editor' && (
          <div className="editorWrap">
            <MDXEditor
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
                codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
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
                      <div className="styleTools" onMouseDown={rememberSelection}>
                        <div className="styleToolGroup" title={locale === 'es' ? 'Color de texto' : 'Text color'}>
                          <Palette size={15} />
                          {textColors.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="colorSwatch"
                              style={{ backgroundColor: color }}
                              aria-label={locale === 'es' ? 'Color de texto' : 'Text color'}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSelectedTextColor(color)
                                applyInlineStyle('textColor', color)
                              }}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedTextColor}
                            aria-label={locale === 'es' ? 'Elegir color de texto' : 'Choose text color'}
                            onChange={(event) => {
                              setSelectedTextColor(event.target.value)
                              applyInlineStyle('textColor', event.target.value)
                            }}
                          />
                        </div>
                        <div className="styleToolGroup" title={locale === 'es' ? 'Fondo resaltado' : 'Highlight'}>
                          <Highlighter size={15} />
                          {highlightColors.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="colorSwatch"
                              style={{ backgroundColor: color }}
                              aria-label={locale === 'es' ? 'Fondo resaltado' : 'Highlight'}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSelectedHighlightColor(color)
                                applyInlineStyle('highlight', color)
                              }}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedHighlightColor}
                            aria-label={locale === 'es' ? 'Elegir fondo resaltado' : 'Choose highlight'}
                            onChange={(event) => {
                              setSelectedHighlightColor(event.target.value)
                              applyInlineStyle('highlight', event.target.value)
                            }}
                          />
                        </div>
                        <select
                          className="fontSelect"
                          value={selectedFont}
                          title={locale === 'es' ? 'Fuente' : 'Font'}
                          aria-label={locale === 'es' ? 'Fuente' : 'Font'}
                          onMouseDown={rememberSelection}
                          onChange={(event) => {
                            setSelectedFont(event.target.value)
                            if (event.target.value !== 'System') {
                              applyInlineStyle('font', event.target.value)
                            }
                          }}
                        >
                          {availableFonts.map((font) => (
                            <option key={font} value={font}>
                              {font}
                            </option>
                          ))}
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
            <div className="previewHeader">Preview</div>
            <div className="previewBody">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                urlTransform={(url) => {
                  if (/^data:image\/(?:gif|jpeg|jpg|png|webp|svg\+xml);base64,/i.test(url)) return url
                  return url
                }}
                components={{
                  img: ({ src = '', alt = '', width, height }) => (
                    <PreviewImage src={src} alt={alt} width={width} height={height} />
                  ),
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </aside>
        )}
      </section>

      <input ref={fileInputRef} type="file" accept=".md,text/markdown" className="hiddenFileInput" onChange={onFallbackFileChange} />
      {(isLoadingLatest || isLoadingDocument) && (
        <div className="loadingOverlay" aria-label="Loading latest document">
          <div className="spinner" />
        </div>
      )}
    </main>
  )
}

export default App

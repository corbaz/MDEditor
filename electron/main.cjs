const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let sqliteDatabase = null;
let jsonStorePath = null;

// Test isolation hook (additive, env-gated, no-op in production).
// Playwright launches the prod build with MDEDITOR_USER_DATA pointing at a
// fresh temp dir so tests never touch the real profile / SQLite / images.
// MUST run before app.whenReady() and before any app.getPath('userData') call.
if (process.env.MDEDITOR_USER_DATA) {
    app.setPath('userData', process.env.MDEDITOR_USER_DATA);
}

const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
};

const EXT_BY_MIME = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
};

function toFileUrl(filePath) {
    return `file:///${String(filePath).replace(/\\/g, '/')}`;
}

async function createHiddenPrintWindow() {
    return new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        backgroundColor: '#ffffff',
        webPreferences: {
            sandbox: true,
            plugins: true,
        },
    });
}

function getStorePath() {
    return path.join(app.getPath('userData'), 'md-editor-state.db');
}

function getJsonStorePath() {
    if (!jsonStorePath) {
        jsonStorePath = path.join(
            app.getPath('userData'),
            'md-editor-state.json'
        );
    }
    return jsonStorePath;
}

function getDatabase() {
    if (sqliteDatabase) return sqliteDatabase;

    try {
        const { DatabaseSync } = require('node:sqlite');
        sqliteDatabase = new DatabaseSync(getStorePath());
        sqliteDatabase.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        filename TEXT NOT NULL,
        markdown TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        file_path TEXT,
        folder_path TEXT,
        size_bytes INTEGER
      );

      CREATE TABLE IF NOT EXISTS recent_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        markdown TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        file_path TEXT,
        folder_path TEXT,
        size_bytes INTEGER
      );
    `);
        for (const table of ['documents', 'recent_documents']) {
            for (const column of [
                ['file_path', 'TEXT'],
                ['folder_path', 'TEXT'],
                ['size_bytes', 'INTEGER'],
            ]) {
                try {
                    sqliteDatabase.exec(
                        `ALTER TABLE ${table} ADD COLUMN ${column[0]} ${column[1]};`
                    );
                } catch {
                    // Existing installs already have these columns.
                }
            }
        }
        return sqliteDatabase;
    } catch {
        return null;
    }
}

function getDocumentMetadata(document, markdown, updatedAt) {
    const filePath = document.filePath ? String(document.filePath) : '';
    const folderPath = document.folderPath
        ? String(document.folderPath)
        : filePath
          ? path.dirname(filePath)
          : '';
    const sizeBytes = Number.isFinite(document.sizeBytes)
        ? Number(document.sizeBytes)
        : Buffer.byteLength(markdown, 'utf8');

    return { filePath, folderPath, sizeBytes, updatedAt };
}

async function saveLatestDocument(document) {
    const filename = String(document.filename || 'document.md');
    const markdown = String(document.markdown || '');
    const previousFilename = document.previousFilename
        ? String(document.previousFilename)
        : '';
    const updatedAt = Date.now();
    const metadata = getDocumentMetadata(document, markdown, updatedAt);
    const database = getDatabase();

    if (database) {
        database
            .prepare(
                `
        INSERT INTO documents (id, filename, markdown, updated_at, file_path, folder_path, size_bytes)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          filename = excluded.filename,
          markdown = excluded.markdown,
          updated_at = excluded.updated_at,
          file_path = excluded.file_path,
          folder_path = excluded.folder_path,
          size_bytes = excluded.size_bytes;
      `
            )
            .run(
                filename,
                markdown,
                updatedAt,
                metadata.filePath,
                metadata.folderPath,
                metadata.sizeBytes
            );
        if (metadata.filePath) {
            database
                .prepare(
                    'DELETE FROM recent_documents WHERE file_path = ? AND filename <> ?'
                )
                .run(metadata.filePath, filename);

            if (previousFilename && previousFilename !== filename) {
                database
                    .prepare('DELETE FROM recent_documents WHERE filename = ?')
                    .run(previousFilename);
            }

            database
                .prepare(
                    `
          INSERT INTO recent_documents (filename, markdown, updated_at, file_path, folder_path, size_bytes)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(filename) DO UPDATE SET
            markdown = excluded.markdown,
            updated_at = excluded.updated_at,
            file_path = excluded.file_path,
            folder_path = excluded.folder_path,
            size_bytes = excluded.size_bytes;
        `
                )
                .run(
                    filename,
                    markdown,
                    updatedAt,
                    metadata.filePath,
                    metadata.folderPath,
                    metadata.sizeBytes
                );
        }
        database
            .prepare(
                `
        DELETE FROM recent_documents
        WHERE id NOT IN (
          SELECT id FROM recent_documents
          ORDER BY updated_at DESC
          LIMIT 5
        );
      `
            )
            .run();
        return { filename, markdown, ...metadata };
    }

    const previousJson = await loadLatestDocument();
    await fs.writeFile(
        getJsonStorePath(),
        JSON.stringify({ filename, markdown, ...metadata }, null, 2),
        'utf8'
    );
    return {
        filename,
        markdown,
        previousFilename: previousFilename || previousJson?.filename,
        ...metadata,
    };
}

async function pathExists(filePath) {
    if (!filePath) return false;

    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch {
        return false;
    }
}

async function loadLatestDocument() {
    const database = getDatabase();

    if (database) {
        const row = database
            .prepare(
                `
        SELECT
          filename,
          markdown,
          updated_at AS updatedAt,
          file_path AS filePath,
          folder_path AS folderPath,
          size_bytes AS sizeBytes
        FROM documents
        WHERE id = 1
      `
            )
            .get();
        return row || null;
    }

    try {
        const raw = await fs.readFile(getJsonStorePath(), 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function loadRecentDocuments() {
    const database = getDatabase();

    if (database) {
        const rows = database
            .prepare(
                `
        SELECT filename, updated_at AS updatedAt
        , file_path AS filePath, folder_path AS folderPath, size_bytes AS sizeBytes
        FROM recent_documents
        ORDER BY updated_at DESC
      `
            )
            .all();
        const existingRows = [];

        for (const row of rows) {
            if (await pathExists(row.filePath)) {
                existingRows.push(row);
            } else {
                clearDocumentFromStore({
                    filename: row.filename,
                    filePath: row.filePath,
                });
            }

            if (existingRows.length === 5) break;
        }

        return existingRows;
    }

    const latest = await loadLatestDocument();
    return latest?.filePath && (await pathExists(latest.filePath))
        ? [
              {
                  filename: latest.filename,
                  updatedAt: latest.updatedAt,
                  filePath: latest.filePath,
                  folderPath: latest.folderPath,
                  sizeBytes: latest.sizeBytes,
              },
          ]
        : [];
}

async function loadRecentDocument(filename) {
    const database = getDatabase();
    const normalizedFilename = String(filename || '');

    if (database) {
        const row = database
            .prepare(
                `
        SELECT filename, markdown, updated_at AS updatedAt
        , file_path AS filePath, folder_path AS folderPath, size_bytes AS sizeBytes
        FROM recent_documents
        WHERE filename = ?
      `
            )
            .get(normalizedFilename);
        if (row && !(await pathExists(row.filePath))) {
            clearDocumentFromStore({
                filename: row.filename,
                filePath: row.filePath,
            });
            return null;
        }
        return row || null;
    }

    const latest = await loadLatestDocument();
    return latest?.filename === normalizedFilename &&
        (await pathExists(latest.filePath))
        ? latest
        : null;
}

function clearDocumentFromStore({ filename = '', filePath = '' }) {
    const database = getDatabase();

    if (!database) return;

    if (filePath) {
        database
            .prepare('DELETE FROM recent_documents WHERE file_path = ?')
            .run(filePath);
    }

    if (filename) {
        database
            .prepare('DELETE FROM recent_documents WHERE filename = ?')
            .run(filename);
    }

    database
        .prepare(
            `
      DELETE FROM documents
      WHERE id = 1
        AND (? = '' OR file_path = ?)
        AND (? = '' OR filename = ?)
    `
        )
        .run(filePath, filePath, filename, filename);
}

function createWindow() {
    const windowIconPath = path.join(__dirname, '../public/app-icon.png');
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        autoHideMenuBar: true,
        icon: windowIconPath,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    mainWindow.maximize();

    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
        mainWindow.loadURL(devServerUrl);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

ipcMain.handle('read-local-image-as-data-url', async (_event, rawPath) => {
    const localPath = decodeURI(String(rawPath || ''))
        .replace(/^file:\/\//, '')
        .replace(/^@/, '');
    const ext = path.extname(localPath).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buffer = await fs.readFile(localPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
});

ipcMain.handle('save-image-file', async (_event, image) => {
    const originalName = String(image?.name || 'image');
    const mime = String(image?.type || '');
    const base64 = String(image?.base64 || '');
    const ext =
        EXT_BY_MIME[mime] || path.extname(originalName).toLowerCase() || '.png';
    const safeName =
        path
            .basename(originalName, path.extname(originalName))
            .replace(/[^a-z0-9_-]+/gi, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) || 'image';
    const outputDir = path.join(app.getPath('documents'), 'MDEditor Images');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${Date.now()}-${safeName}${ext}`);
    await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
    return outputPath;
});

ipcMain.handle('open-markdown-file', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [
            { name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] },
        ],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const filePath = result.filePaths[0];
    const markdown = await fs.readFile(filePath, 'utf8');
    const stat = await fs.stat(filePath);

    return {
        filename: path.basename(filePath),
        markdown,
        filePath,
        folderPath: path.dirname(filePath),
        sizeBytes: stat.size,
        updatedAt: stat.mtimeMs,
    };
});

ipcMain.handle('write-markdown-file', async (_event, document) => {
    const filePath = String(document?.filePath || '');
    if (!filePath) return null;

    const markdown = String(document?.markdown || '');
    await fs.writeFile(filePath, markdown, 'utf8');
    const stat = await fs.stat(filePath);

    return {
        filename: path.basename(filePath),
        markdown,
        filePath,
        folderPath: path.dirname(filePath),
        sizeBytes: stat.size,
        updatedAt: stat.mtimeMs,
    };
});

ipcMain.handle('file-exists', async (_event, targetPath) => {
    try {
        await fs.access(String(targetPath || ''));
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('save-markdown-file', async (event, document) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const fallbackName = String(document?.filename || 'document.md');
    const suggestedName = fallbackName.toLowerCase().endsWith('.md')
        ? fallbackName
        : `${fallbackName}.md`;
    const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
    });

    if (result.canceled || !result.filePath) return null;

    const markdown = String(document?.markdown || '');
    await fs.writeFile(result.filePath, markdown, 'utf8');
    const stat = await fs.stat(result.filePath);

    return {
        filename: path.basename(result.filePath),
        markdown,
        filePath: result.filePath,
        folderPath: path.dirname(result.filePath),
        sizeBytes: stat.size,
        updatedAt: stat.mtimeMs,
    };
});

ipcMain.handle('delete-markdown-file', async (_event, document) => {
    const filePath = String(document?.filePath || '');
    const filename = String(document?.filename || '');
    if (!filePath) {
        clearDocumentFromStore({ filename });
        return { deleted: false };
    }

    await fs.unlink(filePath);
    clearDocumentFromStore({ filename, filePath });
    return { deleted: true };
});

ipcMain.handle('save-latest-document', async (_event, document) => {
    return await saveLatestDocument(document);
});

ipcMain.handle('load-latest-document', async () => {
    return await loadLatestDocument();
});

ipcMain.handle('load-recent-documents', async () => {
    return await loadRecentDocuments();
});

ipcMain.handle('load-recent-document', async (_event, filename) => {
    return await loadRecentDocument(filename);
});

ipcMain.handle('export-preview-pdf', async (event, document) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const fallbackName = String(document?.filename || 'document.pdf');
    const suggestedName = fallbackName.toLowerCase().endsWith('.pdf')
        ? fallbackName
        : `${fallbackName}.pdf`;
    const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) return null;

    const html = String(document?.html || '');
    const printWindow = await createHiddenPrintWindow();

    try {
        await printWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        );
        await printWindow.webContents.executeJavaScript(
            'document.fonts?.ready ? document.fonts.ready.then(() => true) : true'
        );
        const pdf = await printWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            preferCSSPageSize: true,
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
            },
        });

        await fs.writeFile(result.filePath, pdf);

        return {
            filename: path.basename(result.filePath),
            filePath: result.filePath,
        };
    } finally {
        if (!printWindow.isDestroyed()) {
            printWindow.destroy();
        }
    }
});

ipcMain.handle('print-preview-pdf', async (_event, document) => {
    const html = String(document?.html || '');
    const printWindow = await createHiddenPrintWindow();

    try {
        await printWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        );
        await printWindow.webContents.executeJavaScript(
            'document.fonts?.ready ? document.fonts.ready.then(() => true) : true'
        );

        await new Promise((resolve, reject) => {
            printWindow.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                },
                (success, errorType) => {
                    if (success) {
                        resolve(true);
                        return;
                    }

                    reject(
                        new Error(
                            errorType || 'Failed to print preview document'
                        )
                    );
                }
            );
        });

        return true;
    } finally {
        if (!printWindow.isDestroyed()) {
            printWindow.destroy();
        }
    }
});

ipcMain.handle('pick-pdf-file', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths?.[0]) return null;

    const filePath = result.filePaths[0];

    return {
        filePath,
        filename: path.basename(filePath),
    };
});

ipcMain.handle('read-pdf-file-as-data-url', async (_event, filePath) => {
    const absolutePath = String(filePath || '');
    if (!absolutePath) return null;

    const buffer = await fs.readFile(absolutePath);
    return {
        dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
        filename: path.basename(absolutePath),
        filePath: absolutePath,
    };
});

ipcMain.handle('print-pdf-file', async (_event, filePath) => {
    const absolutePath = String(filePath || '');
    if (!absolutePath) return false;

    const printWindow = await createHiddenPrintWindow();

    try {
        await printWindow.loadURL(toFileUrl(absolutePath));

        await new Promise((resolve) => setTimeout(resolve, 250));

        await new Promise((resolve, reject) => {
            printWindow.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                },
                (success, errorType) => {
                    if (success) {
                        resolve(true);
                        return;
                    }

                    reject(new Error(errorType || 'Failed to print PDF file'));
                }
            );
        });

        return true;
    } finally {
        if (!printWindow.isDestroyed()) {
            printWindow.destroy();
        }
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

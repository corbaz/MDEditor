const fs = require('fs')
const path = require('path')

const sourceFile = process.argv[2]

if (!sourceFile) {
  console.error('Usage: node scripts/normalize-md-table-lines.cjs /path/to/file.md')
  process.exit(1)
}

const absoluteSource = path.resolve(sourceFile)
const backupPath = `${absoluteSource}.table-lines.bak`
const markdown = fs.readFileSync(absoluteSource, 'utf8')

let changedLines = 0
const nextMarkdown = markdown
  .split(/\r?\n/)
  .map((line) => {
    if (line.length < 1000 || !line.trim().startsWith('|')) return line

    changedLines += 1

    if (/^\|\s*:?-{3,}:?\s*\|/.test(line)) {
      return '| :-: | :-: | :-: |'
    }

    return '|     |     |   |'
  })
  .join('\n')

if (changedLines === 0) {
  console.log('No oversized table lines found.')
  process.exit(0)
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(absoluteSource, backupPath)
}

fs.writeFileSync(absoluteSource, nextMarkdown, 'utf8')
console.log(`Normalized ${changedLines} oversized table line(s).`)
console.log(`Backup: ${backupPath}`)

const fs = require('fs')
const path = require('path')

const sourceFile = process.argv[2]

if (!sourceFile) {
  console.error('Usage: node scripts/externalize-md-images.cjs /path/to/file.md')
  process.exit(1)
}

const extByMime = {
  png: '.png',
  jpeg: '.jpg',
  jpg: '.jpg',
  gif: '.gif',
  webp: '.webp',
  'svg+xml': '.svg',
}

const absoluteSource = path.resolve(sourceFile)
const sourceDir = path.dirname(absoluteSource)
const sourceBase = path.basename(absoluteSource, path.extname(absoluteSource))
const backupPath = `${absoluteSource}.bak`
const assetsDirName = `${sourceBase}.assets`
const assetsDir = path.join(sourceDir, assetsDirName)

const markdown = fs.readFileSync(absoluteSource, 'utf8')

let imageIndex = 0
const nextMarkdown = markdown.replace(
  /data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/gi,
  (_match, mime, base64) => {
    imageIndex += 1
    const normalizedMime = String(mime).toLowerCase()
    const extension = extByMime[normalizedMime] || '.png'
    const imageName = `image-${String(imageIndex).padStart(3, '0')}${extension}`
    const imagePath = path.join(assetsDir, imageName)

    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'))

    return `${assetsDirName}/${imageName}`
  },
)

if (imageIndex === 0) {
  console.log('No embedded base64 images found.')
  process.exit(0)
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(absoluteSource, backupPath)
}

fs.writeFileSync(absoluteSource, nextMarkdown, 'utf8')

console.log(`Extracted ${imageIndex} image(s).`)
console.log(`Backup: ${backupPath}`)
console.log(`Assets: ${assetsDir}`)

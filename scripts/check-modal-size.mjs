import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIR = path.join(ROOT, 'src', 'pages')
const EXTENSIONS = new Set(['.jsx', '.tsx'])
const REQUIRED_PREFIX = 'house-md--'
const ALLOWED_SIZES = new Set(['house-md--xs', 'house-md--sm', 'house-md--md', 'house-md--lg', 'house-md--xl'])

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(fullPath))
      continue
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }
  return files
}

function getLineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const regex = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|`([^`]*)`)/g
  const violations = []

  let match
  while ((match = regex.exec(content)) !== null) {
    const classValue = match[1] || match[2] || match[3] || match[4] || ''
    const classTokens = classValue.split(/\s+/).map((s) => s.trim()).filter(Boolean)

    if (!classTokens.includes('house-md')) continue

    const explicitSize = classTokens.find((token) => token.startsWith(REQUIRED_PREFIX))
    if (!explicitSize || !ALLOWED_SIZES.has(explicitSize)) {
      violations.push({
        filePath,
        line: getLineNumber(content, match.index),
        classValue,
      })
    }
  }

  return violations
}

function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    console.error('Directory not found:', TARGET_DIR)
    process.exit(1)
  }

  const files = walk(TARGET_DIR)
  const allViolations = files.flatMap(scanFile)

  if (allViolations.length === 0) {
    console.log('PASS: all modal containers with house-md use explicit size class (house-md--xs/sm/md/lg/xl).')
    process.exit(0)
  }

  console.error('FAIL: found house-md usage without explicit size class.')
  for (const issue of allViolations) {
    const rel = path.relative(ROOT, issue.filePath)
    console.error(`- ${rel}:${issue.line} -> className=\"${issue.classValue}\"`)
  }
  console.error('\nFix by adding one of: house-md--xs, house-md--sm, house-md--md, house-md--lg, house-md--xl')
  process.exit(1)
}

main()

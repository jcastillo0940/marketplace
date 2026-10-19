import { gzipSync } from 'node:zlib'
import { readFileSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROUTE_GROUP_ENTRIES = Object.freeze({
  public: 'src/routes/PublicRoutes.tsx',
  producer: 'src/routes/ProducerRoutes.tsx',
  admin: 'src/routes/AdminRoutes.tsx',
})

export const INITIAL_BUNDLE_LIMITS = Object.freeze({
  minifiedBytes: 400_000,
  gzipBytes: 110_000,
})

function requireEntry(manifest, key, label) {
  const entry = manifest[key]
  if (!entry || typeof entry.file !== 'string') {
    throw new Error(`Missing ${label} manifest entry: ${key}`)
  }
  return entry
}

function collectStaticClosure(manifest, rootKey) {
  const visited = new Set()

  function visit(key) {
    if (visited.has(key)) return
    const entry = requireEntry(manifest, key, 'static import')
    visited.add(key)
    for (const importedKey of entry.imports ?? []) visit(importedKey)
  }

  visit(rootKey)
  return visited
}

function measureFiles(manifest, keys, outputDirectory) {
  const outputRoot = resolve(outputDirectory)
  const files = new Set()
  let minifiedBytes = 0
  let gzipBytes = 0

  for (const key of keys) {
    const entry = requireEntry(manifest, key, 'bundle')
    if (!/\.(?:m?js)$/.test(entry.file)) continue
    if (files.has(entry.file)) continue

    const path = resolve(outputRoot, entry.file)
    const relativePath = relative(outputRoot, path)
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
      throw new Error(`Manifest asset escapes the build directory: ${entry.file}`)
    }

    const contents = readFileSync(path)
    minifiedBytes += contents.byteLength
    gzipBytes += gzipSync(contents).byteLength
    files.add(entry.file)
  }

  return { minifiedBytes, gzipBytes, files: [...files] }
}

/**
 * Checks the Vite manifest's route-group boundaries and measures the public
 * initial JavaScript static-import closure. Gzip sizes are measured per file,
 * matching separately compressed HTTP assets.
 */
export function verifyRouteChunks({
  manifest,
  outputDirectory,
  entryKey = 'index.html',
  limits = INITIAL_BUNDLE_LIMITS,
}) {
  const entry = requireEntry(manifest, entryKey, 'application entry')
  const initialKeys = collectStaticClosure(manifest, entryKey)
  const dynamicImports = new Set(entry.dynamicImports ?? [])

  for (const [group, key] of Object.entries(ROUTE_GROUP_ENTRIES)) {
    const groupEntry = requireEntry(manifest, key, `${group} route group`)
    if (!groupEntry.isDynamicEntry || !dynamicImports.has(key)) {
      throw new Error(`${group} route group must be a dynamic import from ${entryKey}`)
    }
    if (initialKeys.has(key)) {
      throw new Error(`${group} route group is in the initial static import closure`)
    }
  }

  const initial = measureFiles(manifest, initialKeys, outputDirectory)
  if (initial.minifiedBytes > limits.minifiedBytes) {
    throw new Error(`Initial JavaScript exceeds the ${limits.minifiedBytes}-byte minified limit (${initial.minifiedBytes} bytes)`)
  }
  if (initial.gzipBytes > limits.gzipBytes) {
    throw new Error(`Initial JavaScript exceeds the ${limits.gzipBytes}-byte gzip limit (${initial.gzipBytes} bytes)`)
  }

  const groups = Object.fromEntries(Object.entries(ROUTE_GROUP_ENTRIES).map(([group, key]) => {
    const keys = collectStaticClosure(manifest, key)
    return [group, { file: manifest[key].file, ...measureFiles(manifest, keys, outputDirectory) }]
  }))

  return { initial, groups, limits: { ...limits } }
}

function main() {
  const outputDirectory = resolve('dist')
  const manifestPath = resolve(outputDirectory, '.vite/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const report = verifyRouteChunks({ manifest, outputDirectory })

  console.log(`Public initial JavaScript: ${report.initial.minifiedBytes} bytes minified, ${report.initial.gzipBytes} bytes gzip`)
  for (const [group, bundle] of Object.entries(report.groups)) {
    console.log(`${group} route group: ${bundle.minifiedBytes} bytes minified, ${bundle.gzipBytes} bytes gzip`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

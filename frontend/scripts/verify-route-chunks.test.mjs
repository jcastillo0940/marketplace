import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { verifyRouteChunks } from './verify-route-chunks.mjs'

const groupEntries = [
  'src/routes/PublicRoutes.tsx',
  'src/routes/ProducerRoutes.tsx',
  'src/routes/AdminRoutes.tsx',
]

function createFixture({ indexImports = ['src/shared.ts'], indexDynamicImports = groupEntries, assets = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'marketplace-route-chunks-'))
  const files = {
    'assets/index.js': 'index-code',
    'assets/shared.js': 'shared-code',
    'assets/public.js': 'public-code',
    'assets/producer.js': 'producer-code',
    'assets/admin.js': 'admin-code',
    ...assets,
  }

  for (const [file, contents] of Object.entries(files)) {
    const destination = join(directory, file)
    mkdirSync(join(destination, '..'), { recursive: true })
    writeFileSync(destination, contents)
  }

  const manifest = {
    'index.html': { file: 'assets/index.js', isEntry: true, imports: indexImports, dynamicImports: indexDynamicImports },
    'src/shared.ts': { file: 'assets/shared.js' },
    'src/routes/PublicRoutes.tsx': { file: 'assets/public.js', isDynamicEntry: true, imports: [] },
    'src/routes/ProducerRoutes.tsx': { file: 'assets/producer.js', isDynamicEntry: true, imports: [] },
    'src/routes/AdminRoutes.tsx': { file: 'assets/admin.js', isDynamicEntry: true, imports: [] },
  }

  return { directory, manifest }
}

test('reports the initial static closure and all three deferred route groups', () => {
  const fixture = createFixture()
  try {
    const report = verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory })

    assert.equal(report.initial.minifiedBytes, Buffer.byteLength('index-codeshared-code'))
    assert.equal(report.groups.public.file, 'assets/public.js')
    assert.equal(report.groups.producer.file, 'assets/producer.js')
    assert.equal(report.groups.admin.file, 'assets/admin.js')
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects a public initial JavaScript closure above the minified-byte limit', () => {
  const largeIndex = 'x'.repeat(400_001)
  const fixture = createFixture({ assets: { 'assets/index.js': largeIndex } })
  try {
    assert.throws(
      () => verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory }),
      /400000-byte minified limit/,
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects a public initial JavaScript closure above the gzip-byte limit', () => {
  const noisyIndex = randomBytes(115_000)
  const fixture = createFixture({ assets: { 'assets/index.js': noisyIndex } })
  try {
    assert.throws(
      () => verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory }),
      /110000-byte gzip limit/,
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects a private route group pulled into the public static import closure', () => {
  const fixture = createFixture({ indexImports: ['src/shared.ts', 'src/routes/AdminRoutes.tsx'] })
  try {
    assert.throws(
      () => verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory }),
      /admin route group is in the initial static import closure/,
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects a missing public route group entry', () => {
  const fixture = createFixture()
  delete fixture.manifest[groupEntries[0]]
  try {
    assert.throws(
      () => verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory }),
      /Missing public route group manifest entry/,
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('rejects a route group missing from the entry dynamic imports', () => {
  const fixture = createFixture({ indexDynamicImports: groupEntries.slice(0, 2) })
  try {
    assert.throws(
      () => verifyRouteChunks({ manifest: fixture.manifest, outputDirectory: fixture.directory }),
      /admin route group must be a dynamic import/,
    )
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

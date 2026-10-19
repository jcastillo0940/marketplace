import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const specPath = fileURLToPath(new URL('../../docs/api/openapi.yaml', import.meta.url))
const source = readFileSync(specPath, 'utf8')

let spec
try {
  spec = parse(source)
} catch (error) {
  console.error(`OpenAPI YAML inválido: ${error.message}`)
  process.exit(1)
}

if (!spec || typeof spec !== 'object' || !/^3\.[01]\.\d+$/.test(spec.openapi ?? '')) {
  throw new Error('OpenAPI debe declarar una versión válida 3.0.x o 3.1.x.')
}

if (!spec.info?.title || !spec.info?.version || !spec.paths || typeof spec.paths !== 'object') {
  throw new Error('OpenAPI requiere info.title, info.version y paths.')
}

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'])
let operationCount = 0

for (const [path, pathItem] of Object.entries(spec.paths)) {
  if (!path.startsWith('/') || !pathItem || typeof pathItem !== 'object') {
    throw new Error(`Path OpenAPI inválido: ${path}`)
  }

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue
    if (!operation || typeof operation !== 'object' || !operation.responses || typeof operation.responses !== 'object') {
      throw new Error(`La operación ${method.toUpperCase()} ${path} requiere responses.`)
    }
    operationCount += 1
  }
}

if (operationCount === 0) throw new Error('OpenAPI no declara operaciones.')
console.log(`OpenAPI válido: ${operationCount} operaciones parseadas.`)

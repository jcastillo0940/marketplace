import { readFile } from 'node:fs/promises'

const designPath = process.argv.includes('--design') ? process.argv[process.argv.indexOf('--design') + 1] : new URL('../../DESIGN.md', import.meta.url)
const design = await readFile(designPath, 'utf8')
const tokens = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const colorsBlock = design.match(/^colors:\n((?:  [^\n]+\n)+)/m)?.[1]

if (!colorsBlock) {
  throw new Error('DESIGN.md must define concrete color tokens.')
}

const expected = [...colorsBlock.matchAll(/^  ([\w-]+): "(#[0-9a-fA-F]{6})"$/gm)]
if (expected.length < 6) {
  throw new Error('DESIGN.md must define at least six concrete semantic colors.')
}

const missing = expected.filter(([, name, value]) => {
  const variable = `--color-${name.replaceAll('_', '-')}`
  const declaration = new RegExp(`${variable}:\\s*${value}\\s*;`, 'i')
  return !declaration.test(tokens)
})

if (missing.length) {
  throw new Error(`Runtime CSS tokens differ from DESIGN.md: ${missing.map(([, name]) => name).join(', ')}`)
}

for (const [role, family] of [['display', 'Fraunces'], ['body', 'Atkinson Hyperlegible']]) {
  if (!design.includes(family)) throw new Error(`DESIGN.md must define the ${role} type role.`)
  if (!tokens.includes(family)) throw new Error(`Runtime CSS is missing the ${role} type family.`)
}

console.log(`Design tokens verified: ${expected.length} colors and 2 type roles.`)

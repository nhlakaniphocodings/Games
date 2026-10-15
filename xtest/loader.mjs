import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = 'file:///Users/mac/Documents/x-games-website-development/'

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

async function tryResolve(url, context, nextResolve) {
  const candidates = [url, url + '.ts', url + '.tsx', url + '/index.ts']
  for (const c of candidates) {
    try {
      const u = new URL(c)
      if (u.protocol === 'file:' && isFile(fileURLToPath(u))) {
        return { url: u.href, shortCircuit: true }
      }
    } catch {
      /* ignore */
    }
  }
  return nextResolve(url, context)
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return tryResolve(ROOT + specifier.slice(2), context, nextResolve)
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const url = new URL(specifier, context.parentURL).href
    return tryResolve(url, context, nextResolve)
  }
  return nextResolve(specifier, context)
}

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, CONFIG_FILE } from './paths.js'

export const DEFAULT_CONFIG = {
  defaultTheme: 'dark',
  maxFileBytes: 2097152,
  lineHeight: 20,
  tint: { added: 45, unchanged: 14, deleted: 40 },
  defaultScheme: 'amber',
  // Each scheme needs its own dark and light variant because a colour tuned
  // for a near-black surface is wrong on white.
  schemes: {
    amber: {
      dark: { added: '#d98a30', unchanged: '#2f6b4a', deleted: '#8a3030' },
      light: { added: '#b35c00', unchanged: '#1c6b3f', deleted: '#a11a1a' }
    },
    magenta: {
      dark: { added: '#ff2fd0', unchanged: '#2f6b6b', deleted: '#8a3030' },
      light: { added: '#b3008f', unchanged: '#1c6b6b', deleted: '#a11a1a' }
    },
    safe: {
      dark: { added: '#3b9dff', unchanged: '#6b6b2f', deleted: '#ff8c00' },
      light: { added: '#0b62b3', unchanged: '#5c5c1f', deleted: '#b35c00' }
    }
  },
  themes: {
    dark: {
      surface: '#1e1f29',
      text: '#f8f8f2',
      border: '#44475a',
      added: '#d98a30',
      unchanged: '#2f6b4a',
      deleted: '#8a3030'
    },
    light: {
      surface: '#ffffff',
      text: '#1e1f29',
      border: '#d0d2e0',
      added: '#b35c00',
      unchanged: '#1c6b3f',
      deleted: '#a11a1a'
    }
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A malformed hand-edit is the expected case here, not an exotic one: a bad
// key costs the user that one setting, never the whole file, and never a
// crash. Type-mismatched or unrecognised-shape values fall back to the
// default rather than propagating downstream.
function merge(defaults, override) {
  if (!isPlainObject(override)) {
    return structuredClone(defaults)
  }
  const result = { ...defaults }
  for (const [key, value] of Object.entries(override)) {
    const defaultValue = defaults[key]
    if (isPlainObject(defaultValue)) {
      result[key] = isPlainObject(value) ? merge(defaultValue, value) : structuredClone(defaultValue)
    } else if (key in defaults) {
      result[key] = typeof value === typeof defaultValue ? value : defaultValue
    } else {
      result[key] = value
    }
  }
  return result
}

export async function loadConfig() {
  const file = CONFIG_FILE()
  try {
    return structuredClone(merge(DEFAULT_CONFIG, JSON.parse(await readFile(file, 'utf8'))))
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        await mkdir(configDir(), { recursive: true })
        await writeFile(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`)
      } catch {
        // Being unable to persist the defaults is not a reason to refuse to start.
      }
    }
    return structuredClone(DEFAULT_CONFIG)
  }
}

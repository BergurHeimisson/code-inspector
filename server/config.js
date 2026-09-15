import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, CONFIG_FILE } from './paths.js'

export const DEFAULT_CONFIG = {
  defaultTheme: 'dark',
  maxFileBytes: 2097152,
  lineHeight: 20,
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

function merge(defaults, override) {
  if (override === null || typeof override !== 'object' || Array.isArray(override)) {
    return defaults
  }
  const result = { ...defaults }
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      typeof defaults[key] === 'object' && defaults[key] !== null
        ? merge(defaults[key], value)
        : value
  }
  return result
}

export async function loadConfig() {
  const file = CONFIG_FILE()
  try {
    return merge(DEFAULT_CONFIG, JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') {
      await mkdir(configDir(), { recursive: true })
      await writeFile(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`)
    }
    return DEFAULT_CONFIG
  }
}

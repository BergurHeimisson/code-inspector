const TOKENS = ['surface', 'text', 'border', 'added', 'unchanged', 'deleted']

export function applyTheme(tokens, root = document.documentElement) {
  for (const name of TOKENS) {
    if (tokens?.[name]) root.style.setProperty(`--color-${name}`, tokens[name])
  }
}

export function resolveTheme(config, state) {
  return state?.theme ?? config?.defaultTheme ?? 'dark'
}

const TOKENS = ['surface', 'text', 'border', 'added', 'unchanged', 'deleted']

export function applyTheme(tokens, theme, root = document.documentElement) {
  for (const name of TOKENS) {
    if (tokens?.[name]) root.style.setProperty(`--color-${name}`, tokens[name])
  }
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function resolveTheme(config, state) {
  return state?.theme ?? config?.defaultTheme ?? 'dark'
}

export function resolveScheme(config, state) {
  const schemes = config?.schemes ?? {}
  const fallback = schemes[config?.defaultScheme] ? config.defaultScheme : 'amber'
  const requested = state?.scheme
  return requested && schemes[requested] ? requested : fallback
}

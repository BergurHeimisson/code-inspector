export function rangeToParam(range) {
  switch (range?.mode) {
    case 'worktree':
      return 'worktree'
    case 'commits':
      return `commits:${range.n}`
    case 'ref':
      return `ref:${range.ref}`
    default:
      return 'auto'
  }
}

async function request(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

const query = (params) => new URLSearchParams(params).toString()

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

export const api = {
  initial: () => request('/api/initial'),
  project: (path, range) =>
    request(`/api/project?${query({ path, range: rangeToParam(range) })}`),
  changes: (path, range) =>
    request(`/api/changes?${query({ path, range: rangeToParam(range) })}`),
  file: (path, file, range) =>
    request(`/api/file?${query({ path, file, range: rangeToParam(range) })}`),
  fsList: (path) => request(`/api/fs/list?${query({ path })}`),
  config: () => request('/api/config'),
  state: () => request('/api/state'),
  saveState: (patch) => request('/api/state', json('PUT', patch)),
  rememberProject: (path) => request('/api/state/project', json('POST', { path }))
}

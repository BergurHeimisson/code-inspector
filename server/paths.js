import { homedir } from 'node:os'
import { join } from 'node:path'

export function configDir() {
  return process.env.CODE_INSPECTOR_CONFIG_DIR ?? join(homedir(), '.config', 'code-inspector')
}

export const CONFIG_FILE = () => join(configDir(), 'config.json')
export const STATE_FILE = () => join(configDir(), 'state.json')

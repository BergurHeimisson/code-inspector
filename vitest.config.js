import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.js', 'tests/**/*.test.js'],
          testTimeout: 20000
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['web/**/*.test.{js,jsx}'],
          setupFiles: ['./web/src/setupTests.js']
        }
      }
    ]
  }
})

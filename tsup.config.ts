import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  onSuccess: async () => {
    const { promises: fs } = await import('node:fs')
    const path = 'dist/cli.js'
    try {
      const src = await fs.readFile(path, 'utf8')
      if (!src.startsWith('#!')) {
        await fs.writeFile(path, `#!/usr/bin/env node\n${src}`, 'utf8')
      }
      await fs.chmod(path, 0o755)
    } catch {
      // dist/cli.js may not exist on partial builds, skip silently
    }
  },
})

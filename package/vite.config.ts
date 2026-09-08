import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [dts({ rollupTypes: true })],
    build: {
        sourcemap: false,
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: ['three'],
        },
    },
});

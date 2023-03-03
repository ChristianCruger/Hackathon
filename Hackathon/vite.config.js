import { defineConfig } from 'vite';
// import tsconfigPaths from 'vite-tsconfig-paths';
// vite.config.js
export default defineConfig(() => ({
	server: {
		port: 5000,
	},

	build: {
		brotliSize: false,
		manifest: false,
		minify: 'terser',
		terserOptions: {
			mangle: {
				// mangle options
				// properties: {
				// 	// mangle property options
				// },
				reserved: ['analyse', 'results', 'emissions'],
				module: false,
			},
		},
	},
}));

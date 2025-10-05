import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';
const target = process.env.TARGET || 'node';

const baseConfig = {
  input: 'src/halo-tool.ts',
  plugins: [
    resolve({
      preferBuiltins: target === 'node',
      browser: target === 'browser',
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      module: target === 'browser' ? 'esnext' : 'commonjs',
      target: target === 'browser' ? 'es2015' : 'es5',
    }),
    ...(isProduction ? [terser()] : []),
  ],
  external:
    target === 'node'
      ? [
          'axios',
          'jsonpath-plus',
          'ajv',
          'ajv-formats',
          'jsonata',
          'lodash',
          'eventemitter3',
          'p-queue',
          'node-cache',
          'crypto',
          'fs',
          'path',
        ]
      : [],
};

const configs = [];

if (target === 'node') {
  // Node.js builds
  configs.push(
    // CommonJS
    {
      ...baseConfig,
      output: {
        file: 'dist/halo-tool.js',
        format: 'cjs',
        exports: 'auto',
      },
    },
    // ES Module
    {
      ...baseConfig,
      output: {
        file: 'dist/halo-tool.esm.js',
        format: 'es',
      },
    }
  );
} else if (target === 'browser') {
  // Browser builds
  configs.push(
    // UMD for browser
    {
      ...baseConfig,
      input: 'src/browser-standalone.ts',
      plugins: [
        resolve({
          browser: true,
          preferBuiltins: false,
        }),
        commonjs(),
        json(),
        typescript({
          tsconfig: './tsconfig.json',
          declaration: true,
          declarationDir: 'dist',
          module: 'esnext',
          target: 'es2015',
        }),
        ...(isProduction ? [terser()] : []),
      ],
      output: {
        file: 'dist/halo-tool.browser.js',
        format: 'umd',
        name: 'HaloTool',
        exports: 'default',
        globals: {
          axios: 'axios',
        },
      },
      external: ['axios', 'fs', 'path', 'crypto'], // Exclude Node.js modules
    },
    // ES Module for modern browsers
    {
      ...baseConfig,
      input: 'src/browser-standalone.ts',
      plugins: [
        resolve({
          browser: true,
          preferBuiltins: false,
        }),
        commonjs(),
        json(),
        typescript({
          tsconfig: './tsconfig.json',
          declaration: true,
          declarationDir: 'dist',
          module: 'esnext',
          target: 'es2015',
        }),
        ...(isProduction ? [terser()] : []),
      ],
      output: {
        file: 'dist/halo-tool.browser.esm.js',
        format: 'es',
      },
      external: ['axios', 'fs', 'path', 'crypto'],
    }
  );
}

export default configs;

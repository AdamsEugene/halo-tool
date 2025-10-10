import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

const baseConfig = {
  input: 'src/state/HaloStatePlugin.browser.ts',
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
      declarationDir: 'dist/state',
      module: 'esnext',
      target: 'es2015',
    }),
    ...(isProduction ? [terser()] : []),
  ],
  external: [], // No external dependencies for browser build
};

export default [
  // UMD for browser (self-contained)
  {
    ...baseConfig,
    output: {
      file: 'dist/state/halo-state-plugin.browser.js',
      format: 'umd',
      name: 'HaloStatePlugin',
      exports: 'named',
      globals: {},
    },
  },
  // ES Module for modern browsers
  {
    ...baseConfig,
    output: {
      file: 'dist/state/halo-state-plugin.browser.esm.js',
      format: 'es',
    },
  },
  // Node.js version
  {
    ...baseConfig,
    input: 'src/state/HaloStatePlugin.ts',
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      json(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist/state',
        module: 'commonjs',
        target: 'es5',
      }),
      ...(isProduction ? [terser()] : []),
    ],
    external: ['eventemitter3'], // External dependencies for Node version
    output: [
      // CommonJS
      {
        file: 'dist/state/halo-state-plugin.js',
        format: 'cjs',
        exports: 'named',
      },
      // ES Module
      {
        file: 'dist/state/halo-state-plugin.esm.js',
        format: 'es',
      },
    ],
  },
];

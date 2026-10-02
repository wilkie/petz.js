/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*_test.ts'],

  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2022',
          transform: { useDefineForClassFields: true },
        },
      },
    ],
  },

  /* Sources import each other with explicit `.js` specifiers (the TypeScript
   * convention that survives bundling). Jest resolves against the real files,
   * so drop the extension and let it find the `.ts`.
   */
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  restoreMocks: true,
};

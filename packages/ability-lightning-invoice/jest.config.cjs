module.exports = {
  displayName: '@hlv/ability-lightning-invoice',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  setupFilesAfterEnv: ['./jest.setup.cjs'],
  detectOpenHandles: true,
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
};

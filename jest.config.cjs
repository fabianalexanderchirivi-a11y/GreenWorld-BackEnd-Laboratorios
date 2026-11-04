module.exports = {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
  coverageDirectory: 'reports/coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  collectCoverageFrom: [
    'src/controller/UsersController.js',
    'src/controller/CertificadoController.js',
    'src/middleware/authMiddleware.js',
  ],
}

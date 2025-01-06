import type {Config} from 'jest';

const config: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  preset: 'ts-jest', 
  runner: 'jest-serial-runner',
  testEnvironment: "jest-environment-node",
};

export default config;
/**
 * Integration test configuration
 */

export const INTEGRATION_CONFIG = {
  // ccproxy endpoint
  apiBaseUrl: process.env.ANTHROPIC_BASE_URL || 'http://localhost:4000',

  // Model configuration
  userAgentModel: 'claude-sonnet-4-20250514',
  judgeModel: 'claude-opus-4-20250514',

  // Timeouts
  sessionTimeout: 60000,  // 1 minute per session
  testTimeout: 120000,    // 2 minutes per test

  // Limits for testing
  testLimits: {
    maxConsecutiveFailures: 3,
    maxTotalAttempts: 5,
    noProgressThreshold: 2,
  },
};

/**
 * Check if ccproxy is available
 */
export async function isCCProxyAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATION_CONFIG.apiBaseUrl}/health`);
    const data = await response.json();
    return data.status === 'pass' || data.status === 'warn';
  } catch {
    return false;
  }
}

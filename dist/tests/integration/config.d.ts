/**
 * Integration test configuration
 */
export declare const INTEGRATION_CONFIG: {
    apiBaseUrl: string;
    userAgentModel: string;
    judgeModel: string;
    sessionTimeout: number;
    testTimeout: number;
    testLimits: {
        maxConsecutiveFailures: number;
        maxTotalAttempts: number;
        noProgressThreshold: number;
    };
};
/**
 * Check if ccproxy is available
 */
export declare function isCCProxyAvailable(): Promise<boolean>;
//# sourceMappingURL=config.d.ts.map
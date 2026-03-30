/**
 * Trade Verifier - Compare bot results with IQ Option server
 * 
 * Purpose:
 * - Verify 100% accuracy of trade tracking
 * - Detect mismatches between bot and IQ Option
 * - Log discrepancies for debugging
 */

const fs = require('fs');
const path = require('path');

class TradeVerifier {
    constructor() {
        this.verificationLog = [];
        this.mismatches = [];
        this.logFile = 'logs/trade_verification.json';
        this.mismatchFile = 'logs/trade_mismatches.json';
        
        // Ensure logs directory exists
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
    }

    /**
     * Verify a single trade result
     */
    verifyTrade(orderId, botResult, expectedResult) {
        const verification = {
            timestamp: new Date().toISOString(),
            orderId: orderId,
            botResult: botResult,      // What bot recorded
            expectedResult: expectedResult,  // What IQ Option sent
            match: botResult === expectedResult,
            checkedAt: Date.now()
        };

        this.verificationLog.push(verification);

        if (!verification.match) {
            this.mismatches.push(verification);
            console.error('\n' + '❌'.repeat(50));
            console.error('❌ MISMATCH DETECTED!');
            console.error(`❌ Order ID: ${orderId}`);
            console.error(`❌ Bot Result: ${botResult}`);
            console.error(`❌ Expected: ${expectedResult}`);
            console.error('❌'.repeat(50) + '\n');
            
            // Save immediately on mismatch
            this.saveMismatch(verification);
        } else {
            console.log(`✅ VERIFIED: ${orderId} | ${botResult} ✓`);
        }

        return verification.match;
    }

    /**
     * Verify order map integrity
     */
    verifyOrderMapIntegrity(orders, pendingResults) {
        const now = Date.now();
        const issues = [];

        for (const [id, order] of orders) {
            // Check for lost results (open > 2 minutes)
            if (order.status === 'OPEN') {
                const elapsed = now - order.timestamp;
                if (elapsed > 120000) {
                    const issue = {
                        type: 'LOST_RESULT',
                        orderId: id,
                        elapsedMs: elapsed,
                        timestamp: new Date().toISOString()
                    };
                    issues.push(issue);
                    console.error(`❌ LOST RESULT: ${id} - Open for ${(elapsed/1000).toFixed(0)}s`);
                }
            }

            // Check for result without status update
            if (order.result && order.status !== 'CLOSED') {
                const issue = {
                    type: 'STATUS_MISMATCH',
                    orderId: id,
                    status: order.status,
                    result: order.result,
                    timestamp: new Date().toISOString()
                };
                issues.push(issue);
                console.error(`❌ STATUS MISMATCH: ${id} - Result exists but status is ${order.status}`);
            }

            // Check for closed without result
            if (order.status === 'CLOSED' && !order.result) {
                const issue = {
                    type: 'MISSING_RESULT',
                    orderId: id,
                    timestamp: new Date().toISOString()
                };
                issues.push(issue);
                console.error(`❌ MISSING RESULT: ${id} - Closed but no result`);
            }
        }

        // Check pending results consistency
        for (const orderId of pendingResults) {
            if (!orders.has(orderId)) {
                const issue = {
                    type: 'ORPHAN_PENDING',
                    orderId: orderId,
                    timestamp: new Date().toISOString()
                };
                issues.push(issue);
                console.error(`❌ ORPHAN PENDING: ${orderId} - In pending but not in orders`);
            }
        }

        const integrity = {
            timestamp: new Date().toISOString(),
            totalOrders: orders.size,
            pendingCount: pendingResults.size,
            issues: issues,
            healthy: issues.length === 0
        };

        if (integrity.healthy) {
            console.log(`✅ ORDER MAP INTEGRITY: ${orders.size} orders, ${pendingResults.size} pending - HEALTHY`);
        } else {
            console.error(`⚠️ ORDER MAP INTEGRITY: ${issues.length} issues found`);
        }

        return integrity;
    }

    /**
     * Compare bot summary with expected
     */
    compareSummary(botSummary, expectedSummary) {
        const comparison = {
            timestamp: new Date().toISOString(),
            totalTrades: {
                bot: botSummary.total,
                expected: expectedSummary.total,
                match: botSummary.total === expectedSummary.total
            },
            wins: {
                bot: botSummary.wins,
                expected: expectedSummary.wins,
                match: botSummary.wins === expectedSummary.wins
            },
            losses: {
                bot: botSummary.losses,
                expected: expectedSummary.losses,
                match: botSummary.losses === expectedSummary.losses
            },
            profit: {
                bot: botSummary.totalProfit,
                expected: expectedSummary.totalProfit,
                match: Math.abs(parseFloat(botSummary.totalProfit) - parseFloat(expectedSummary.totalProfit)) < 0.01
            }
        };

        const allMatch = comparison.totalTrades.match && 
                         comparison.wins.match && 
                         comparison.losses.match && 
                         comparison.profit.match;

        comparison.allMatch = allMatch;

        if (allMatch) {
            console.log('✅ SUMMARY VERIFICATION: ALL MATCH');
        } else {
            console.error('❌ SUMMARY MISMATCH:');
            if (!comparison.totalTrades.match) console.error(`  Trades: Bot=${botSummary.total}, IQ=${expectedSummary.total}`);
            if (!comparison.wins.match) console.error(`  Wins: Bot=${botSummary.wins}, IQ=${expectedSummary.wins}`);
            if (!comparison.losses.match) console.error(`  Losses: Bot=${botSummary.losses}, IQ=${expectedSummary.losses}`);
            if (!comparison.profit.match) console.error(`  Profit: Bot=${botSummary.totalProfit}, IQ=${expectedSummary.totalProfit}`);
        }

        this.saveComparison(comparison);
        return comparison;
    }

    /**
     * Save mismatch to file
     */
    saveMismatch(mismatch) {
        let mismatches = [];
        if (fs.existsSync(this.mismatchFile)) {
            mismatches = JSON.parse(fs.readFileSync(this.mismatchFile, 'utf8'));
        }
        mismatches.push(mismatch);
        fs.writeFileSync(this.mismatchFile, JSON.stringify(mismatches, null, 2));
    }

    /**
     * Save comparison to file
     */
    saveComparison(comparison) {
        let comparisons = [];
        if (fs.existsSync(this.logFile)) {
            comparisons = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        }
        comparisons.push(comparison);
        fs.writeFileSync(this.logFile, JSON.stringify(comparisons, null, 2));
    }

    /**
     * Generate verification report
     */
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalVerified: this.verificationLog.length,
            mismatches: this.mismatches.length,
            accuracy: this.verificationLog.length > 0 
                ? ((this.verificationLog.length - this.mismatches.length) / this.verificationLog.length * 100).toFixed(2)
                : '0.00',
            recentMismatches: this.mismatches.slice(-10)
        };

        console.log('\n' + '='.repeat(60));
        console.log('TRADE VERIFICATION REPORT');
        console.log('='.repeat(60));
        console.log(`Total Verified: ${report.totalVerified}`);
        console.log(`Mismatches: ${report.mismatches}`);
        console.log(`Accuracy: ${report.accuracy}%`);
        console.log('='.repeat(60) + '\n');

        // Save report
        fs.writeFileSync('logs/verification_report.json', JSON.stringify(report, null, 2));
        return report;
    }

    /**
     * Debug print all orders
     */
    debugOrders(orders) {
        console.log('\n📋 TRADE VERIFIER - ORDER MAP:');
        console.log('='.repeat(70));
        
        for (const [id, order] of orders) {
            const status = order.status || 'UNKNOWN';
            const result = order.result || 'N/A';
            const profit = order.profit !== undefined ? `$${order.profit}` : 'N/A';
            const timestamp = order.timestamp ? new Date(order.timestamp).toLocaleTimeString() : 'N/A';
            
            console.log(`ID: ${id} | ${status} | ${result} | ${profit} | ${timestamp}`);
        }
        
        console.log('='.repeat(70));
        console.log(`Total: ${orders.size} orders`);
        console.log('');
    }
}

module.exports = TradeVerifier;

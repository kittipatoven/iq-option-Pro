/**
 * Continuous Optimization Loop Runner
 * ระบบรัน optimize ต่อเนื่องแบบอัตโนมัติ
 * 
 * Usage: node continuousOptimize.js
 */

const fs = require('fs');
const { execSync } = require('child_process');

class ContinuousOptimizer {
    constructor() {
        this.loopCount = 0;
        this.maxLoops = 10;
        this.targetWinRate = 55;
        this.results = [];
    }

    async run() {
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║     🔥 CONTINUOUS OPTIMIZATION LOOP STARTED                  ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        while (this.loopCount < this.maxLoops) {
            this.loopCount++;
            
            console.log(`\n🔁 LOOP ${this.loopCount}/${this.maxLoops}`);
            console.log('═══════════════════════════════════════════════════════════\n');

            // Step 1: Run validation
            const validation = await this.runValidation();
            
            // Step 2: Check if targets met
            if (validation.passed) {
                console.log('\n✅ TARGETS MET! System is optimized.');
                break;
            }

            // Step 3: Auto-fix issues
            if (validation.issues.length > 0) {
                await this.applyFixes(validation.issues);
            }

            // Step 4: Wait before next iteration
            console.log('\n⏱️ Waiting 30 seconds before next iteration...');
            await this.sleep(30000);
        }

        return this.generateFinalReport();
    }

    async runValidation() {
        console.log('📊 Running validation...');
        
        try {
            // Run the production validator
            execSync('node productionValidator.js', { stdio: 'inherit' });
            
            // Read results
            const report = JSON.parse(fs.readFileSync('./analytics/validation_report.json', 'utf8'));
            
            this.results.push({
                loop: this.loopCount,
                winRate: report.metrics.winRate,
                status: report.status,
                issues: report.issues.length
            });

            return {
                passed: report.status === 'PASS',
                issues: report.issues,
                metrics: report.metrics
            };
        } catch (error) {
            console.log('⚠️ Validation command failed:', error.message);
            return { passed: false, issues: [{ type: 'validation_error' }], metrics: {} };
        }
    }

    async applyFixes(issues) {
        console.log('\n🔧 Applying fixes...');
        
        for (const issue of issues) {
            console.log(`  Fixing: ${issue.type}`);
            
            switch (issue.type) {
                case 'low_winrate':
                    this.adjustSniperThreshold(1);
                    break;
                case 'high_loss_streak':
                    this.reduceMaxLosses();
                    break;
                case 'rsi_not_extreme':
                    this.tightenRSI();
                    break;
            }
        }
    }

    adjustSniperThreshold(increase) {
        const botPath = './src/core/bot.js';
        let content = fs.readFileSync(botPath, 'utf8');
        
        // Find and adjust minThreshold
        const match = content.match(/minThreshold:\s*(\d+)/);
        if (match) {
            const current = parseInt(match[1]);
            const newValue = Math.min(current + increase, 9);
            content = content.replace(/minThreshold:\s*\d+/, `minThreshold: ${newValue}`);
            fs.writeFileSync(botPath, content);
            console.log(`    ✅ Increased sniper threshold: ${current} → ${newValue}`);
        }
    }

    reduceMaxLosses() {
        const botPath = './src/core/bot.js';
        let content = fs.readFileSync(botPath, 'utf8');
        
        const match = content.match(/maxConsecutiveLosses:\s*(\d+)/);
        if (match) {
            const current = parseInt(match[1]);
            if (current > 2) {
                const newValue = current - 1;
                content = content.replace(/maxConsecutiveLosses:\s*\d+/, `maxConsecutiveLosses: ${newValue}`);
                fs.writeFileSync(botPath, content);
                console.log(`    ✅ Reduced max consecutive losses: ${current} → ${newValue}`);
            }
        }
    }

    tightenRSI() {
        const botPath = './src/core/bot.js';
        let content = fs.readFileSync(botPath, 'utf8');
        
        // Tighten RSI thresholds
        content = content.replace(/callMax:\s*25/, 'callMax: 20');
        content = content.replace(/putMin:\s*75/, 'putMin: 80');
        fs.writeFileSync(botPath, content);
        console.log('    ✅ Tightened RSI thresholds: 25/75 → 20/80');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateFinalReport() {
        const report = {
            totalLoops: this.loopCount,
            results: this.results,
            timestamp: new Date().toISOString(),
            status: this.results.some(r => r.status === 'PASS') ? 'OPTIMIZED' : 'NEEDS_WORK'
        };

        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║              🎯 OPTIMIZATION COMPLETE                        ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log(`\nTotal Loops: ${report.totalLoops}`);
        console.log(`Final Status: ${report.status}`);
        console.log('\nLoop History:');
        this.results.forEach(r => {
            console.log(`  Loop ${r.loop}: WinRate=${r.winRate}% | ${r.status} | Issues=${r.issues}`);
        });
        console.log('═══════════════════════════════════════════════════════════════\n');

        return report;
    }
}

// Run if called directly
if (require.main === module) {
    const optimizer = new ContinuousOptimizer();
    optimizer.run().catch(error => {
        console.error('❌ Continuous optimization failed:', error);
        process.exit(1);
    });
}

module.exports = ContinuousOptimizer;

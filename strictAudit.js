const logger = require('./src/utils/logger');
const fs = require('fs');
const path = require('path');

class StrictRealModeAuditor {
    constructor() {
        this.issues = [];
        this.mockPatterns = [
            'createMockAPI',
            'getMockEconomicCalendar', 
            'getMockForexNews',
            'mockOrders',
            'order_1000',
            'order_####',
            'fallback.*mock',
            'mock.*fallback',
            'generateMockCandles',
            'demo_key',
            'your_email@example.com',
            'your_password'
        ];
    }

    async auditStrictRealMode() {
        console.log('🔍 STRICT REAL MODE AUDIT');
        console.log('==========================\n');
        
        // Check 1: Source files for mock code
        await this.checkSourceFiles();
        
        // Check 2: Environment configuration
        await this.checkEnvironmentConfig();
        
        // Check 3: Runtime test
        await this.testRuntimeRealMode();
        
        // Generate report
        this.generateReport();
    }

    async checkSourceFiles() {
        console.log('📁 Checking Source Files for Mock Code...');
        
        const filesToCheck = [
            'src/api/iqoption.js',
            'src/core/execution.js',
            'src/filters/newsFilter.js',
            'src/core/bot.js'
        ];
        
        for (const file of filesToCheck) {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                for (const pattern of this.mockPatterns) {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(content)) {
                        this.issues.push({
                            type: 'MOCK_CODE',
                            file: file,
                            pattern: pattern,
                            severity: 'CRITICAL'
                        });
                    }
                }
            }
        }
        
        console.log(`   Found ${this.issues.filter(i => i.type === 'MOCK_CODE').length} mock code references\n`);
    }

    async checkEnvironmentConfig() {
        console.log('📋 Checking Environment Configuration...');
        
        require('dotenv').config();
        
        const checks = [
            { key: 'IQ_EMAIL', placeholder: 'your_email@example.com' },
            { key: 'IQ_PASSWORD', placeholder: 'your_password' },
            { key: 'NEWS_API_KEY', placeholder: 'demo_key' }
        ];
        
        for (const check of checks) {
            const value = process.env[check.key];
            if (!value || value.includes(check.placeholder) || value.includes('demo')) {
                this.issues.push({
                    type: 'CONFIG',
                    key: check.key,
                    value: value,
                    severity: 'CRITICAL'
                });
            }
        }
        
        console.log(`   Found ${this.issues.filter(i => i.type === 'CONFIG').length} config issues\n`);
    }

    async testRuntimeRealMode() {
        console.log('🌐 Testing Runtime Real Mode...');
        
        try {
            // Test IQ Option API
            const iqoptionAPI = require('./src/api/iqoption');
            
            // Check if createMockAPI still exists
            if (typeof iqoptionAPI.createMockAPI === 'function') {
                this.issues.push({
                    type: 'RUNTIME',
                    component: 'IQOptionAPI',
                    issue: 'createMockAPI method still exists',
                    severity: 'CRITICAL'
                });
            }
            
            // Test News Filter
            const newsFilter = require('./src/filters/newsFilter');
            
            // Check if mock methods still exist
            if (typeof newsFilter.getMockEconomicCalendar === 'function') {
                this.issues.push({
                    type: 'RUNTIME',
                    component: 'NewsFilter',
                    issue: 'getMockEconomicCalendar method still exists',
                    severity: 'CRITICAL'
                });
            }
            
            if (typeof newsFilter.getMockForexNews === 'function') {
                this.issues.push({
                    type: 'RUNTIME',
                    component: 'NewsFilter',
                    issue: 'getMockForexNews method still exists',
                    severity: 'CRITICAL'
                });
            }
            
        } catch (error) {
            this.issues.push({
                type: 'RUNTIME',
                error: error.message,
                severity: 'WARNING'
            });
        }
        
        console.log(`   Found ${this.issues.filter(i => i.type === 'RUNTIME').length} runtime issues\n`);
    }

    generateReport() {
        console.log('=== AUDIT REPORT ===\n');
        
        const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL');
        const warnings = this.issues.filter(i => i.severity === 'WARNING');
        
        console.log(`Critical Issues: ${criticalIssues.length}`);
        console.log(`Warnings: ${warnings.length}`);
        console.log(`Total Issues: ${this.issues.length}\n`);
        
        if (criticalIssues.length > 0) {
            console.log('❌ CRITICAL ISSUES (MUST FIX):');
            criticalIssues.forEach((issue, index) => {
                console.log(`${index + 1}. [${issue.type}] ${issue.file || issue.component || issue.key}`);
                if (issue.pattern) console.log(`   Pattern: ${issue.pattern}`);
                if (issue.issue) console.log(`   Issue: ${issue.issue}`);
                if (issue.value) console.log(`   Current Value: ${issue.value}`);
            });
            console.log('');
        }
        
        const isRealMode = criticalIssues.length === 0;
        
        console.log('🎯 SYSTEM STATUS:');
        console.log(isRealMode ? '✅ REAL MODE' : '❌ NOT REAL MODE - MOCK CODE DETECTED');
        
        console.log('\n=== REQUIRED ACTIONS ===');
        
        if (!isRealMode) {
            console.log('🔧 TO ACHIEVE REAL MODE:');
            console.log('');
            console.log('1. Remove Mock Functions from iqoption.js:');
            console.log('   - Delete createMockAPI() method');
            console.log('   - Delete generateMockCandles() method');
            console.log('');
            console.log('2. Remove Mock Functions from newsFilter.js:');
            console.log('   - Delete getMockEconomicCalendar() method');
            console.log('   - Delete getMockForexNews() method');
            console.log('');
            console.log('3. Update .env with Real Credentials:');
            console.log('   - IQ_EMAIL=your_real_email');
            console.log('   - IQ_PASSWORD=your_real_password');
            console.log('   - NEWS_API_KEY=real_api_key');
            console.log('');
        } else {
            console.log('✅ System is clean - no mock code detected');
            console.log('✅ Ready for real trading');
        }
    }
}

// Run audit
if (require.main === module) {
    const auditor = new StrictRealModeAuditor();
    auditor.auditStrictRealMode().catch(console.error);
}

module.exports = StrictRealModeAuditor;

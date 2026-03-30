const inquirer = require('inquirer');
const logger = require('./logger');

/**
 * CLI Input Handler using Inquirer
 * Provides interactive prompts for user credentials
 */
class CLIInput {
    constructor() {
        this.name = 'CLIInput';
    }

    /**
     * Get all user credentials via interactive prompts
     * @returns {Promise<Object>} User credentials
     */
    async getUserCredentials() {
        console.log('\n� IQ OPTION TRADING BOT - LOGIN');
        console.log('================================\n');

        const questions = [
            {
                type: 'input',
                name: 'email',
                message: '📧 Enter IQ Option Email:',
                validate: (input) => {
                    if (!input || input.trim() === '') {
                        return '❌ Email is required';
                    }
                    if (!input.includes('@')) {
                        return '❌ Please enter a valid email';
                    }
                    return true;
                }
            },
            {
                type: 'password',
                name: 'password',
                message: '🔐 Enter IQ Option Password:',
                mask: '*',
                validate: (input) => {
                    if (!input || input.trim() === '') {
                        return '❌ Password is required';
                    }
                    return true;
                }
            },
            {
                type: 'list',
                name: 'accountType',
                message: '💰 Select Account Type:',
                choices: [
                    { name: '📘 PRACTICE (Demo)', value: 'PRACTICE' },
                    { name: '💵 REAL (Live Trading)', value: 'REAL' }
                ],
                default: 'PRACTICE'
            }
        ];

        try {
            const answers = await inquirer.prompt(questions);
            
            // Log only email for security
            logger.info('User credentials received', { 
                email: answers.email,
                accountType: answers.accountType,
                hasPassword: true 
            });

            return {
                email: answers.email.trim(),
                password: answers.password,
                accountType: answers.accountType
            };
        } catch (error) {
            logger.error('Failed to get user credentials', error);
            throw error;
        }
    }

    /**
     * Close method (for compatibility)
     */
    close() {
        // Inquirer handles cleanup automatically
    }
}

module.exports = new CLIInput();

#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';

const ENV_FILE = '.env';
const ENC_FILE = '.env.enc';

if (!fs.existsSync(ENV_FILE)) {
    console.error('❌ .env not found.');
    process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const password = await new Promise((resolve) => {
    rl.question('🔐 Enter password to encrypt: ', resolve);
});
rl.close();
execSync(`openssl enc -aes-256-cbc -salt -in ${ENV_FILE} -out ${ENC_FILE} -pbkdf2 -pass pass:${password}`, { stdio: 'inherit' });
console.log('✅ .env.enc updated.');

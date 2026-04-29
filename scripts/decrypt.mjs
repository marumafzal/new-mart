#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';

const ENC_FILE = '.env.enc';
const ENV_FILE = '.env';

if (fs.existsSync(ENV_FILE)) {
    console.log('✅ .env already exists. Skipping decryption.');
    process.exit(0);
}
if (!fs.existsSync(ENC_FILE)) {
    console.error('❌ .env.enc not found.');
    process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const password = await new Promise((resolve) => {
    rl.question('🔐 Enter decryption password: ', resolve);
});
rl.close();
try {
    execSync(`openssl enc -d -aes-256-cbc -in ${ENC_FILE} -out ${ENV_FILE} -pbkdf2 -pass pass:${password}`, { stdio: 'inherit' });
    console.log('✅ .env file created.');
} catch {
    console.error('❌ Wrong password.');
    process.exit(1);
}

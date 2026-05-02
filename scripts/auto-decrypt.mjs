#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const ENC_FILE = '.env.enc';
const ENV_FILE = '.env';

if (fs.existsSync(ENV_FILE)) {
    console.log('[auto-decrypt] .env already exists. Skipping decryption.');
    process.exit(0);
}
if (!fs.existsSync(ENC_FILE)) {
    console.log('[auto-decrypt] .env.enc not found. Skipping decryption.');
    process.exit(0);
}
try {
    execSync(`openssl enc -d -aes-256-cbc -in ${ENC_FILE} -out ${ENV_FILE} -pbkdf2 -pass pass:Khan@123.com`, { stdio: 'inherit' });
    console.log('[auto-decrypt] .env file created.');
} catch {
    console.log('[auto-decrypt] Decryption failed (non-fatal). Env vars from Replit userenv will be used.');
}

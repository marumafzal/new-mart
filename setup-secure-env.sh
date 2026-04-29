#!/bin/bash

# -----------------------------
# Secure Environment Setup Script
# Password: Khan@123.com
# -----------------------------

set -e  # Stop on error

echo "🔐 Setting up encrypted environment..."

# Step 1: Create .env file with your values
cat > .env << 'ENVEOF'
PORT=4000
JWT_SECRET="PUkuIh+8NSn80k68j1sAR1zPGtK7xryE8LTbaM6hGA2jA2fHq1MJuyud4YYtSMtB"
SESSION_SECRET="sWH0FeNDlxqogPWobX4Lej26LYSoBcReVNaBIJsO++o5CsF7Wruf2lUCGK4mCCz/jGXCysiMN6Fof1a16hl5xQ=="
DATABASE_URL="postgresql://neondb_owner:npg_5VFzHmZ6NTWn@ep-solitary-credit-a188hgj0-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
GEMINI_API_KEY="AIzaSyDdujmMRDG4_z0z8zG908_f4jNHACg9EHk"
VAPID_PUBLIC_KEY="BNdOE8h9Xk9JZv5XQz7R6T2V4W8Y1Z3X7R6T2V4W8Y1Z3X7R6T2V4W8Y1Z3X7R6T2V4W8Y1Z3X7..."
VAPID_PRIVATE_KEY="b3egnGyDJYSVsOB4z-PGhf5YbGeuVKcHtNpJPQ-r-eM"
ENVEOF

echo "✅ .env file created."

# Step 2: Encrypt it with password: Khan@123.com
openssl enc -aes-256-cbc -salt -in .env -out .env.enc -pbkdf2 -pass pass:'Khan@123.com'
echo "✅ .env.enc created (encrypted)."

# Step 3: Ensure scripts directory exists
mkdir -p scripts

# Step 4: Create decrypt script
cat > scripts/decrypt.mjs << 'DECEOF'
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
DECEOF

# Step 5: Create encrypt script
cat > scripts/encrypt.mjs << 'ENCEEOF'
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
ENCEEOF

chmod +x scripts/decrypt.mjs scripts/encrypt.mjs
echo "✅ Decrypt/encrypt scripts created."

# Step 6: Update package.json scripts (if possible)
if [ -f package.json ]; then
    # Backup first
    cp package.json package.json.backup
    # Add scripts using jq if available, else manual sed
    if command -v jq &> /dev/null; then
        jq '.scripts.env = "node scripts/decrypt.mjs" | .scripts["env:encrypt"] = "node scripts/encrypt.mjs" | .scripts["codespace-start"] = "pnpm run env && node scripts/launchers/start.mjs codespace"' package.json > package.json.tmp
        mv package.json.tmp package.json
    else
        # Simple sed (less robust but works)
        if ! grep -q '"env":' package.json; then
            sed -i.bak 's/"scripts": {/& "env": "node scripts\/decrypt.mjs", "env:encrypt": "node scripts\/encrypt.mjs",/' package.json
        fi
        # Replace codespace-start line
        sed -i.bak 's/"codespace-start": ".*"/"codespace-start": "pnpm run env \&\& node scripts\/launchers\/start.mjs codespace"/' package.json
    fi
    echo "✅ package.json updated (backup saved as package.json.backup)"
else
    echo "⚠️ package.json not found. Skipping script updates."
fi

# Step 7: Add dotenv to api-server
if [ -d artifacts/api-server ]; then
    cd artifacts/api-server
    pnpm add dotenv 2>/dev/null || echo "⚠️ Could not install dotenv (pnpm missing?)"
    cd ../..
else
    echo "⚠️ artifacts/api-server not found. Please manually install dotenv later."
fi

# Step 8: Ensure .env is in .gitignore
if [ -f .gitignore ]; then
    if ! grep -q "^\.env$" .gitignore; then
        echo ".env" >> .gitignore
        echo "✅ Added .env to .gitignore"
    fi
else
    echo ".env" > .gitignore
    echo "✅ Created .gitignore with .env"
fi

echo ""
echo "🎉 All done! You can now run:"
echo "   pnpm run env        - to decrypt .env (password: Khan@123.com)"
echo "   pnpm run codespace-start - to start all services"
echo ""
echo "🔑 Your encryption password is: Khan@123.com"
echo "⚠️  Keep this password safe. You need it to decrypt on any new machine."

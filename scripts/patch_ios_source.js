const fs = require('fs');
const path = require('path');

console.log('Running patch_ios_source.js...');

const projectRoot = path.resolve(__dirname, '..');
const configXmlPath = path.join(projectRoot, 'config.xml');

// 1. Get App Name from config.xml
if (!fs.existsSync(configXmlPath)) {
    console.error('config.xml not found!');
    process.exit(1);
}

const configXml = fs.readFileSync(configXmlPath, 'utf8');
const nameMatch = configXml.match(/<name>(.*?)<\/name>/);

if (!nameMatch) {
    console.error('Could not find <name> in config.xml');
    process.exit(1);
}

const appName = nameMatch[1];
console.log(`Found App Name: "${appName}"`);

// 2. Derive Swift Header Name
// Xcode changes spaces to underscores for module names usually.
// Tanta Modern School -> Tanta_Modern_School-Swift.h
const sanitizedAppName = appName.replace(/[^a-zA-Z0-9]/g, '_');
const swiftHeaderName = `${sanitizedAppName}-Swift.h`;

console.log(`Target Swift Header: ${swiftHeaderName}`);

// 3. Patch EncryptionHandler.m in node_modules
// We patch in node_modules so it propagates when 'ionic cordova platform add' is run later
const handlerRelPath = 'node_modules/@moodlehq/phonegap-plugin-push/src/ios/EncryptionHandler.m';
const handlerPath = path.join(projectRoot, handlerRelPath);

if (!fs.existsSync(handlerPath)) {
    console.error(`EncryptionHandler.m not found at ${handlerPath}`);
    // Check fallback for typical issue where we might be running from different cwd context
    // But since we use __dirname, we should be safe.
    process.exit(1);
}

let content = fs.readFileSync(handlerPath, 'utf8');

// We always want to replace "Moodle-Swift.h" or any previously patched version with the new one.
// But to be safe, we look for "Moodle-Swift.h" which is the default from the package.
// If we run this script sequentially for different clients, we might need to reset the node_modules or allow re-patching.

// Heuristic: If it contains Moodle-Swift.h, replace it.
// If it contains *-Swift.h, we might want to replace that too if we are switching clients.
// For now, let's assume strict CI environment where node_modules is fresh or we treat "Moodle-Swift.h" as the source.

if (content.includes('Moodle-Swift.h')) {
    console.log(`Patching "Moodle-Swift.h" -> "${swiftHeaderName}"`);
    content = content.replace('Moodle-Swift.h', swiftHeaderName);
    fs.writeFileSync(handlerPath, content, 'utf8');
    console.log('Successfully patched EncryptionHandler.m');
} else {
    // Check if it's already patched with something else
    const currentMatch = content.match(/#import "([^"]*-Swift\.h)"/);
    if (currentMatch) {
        const currentHeader = currentMatch[1];
        console.log(`Found existing header import: "${currentHeader}". Replacing with "${swiftHeaderName}"`);
        content = content.replace(currentHeader, swiftHeaderName);
        fs.writeFileSync(handlerPath, content, 'utf8');
        console.log('Successfully re-patched EncryptionHandler.m');
    } else {
        console.warn('Could not find Swift header import statement in EncryptionHandler.m');
    }
}

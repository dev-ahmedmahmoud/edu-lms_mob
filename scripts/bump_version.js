const fs = require('fs');
const path = require('path');

// config.xml path
const configPath = path.join(__dirname, '../config.xml');

// Get build number from command line args
const buildNumber = process.argv[2];

if (!buildNumber) {
    console.error('Error: Build number is required.');
    console.error('Usage: node scripts/bump_version.js <build_number>');
    process.exit(1);
}

// Read config.xml
let configContent = fs.readFileSync(configPath, 'utf8');

// Current Version: 5.1.0
// Base Android Code: 51000
const BASE_ANDROID_CODE = 51000;
const BASE_VERSION = '5.1';

// Calculate new versions
const newAndroidCode = BASE_ANDROID_CODE + parseInt(buildNumber);
const newVersion = `${BASE_VERSION}.${buildNumber}`; // e.g., 5.1.42
const newIosVersion = `${BASE_VERSION}.0.${buildNumber}`; // e.g., 5.1.0.42

console.log(`Updating version to: ${newVersion}`);
console.log(`Updating android-versionCode to: ${newAndroidCode}`);
console.log(`Updating ios-CFBundleVersion to: ${newIosVersion}`);

// Replace version attribute
configContent = configContent.replace(/version="[^"]+"/, `version="${newVersion}"`);

// Replace android-versionCode
configContent = configContent.replace(/android-versionCode="[^"]+"/, `android-versionCode="${newAndroidCode}"`);

// Replace ios-CFBundleVersion
configContent = configContent.replace(/ios-CFBundleVersion="[^"]+"/, `ios-CFBundleVersion="${newIosVersion}"`);

// Replace versionCode (generic fallback)
configContent = configContent.replace(/ versionCode="[^"]+"/, ` versionCode="${newAndroidCode}"`);


// Write back to config.xml
fs.writeFileSync(configPath, configContent);

console.log('Successfully updated config.xml');

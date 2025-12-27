const fs = require('fs');
const path = require('path');

// Arguments: --client-id <id>
const args = process.argv.slice(2);
const clientIdIndex = args.indexOf('--client-id');

if (clientIdIndex === -1 || clientIdIndex + 1 >= args.length) {
    console.error('Usage: node scripts/apply_client_config.js --client-id <client_id>');
    process.exit(1);
}

const clientId = args[clientIdIndex + 1];
const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'clients.config.json');

if (!fs.existsSync(configPath)) {
    console.error(`Configuration file not found at ${configPath}`);
    process.exit(1);
}

const clients = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const client = clients.find(c => c.id === clientId);

if (!client) {
    console.error(`Client with ID "${clientId}" not found in configuration.`);
    process.exit(1);
}

console.log(`Applying configuration for client: ${client.name} (${client.id})`);

// 1. Update config.xml
const configXmlPath = path.join(projectRoot, 'config.xml');
let configXml = fs.readFileSync(configXmlPath, 'utf8');

// Update Widget ID (Android & iOS)
// Note: This regex assumes standard Cordova config.xml formatting
configXml = configXml.replace(/id="[^"]*"/, `id="${client.appId.android}"`); // Main package ID matches Android usually

// Specific iOS Bundle ID override (if platform specific settings exist or we inject them)
// Cordova uses the widget id='' as the default bundle id.
// If Android and iOS IDs differ, we must ensure iOS uses its own.
// We can use the 'ios-CFBundleIdentifier' attribute on the widget tag if Cordova supports it (standard is usually just 'id').
// OR more reliably, we replace it in the platform-specific section OR we rely on the fact that we just set 'id' to android one.
// user says: "iOS is now using Android package name" -> because we set id="..." to android package name above.

// To support different IDs, we need to handle it.
// Cordova allows `ios-CFBundleIdentifier` on the <widget> tag.
if (client.appId.ios && client.appId.ios !== client.appId.android) {
     console.log(`Setting ios-CFBundleIdentifier to ${client.appId.ios}`);
     // Check if ios-CFBundleIdentifier exists, if so replace, if not add it.
     if (configXml.includes('ios-CFBundleIdentifier')) {
        configXml = configXml.replace(/ios-CFBundleIdentifier="[^"]*"/, `ios-CFBundleIdentifier="${client.appId.ios}"`);
     } else {
        // Add it to the widget tag
        configXml = configXml.replace(/<widget /, `<widget ios-CFBundleIdentifier="${client.appId.ios}" `);
     }
}

// Update Version
if (client.version) {
    configXml = configXml.replace(/version="[^"]*"/, `version="${client.version.name}"`);

    // Auto-increment version code using GitHub Run Number if available to prevent Google Play upload errors
    // Initial Base: 51000. Run Number: e.g. 50. New Code: 51050.
    const runNumber = process.env.GITHUB_RUN_NUMBER ? parseInt(process.env.GITHUB_RUN_NUMBER, 10) : 0;
    const baseCode = parseInt(client.version.code, 10);
    const newVersionCode = baseCode + runNumber;

    console.log(`Setting Android Version Code: ${newVersionCode} (Base: ${baseCode} + Run: ${runNumber})`);
    configXml = configXml.replace(/android-versionCode="[^"]*"/, `android-versionCode="${newVersionCode}"`);

    configXml = configXml.replace(/ios-CFBundleVersion="[^"]*"/, `ios-CFBundleVersion="${client.version.name}.${runNumber}"`); // Often matches version name or specific build num
}

// Update Name
configXml = configXml.replace(/<name>[^<]*<\/name>/, `<name>${client.name}</name>`);

// Write config.xml
fs.writeFileSync(configXmlPath, configXml, 'utf8');
console.log('Updated config.xml');

// 1.1 Update moodle.config.json
const moodleConfigPath = path.join(projectRoot, 'moodle.config.json');
if (fs.existsSync(moodleConfigPath)) {
    const moodleConfig = JSON.parse(fs.readFileSync(moodleConfigPath, 'utf8'));

    // Update app_id and appname
    // Using Android App ID as the main app_id as per config.xml convention above
    moodleConfig.app_id = client.appId.android;
    moodleConfig.appname = client.name;

    fs.writeFileSync(moodleConfigPath, JSON.stringify(moodleConfig, null, 4), 'utf8');
    console.log('Updated moodle.config.json with app_id and appname');
} else {
    console.warn('Warning: moodle.config.json not found, skipping update.');
}

// 2. Generate src/syncology/configs.ts
const tsConfigPath = path.join(projectRoot, 'src', 'syncology', 'configs.ts');
const tsContent = `// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { CoreLoginSiteInfoExtended } from '@features/login/pages/site/site';

export const siteImage = '${client.branding.image || ''}';

export const sites: CoreLoginSiteInfoExtended[] = [
${client.moodle.map(site => `    {
        name: '${site.siteName.replace(/'/g, "\\'")}',
        url: '${site.url}',
        imageurl: '${site.image || ''}',
        location: '${site.siteName.replace(/'/g, "\\'")}',
        title: '${site.siteName.replace(/'/g, "\\'")}',
        alias: '${site.alias || ''}',
        city: '${site.city || ''}',
        noProtocolUrl: '${site.url.replace(/^https?:\/\//, '')}',
    },`).join('\n')}
];
`;

fs.writeFileSync(tsConfigPath, tsContent, 'utf8');
console.log('Updated src/syncology/configs.ts');

// 3. Update Resources (Icons & Splash)
// Strategy: Copy <clientId> assets to 'resources/' root as 'icon.png' and 'splash.png'
// Then let 'npm run resources' (ionic cordova resources) handle the generation.

// Source files expected in 'resources/' root for simplicity given user instruction:
// <clientId>-icon.png
// resources/android/<clientId>-icon-foreground.png
// Splash is shared (splash.png), so we might not need to copy it if it's static,
// but if user implies per-client splash potential, we can handle it.
// User said: "splash.png is the same for all", but then "according to the deployed clients, the actual resources files should be overriden"

const resourcesRoot = path.join(projectRoot, 'resources');

// 3.1 Handle Icon
const clientIconPath = path.join(resourcesRoot, `${clientId}-icon.png`);
const targetIconPath = path.join(resourcesRoot, 'icon.png');

if (fs.existsSync(clientIconPath)) {
    console.log(`Copying ${clientIconPath} to icon.png`);
    fs.copyFileSync(clientIconPath, targetIconPath);
} else {
    console.warn(`Warning: Client icon not found at ${clientIconPath}. Using existing icon.png.`);
}

// 3.2 Handle Android Foreground Icon (Adaptive Icon)
const androidResourcesRoot = path.join(resourcesRoot, 'android');
const clientForegroundIconPath = path.join(androidResourcesRoot, `${clientId}-icon-foreground.png`);
// Note: The config.xml points to specific paths for adaptive icons.
// Standard Ionic resources structure usually relies on 'resources/android/icon-foreground.png' if configured.
// Let's assume we need to overwrite 'resources/android/icon-foreground.png' if it exists or is used by config.xml
const targetForegroundIconPath = path.join(androidResourcesRoot, 'icon-foreground.png');

if (fs.existsSync(clientForegroundIconPath)) {
    console.log(`Copying ${clientForegroundIconPath} to resource/android/icon-foreground.png`);
    fs.copyFileSync(clientForegroundIconPath, targetForegroundIconPath);
}

// 3.3 Handle Firebase Config Files
// Firebase config files are stored in 'firebase/' folder with client prefix
// e.g., firebase/tms-google-services.json and firebase/tms-GoogleService-Info.plist
const firebaseRoot = path.join(projectRoot, 'firebase');

// Android: google-services.json
const clientGoogleServicesPath = path.join(firebaseRoot, `${clientId}-google-services.json`);
const targetGoogleServicesPath = path.join(projectRoot, 'google-services.json');

if (fs.existsSync(clientGoogleServicesPath)) {
    console.log(`Copying ${clientGoogleServicesPath} to google-services.json`);
    fs.copyFileSync(clientGoogleServicesPath, targetGoogleServicesPath);
} else {
    console.warn(`Warning: Firebase config not found at ${clientGoogleServicesPath}. Android push notifications may not work.`);
}

// iOS: GoogleService-Info.plist
const clientGoogleServicePlistPath = path.join(firebaseRoot, `${clientId}-GoogleService-Info.plist`);
const targetGoogleServicePlistPath = path.join(projectRoot, 'GoogleService-Info.plist');

if (fs.existsSync(clientGoogleServicePlistPath)) {
    console.log(`Copying ${clientGoogleServicePlistPath} to GoogleService-Info.plist`);
    fs.copyFileSync(clientGoogleServicePlistPath, targetGoogleServicePlistPath);
} else {
    console.warn(`Warning: Firebase plist not found at ${clientGoogleServicePlistPath}. iOS push notifications may not work.`);
}

// 3.3 Run Resource Generation
// We need to run 'npm run resources' (or 'ionic cordova resources') to regenerate the platform specific images.
// This requires 'ionic' and 'cordova' to be in path, which they are in the CI.
const { execSync } = require('child_process');
try {
    console.log('Running npm run resources to regenerate assets...');
    // execSync('npm run resources', { stdio: 'inherit', cwd: projectRoot });
    // Optimization: 'npm run resources' might force a confirmed login or network call.
    // If 'ionic cordova resources' is just local resizing (no cloud), it's fine.
    // However, Ionic often uses cloud services for this.
    // If local generation is preferred, we need appropriate tools.
    // Assuming 'ionic cordova resources' is what the user wants.

    // IMPORTANT: 'ionic cordova resources' usually requires the project to be added to the platform first?
    // Or it generates them in the 'resources' folder which are then copied during 'platform add'.
    // Since we run this BEFORE 'platform add' in the workflow, this is the correct time.

    execSync('npm run resources', { stdio: 'inherit', cwd: projectRoot });

    // 3.4 Copy icon files to smallicon files for push notification icons
    // The smallicon is what appears in the Android notification bar
    // We use the client's regular icon as the smallicon
    console.log('Copying icon files to smallicon files for push notifications...');
    const iconDir = path.join(resourcesRoot, 'android', 'icon');
    const densities = ['ldpi', 'mdpi', 'hdpi', 'xhdpi'];

    for (const density of densities) {
        const iconFile = path.join(iconDir, `drawable-${density}-icon.png`);
        const smallIconFile = path.join(iconDir, `drawable-${density}-smallicon.png`);

        if (fs.existsSync(iconFile)) {
            console.log(`Copying ${iconFile} to ${smallIconFile}`);
            fs.copyFileSync(iconFile, smallIconFile);
        } else {
            console.warn(`Warning: Icon file not found at ${iconFile}`);
        }
    }
} catch (error) {
    console.error('Failed to regenerate resources:', error.message);
    // Don't fail the build strictly if resources fail (e.g. network issue), but warn.
    // process.exit(1);
}

console.log('Updated src/syncology/configs.ts');

// ... (Resource copying logic is here, checking lines to match context) ...

// Export App ID to GitHub Environment for Fastlane
// This handles cases where Android/iOS IDs differ from a simple pattern (e.g. tmsegypt vs tms)
if (process.env.GITHUB_ENV) {
    const androidPackageName = client.appId.android;
    const iosBundleId = client.appId.ios;
    const appName = client.name;

    console.log(`Exporting SUPPLY_PACKAGE_NAME=${androidPackageName} to GITHUB_ENV`);
    fs.appendFileSync(process.env.GITHUB_ENV, `SUPPLY_PACKAGE_NAME=${androidPackageName}\n`);

    console.log(`Exporting IOS_BUNDLE_ID=${iosBundleId} to GITHUB_ENV`);
    fs.appendFileSync(process.env.GITHUB_ENV, `IOS_BUNDLE_ID=${iosBundleId}\n`);

    console.log(`Exporting CLIENT_APP_NAME=${appName} to GITHUB_ENV`);
    fs.appendFileSync(process.env.GITHUB_ENV, `CLIENT_APP_NAME=${appName}\n`);
}

console.log('Client configuration applied successfully.');

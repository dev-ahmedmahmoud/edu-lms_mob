const fs = require('fs');
const path = require('path');

// Arguments: --client-id <id>
const args = process.argv.slice(2);
const clientIdIndex = args.indexOf('--client-id');

const platformIndex = args.indexOf('--platform');
const platform = (platformIndex !== -1 && platformIndex + 1 < args.length) ? args[platformIndex + 1] : 'android'; // Default to android

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
if (platform === 'ios' && client.appId.ios) {
    console.log(`Setting config.xml widget id to iOS Bundle ID: ${client.appId.ios}`);
    configXml = configXml.replace(/id="[^"]*"/, `id="${client.appId.ios}"`);
} else {
    console.log(`Setting config.xml widget id to Android Package Name: ${client.appId.android}`);
    configXml = configXml.replace(/id="[^"]*"/, `id="${client.appId.android}"`);
}

// Previous logic for ios-CFBundleIdentifier is no longer needed since we set the main ID per platform.

// Update Version
if (client.version) {
    // Determine the run number
    const runNumber = process.env.GITHUB_RUN_NUMBER ? parseInt(process.env.GITHUB_RUN_NUMBER, 10) : 0;

    // Instead of using '5.1.0', crop to '5.1' and append the runNumber
    const baseVersionString = client.version.name.split('.').slice(0, 2).join('.');
    const newAppVersion = runNumber > 0 ? `${baseVersionString}.${runNumber}` : client.version.name;

    // Use strict (\s) bound to avoid matching ios-CFBundleVersion or android-versionCode
    configXml = configXml.replace(/(\s)version="[^"]*"/, `$1version="${newAppVersion}"`);

    // Auto-increment version code using GitHub Run Number if available to prevent Google Play upload errors
    // Initial Base: 51000. Run Number: e.g. 50. New Code: 51500.
    const baseCode = parseInt(client.version.code, 10);
    const newVersionCode = baseCode + (runNumber * 10);

    console.log(`Setting Version Code: ${newVersionCode} (Base: ${baseCode} + Run: ${runNumber})`);
    configXml = configXml.replace(/android-versionCode="[^"]*"/, `android-versionCode="${newVersionCode}"`);

    configXml = configXml.replace(/ios-CFBundleVersion="[^"]*"/, `ios-CFBundleVersion="${newVersionCode}"`);

    // Replace versionCode (generic fallback string parsed by Cordova for both sometimes)
    configXml = configXml.replace(/(\s)versionCode="[^"]*"/, `$1versionCode="${newVersionCode}"`);

    // Replace hardcoded CFBundleShortVersionString in iOS plist edit-config (this overrides everything else!)
    configXml = configXml.replace(/(<edit-config[^>]*target="CFBundleShortVersionString"[^>]*>\s*<string>)[^<]*(<\/string>\s*<\/edit-config>)/g, `$1${newAppVersion}$2`);

    // Replace hardcoded version in AppendUserAgent preference
    configXml = configXml.replace(/(<preference name="AppendUserAgent" value="MoodleMobile )[^"]*("\s*\/>)/g, `$1${newAppVersion} (${newVersionCode})$2`);
}

// Update Name
configXml = configXml.replace(/<name>[^<]*<\/name>/, `<name>${client.name}</name>`);

// Write config.xml
fs.writeFileSync(configXmlPath, configXml, 'utf8');
console.log('Updated config.xml');

// 1.1 Update package.json to prevent Cordova from overriding the version during CI build
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockJsonPath = path.join(projectRoot, 'package-lock.json');
if (fs.existsSync(packageJsonPath) && client.version) {
    let packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    // We determine the same newAppVersion
    const runNumber = process.env.GITHUB_RUN_NUMBER ? parseInt(process.env.GITHUB_RUN_NUMBER, 10) : 0;
    const baseVersionString = client.version.name.split('.').slice(0, 2).join('.');
    const newAppVersion = runNumber > 0 ? `${baseVersionString}.${runNumber}` : client.version.name;

    // Replace "version": "..." safely at the root level (usually found quickly at the top)
    packageJsonContent = packageJsonContent.replace(/"version":\s*"[^"]*"/, `"version": "${newAppVersion}"`);
    fs.writeFileSync(packageJsonPath, packageJsonContent, 'utf8');
    console.log(`Updated package.json version to: ${newAppVersion}`);

    if (fs.existsSync(packageLockJsonPath)) {
        let packageLockContent = fs.readFileSync(packageLockJsonPath, 'utf8');
        // Replace first two occurrences of "version": "..." which correspond to root project version
        packageLockContent = packageLockContent.replace(/"version":\s*"[^"]*"/, `"version": "${newAppVersion}"`);
        packageLockContent = packageLockContent.replace(/"version":\s*"[^"]*"/, `"version": "${newAppVersion}"`);
        fs.writeFileSync(packageLockJsonPath, packageLockContent, 'utf8');
        console.log(`Updated package-lock.json version to: ${newAppVersion}`);
    }
}

// 1.2 Update moodle.config.json
const moodleConfigPath = path.join(projectRoot, 'moodle.config.json');
if (fs.existsSync(moodleConfigPath)) {
    const moodleConfig = JSON.parse(fs.readFileSync(moodleConfigPath, 'utf8'));

    // Update app_id based on platform
    if (platform === 'ios' && client.appId.ios) {
        moodleConfig.app_id = client.appId.android;
        console.log(`Setting app_id to iOS Bundle ID: ${client.appId.android}`);
    } else {
        moodleConfig.app_id = client.appId.android;
        console.log(`Setting app_id to Android Package Name: ${client.appId.android}`);
    }

    moodleConfig.appname = client.name;

    if (client.version) {
        const runNumber = process.env.GITHUB_RUN_NUMBER ? parseInt(process.env.GITHUB_RUN_NUMBER, 10) : 0;
        const baseVersionString = client.version.name.split('.').slice(0, 2).join('.');
        moodleConfig.versionname = runNumber > 0 ? `${baseVersionString}.${runNumber}` : client.version.name;
        moodleConfig.versioncode = parseInt(client.version.code, 10) + (runNumber * 10);
    }

    fs.writeFileSync(moodleConfigPath, JSON.stringify(moodleConfig, null, 4), 'utf8');
    console.log(`Updated moodle.config.json for platform: ${platform}`);
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

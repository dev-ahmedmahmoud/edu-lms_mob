const https = require('https');
const http = require('http');
const url = require('url');

// Usage: node scripts/debug_moodle_api.js <site_url> <token>
const siteUrlArg = process.argv[2];
const token = process.argv[3];

if (!siteUrlArg || !token) {
    console.error('Usage: node scripts/debug_moodle_api.js <site_url> <token>');
    console.error('Example: node scripts/debug_moodle_api.js https://myschool.com abc123456');
    process.exit(1);
}

// Ensure site URL has no trailing slash and ends with webservice endpoint
const baseUrl = siteUrlArg.replace(/\/$/, '');
const endpoint = `${baseUrl}/webservice/rest/server.php?moodlewsrestformat=json`;

// Moodle WS requires booleans as 1/0 usually, except for specific settings
// app's convertValuesToString does this transformation.
const params = {
    wstoken: token,
    wsfunction: 'core_message_get_member_info',
    moodlewssettingfilter: 'true',
    moodlewssettingfileurl: 'true',
    moodlewssettinglang: 'en',
    // Function arguments
    referenceuserid: 3664,
    userids: [3], // CHANGE THIS BACK TO 3 TO TEST THE FAILING USER
    includecontactrequests: '1',
    includeprivacyinfo: '1'
};

const postData = new URLSearchParams();
for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
        // Moodle array format: param[0]=val
        value.forEach((v, i) => {
            postData.append(`${key}[${i}]`, v);
        });
    } else {
        postData.append(key, value);
    }
}

// Add the function name to URL as well for safety, though it's in body
const rUrl = `${endpoint}&wsfunction=core_message_get_member_info`;
const parsedUrl = url.parse(rUrl);

const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.path,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData.toString())
    }
};

console.log('--- DEBUG SCRIPT ---');
console.log('Target:', rUrl);
console.log('Payload:', postData.toString());

const req = (parsedUrl.protocol === 'https:' ? https : http).request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('\n--- RESPONSE STATUS ---');
        console.log(res.statusCode);
        console.log('\n--- RESPONSE BODY ---');
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log(data);
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e);
});

// ... existing code ...
req.write(postData.toString());
req.end();

// --- PROBE CHECK ---
// Also check if the user exists via core_user_get_users_by_field
const probeParams = {
    wstoken: token,
    wsfunction: 'core_user_get_users_by_field',
    moodlewssettingfilter: 'true',
    moodlewssettingfileurl: 'true',
    moodlewssettinglang: 'en',
    field: 'id',
    values: [3] // Hardcoded User 3
};

const probePostData = new URLSearchParams();
for (const [key, value] of Object.entries(probeParams)) {
    if (Array.isArray(value)) {
        value.forEach((v, i) => {
            probePostData.append(`${key}[${i}]`, v);
        });
    } else {
        probePostData.append(key, value);
    }
}

const probeUrl = `${endpoint}&wsfunction=core_user_get_users_by_field`;
const probeParsedUrl = url.parse(probeUrl);
const probeOptions = {
    hostname: probeParsedUrl.hostname,
    port: probeParsedUrl.port || (probeParsedUrl.protocol === 'https:' ? 443 : 80),
    path: probeParsedUrl.path,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(probePostData.toString())
    }
};

const probeReq = (probeParsedUrl.protocol === 'https:' ? https : http).request(probeOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('\n\n--- PROBE (User Existence Check) ---');
        console.log('Function: core_user_get_users_by_field');
        console.log('Response Body:');
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log(data);
        }
    });
});
probeReq.on('error', (e) => console.error('Probe failed:', e));
probeReq.write(probePostData.toString());
probeReq.end();

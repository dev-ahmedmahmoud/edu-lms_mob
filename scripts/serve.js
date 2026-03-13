const { spawn } = require('child_process');

// 1. Run gulp watch in the background
console.log('> gulp watch');
const gulp = spawn('gulp', ['watch'], {
    stdio: 'inherit',
    shell: true,
    detached: true // Allow it to run independently if needed, though usually we want it bound
});

// 2. Process Arguments
const args = process.argv.slice(2);
const filteredArgs = [];
let angularTarget = 'serve';

for (const arg of args) {
    if (arg.startsWith('--project=')) {
        // Remove --project argument
        continue;
    }
    if (arg.startsWith('--platform=')) {
        angularTarget = 'ionic-cordova-serve';
    }
    filteredArgs.push(arg);
}

// 3. Run Angular CLI
const cmd = `ng run app:${angularTarget} ${filteredArgs.join(' ')}`;
console.log(`> NODE_OPTIONS=--max-old-space-size=4096 ${cmd}`);

// We need to set the environment variable for the child process
const env = Object.assign({}, process.env, {
    NODE_OPTIONS: '--max-old-space-size=4096'
});

const ng = spawn('ng', ['run', `app:${angularTarget}`, ...filteredArgs], {
    stdio: 'inherit',
    shell: true,
    env: env
});

ng.on('close', (code) => {
    // Kill gulp when ng exits
    gulp.kill();
    process.exit(code);
});

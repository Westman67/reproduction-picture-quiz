import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.env.DIST_DIR || path.join(root, 'dist'));
const runtime = ['index.html', 'app.js', 'engine.js', 'bank-config.js', 'progress-migration.js', 'styles.css', 'sw.js', 'manifest.webmanifest'];
const dataNames = ['question-bank.json', 'source-manifest.json', 'coverage.json', 'flag-remediation.json'];
const assetPath = /^assets\/(?:originals|display|zoom)\/[a-f0-9]+(?:-[a-z0-9-]+)?\.(?:png|webp)$/;
const maxImageBytes = 1024 * 1024;
const run = promisify(execFile);
const assets = new Map();

function publishPath(asset) {
    if (!assetPath.test(asset)) return asset;
    if (!assets.has(asset)) {
        const input = path.join(root, asset);
        const sourceSize = fs.statSync(input).size;
        const convert = asset.endsWith('.png') || asset.startsWith('assets/originals/') || sourceSize > maxImageBytes;
        const key = createHash('sha256').update(asset).digest('hex');
        const output = convert ? `assets/zoom/${key}.webp` : asset;
        assets.set(asset, {input, output, convert});
    }
    return assets.get(asset).output;
}

async function writeImage({input, output, convert}, staging) {
    const dest = path.join(staging, output);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    if (convert) {
        // cwebp preserves the aspect ratio when one dimension is zero.
        const header = fs.readFileSync(input);
        const dims = input.endsWith('.png')
            ? [header.readUInt32BE(16), header.readUInt32BE(20)]
            : (await run('webpinfo', [input])).stdout.match(/Width: (\d+)\s+Height: (\d+)/)?.slice(1).map(Number);
        if (!dims?.every(n => n > 0)) throw Error(`Cannot read dimensions: ${input}`);
        const [width, height] = dims;
        const resize = Math.max(width, height) > 1600
            ? ['-resize', ...(width >= height ? ['1600', '0'] : ['0', '1600'])] : [];
        try {
            for (const quality of ['88', '76', '64']) {
                await run('cwebp', ['-quiet', '-q', quality, '-sharp_yuv', ...resize, input, '-o', dest]);
                if (fs.statSync(dest).size <= maxImageBytes) break;
            }
        } catch (error) {
            if (error.code === 'ENOENT') throw Error('Install the WebP command line tools (cwebp and webpinfo) to build from original images.');
            throw error;
        }
    } else {
        fs.copyFileSync(input, dest);
    }
    if (fs.statSync(dest).size > maxImageBytes) throw Error(`Published image exceeds 1 MiB: ${output}`);
}

const data = new Map();
for (const folder of ['data', ...fs.readdirSync(path.join(root, 'data'), {withFileTypes: true})
    .filter(entry => entry.isDirectory()).map(entry => `data/${entry.name}`).sort()]) {
    for (const name of dataNames) {
        const relative = `${folder}/${name}`;
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) continue;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (name === 'question-bank.json') delete raw.bank_version;
        const published = JSON.parse(JSON.stringify(raw, (_key, value) => typeof value === 'string' ? publishPath(value) : value));
        data.set(relative, published);
    }
}
const runtimeText = runtime.map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]);
const fingerprint = createHash('sha256').update(JSON.stringify([...runtimeText, ...data]));
for (const {input, output} of assets.values()) {
    fingerprint.update(output).update(fs.readFileSync(input));
}
const version = fingerprint.digest('hex').slice(0, 16);

fs.mkdirSync(path.dirname(out), {recursive: true});
const work = fs.mkdtempSync(path.join(path.dirname(out), '.quiz-build-'));
const staging = path.join(work, 'next');
const previous = path.join(work, 'previous');
fs.mkdirSync(staging);
try {
    for (const [relative, raw] of data) {
        const file = path.join(staging, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        if (relative.endsWith('/question-bank.json')) raw.bank_version = version;
        fs.writeFileSync(file, JSON.stringify(raw) + '\n');
    }
    for (const [relative, source] of runtimeText) {
        const content = source.replaceAll(/(\.\/[\w.-]+\.(?:js|css))(['"])/g, `$1?v=${version}$2`)
            .replace("const DATA_VERSION='dev';", `const DATA_VERSION='${version}';`);
        fs.writeFileSync(path.join(staging, relative), content);
    }
    const tasks = [...assets.values()];
    const results = await Promise.allSettled(Array.from({length: 6}, async () => {
        while (tasks.length) await writeImage(tasks.pop(), staging);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (fs.existsSync(out)) fs.renameSync(out, previous);
    try {
        fs.renameSync(staging, out);
    } catch (error) {
        if (fs.existsSync(previous)) fs.renameSync(previous, out);
        throw error;
    }
} finally {
    fs.rmSync(work, {recursive: true, force: true, maxRetries: 4});
}
console.log(`Built ${assets.size} images in ${path.relative(root, out)} (${version})`);

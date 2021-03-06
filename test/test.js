const test = require('tape');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');

const iamtestBin = path.resolve(process.cwd(), './bin/iamtest.js');
const coverageDir = path.join(process.cwd(), 'coverage-test');
const successTestPath = path.join(__dirname, 'fixture/success.js');
const coverageDirArg = ['--coverage-dir', coverageDir];
const testArg = [successTestPath];

test('without args', (t) => {
    const runner = fork(iamtestBin, [...testArg], { silent: true });
    runner.on('exit', (code) => {
        t.equal(code, 0, 'exit code 0');
        t.end();
    });
    runner.stderr.on('data', data => t.error(data.toString()));
});

test('-c lcov', (t) => {
    async.series({
        cleanupCoverageDir: cb => fs.remove(coverageDir, cb),
        exec: (cb) => {
            const runner = fork(iamtestBin, [...testArg, '-c', 'lcov', ...coverageDirArg], { silent: true });
            runner.on('exit', (code) => {
                t.equal(code, 0, 'exit code 0');
                cb();
            });
            runner.stderr.on('data', data => t.error(data.toString()));
        },
        lcovInfo: cb => fs.access(path.join(coverageDir, 'lcov.info'), cb),
        lcovReport: cb => fs.access(path.join(coverageDir, 'lcov-report'), cb),
    }, (err) => {
        if (err) t.ifError(err);
        t.pass('lcov.info file exists');
        t.pass('lcov-report dir exists');
        t.end();
    });
});

test('-c json -c json-summary', (t) => {
    async.series({
        cleanupCoverageDir: cb => fs.remove(coverageDir, cb),
        exec: (cb) => {
            const runner = fork(iamtestBin, [...testArg, '-c', 'json', '-c', 'json-summary', ...coverageDirArg],
                { silent: true });
            runner.on('exit', (code) => {
                t.equal(code, 0, 'exit code 0');
                cb();
            });
            runner.stderr.on('data', data => t.error(data.toString()));
        },
        coverageFinal: cb => fs.access(path.join(coverageDir, 'coverage-final.json'), cb),
        coverageSummary: cb => fs.access(path.join(coverageDir, 'coverage-summary.json'), cb),
    }, (err) => {
        if (err) t.ifError(err);
        t.pass('coverage-final.json file exists');
        t.pass('coverage-summary.json file exists');
        t.end();
    });
});

test('-c html', (t) => {
    async.series({
        cleanupCoverageDir: cb => fs.remove(coverageDir, cb),
        exec: (cb) => {
            const runner = fork(iamtestBin, [...testArg, '-c', 'html', ...coverageDirArg], { silent: true });
            runner.on('exit', (code) => {
                t.equal(code, 0, 'exit code 0');
                cb();
            });
            runner.stderr.on('data', data => t.error(data.toString()));
        },
        lcovInfo: cb => fs.access(path.join(coverageDir, 'index.html'), cb),
    }, (err) => {
        if (err) t.ifError(err);
        t.pass('index.html file exists');
        t.end();
    });
});

test('-c console', (t) => {
    const runner = fork(iamtestBin, [...testArg, '-c', 'console', ...coverageDirArg], { silent: true });
    t.plan(3);
    runner.on('exit', (code) => {
        t.equal(code, 0, 'exit code 0');
        t.end();
    });
    runner.on('message', ({ name, body }) => {
        if (name === 'run nyc') {
            const nycArgs = body.slice(0, body.indexOf('node'));
            t.ok(nycArgs.includes('--reporter=text'), 'nyc called with arg --reporter=text');
            t.ok(nycArgs.includes('--reporter=text-summary'), 'nyc called with arg --reporter=text-summary');
        }
        if (name === 'error') {
            t.fail(body);
        }
    });
    runner.stderr.on('data', data => t.error(data.toString()));
});

test('--web 8080 -c console', (t) => {
    const runner = fork(iamtestBin, [...testArg, '--web', '8080', '-c', 'console', ...coverageDirArg],
        { silent: true });
    t.plan(1);
    runner.on('exit', () => {
        t.end();
    });
    runner.stderr.on('data', (data) => {
        if (data.toString().includes('Implications failed')) {
            t.pass('should not start without -c html');
        }
    });
});

test('-w', (t) => {
    const runner = fork(iamtestBin, [...testArg, '-w', ...coverageDirArg], { silent: true });
    const counter = {};
    t.plan(18);
    runner.on('exit', () => t.end);
    runner.on('message', ({ name, body }) => {
        if (!counter[name]) counter[name] = 0;
        counter[name] += 1;
        if (name === 'start') {
            if (counter[name] === 1) {
                t.pass('start (master)');
            }
            if (counter[name] === 2) {
                t.pass('start (child)');
            }
            if (counter[name] === 3) {
                t.pass('start (first watcher)');
            }
            if (counter[name] === 4) {
                t.pass('start (second watcher)');
            }
        }
        if (name === 'run master') {
            t.pass('run master');
        }
        if (name === 'run nyc') {
            t.pass('run nyc');
            t.ok(body.includes('--reporter=json-summary'), 'with arg --reporter=json-summary');
        }
        if (name === 'run test') {
            if (counter['run test'] === 1) {
                t.pass('run test (initial)');
            }
            if (counter['run test'] === 2) {
                t.pass('run test (first watcher)');
            }
            if (counter['run test'] === 3) {
                t.pass('run test (second watcher)');
            }
        }
        if (name === 'run watcher') {
            t.pass('run watcher');
            t.ok(body.includes(successTestPath), 'list of watching files includes test file');
            // trigger file change event
            fs.utimes(successTestPath, new Date(), new Date(), (err) => {
                if (err) t.ifError(err);
            });
        }
        if (name === 'watcher event') {
            if (counter[name] === 1) {
                t.pass('first watcher event');
            }
            if (counter[name] === 2) {
                t.pass('second watcher event');
            }
        }
        if (name === 'child fork') {
            if (counter[name] === 1) {
                t.pass('first watcher child fork');
            }
            if (counter[name] === 2) {
                t.pass('second watcher child fork');
            }
        }
        if (name === 'child exit') {
            if (counter[name] === 1) {
                t.pass('first watcher child exit');
                // trigger file change event again
                fs.utimes(successTestPath, new Date(), new Date(), (err) => {
                    if (err) t.ifError(err);
                });
            }
            if (counter[name] === 2) {
                t.pass('second watcher child exit');
                // time to kill watcher
                process.nextTick(() => runner.kill('SIGINT'));
            }
        }
        if (name === 'error') {
            t.fail(name, body);
        }
    });
    runner.stderr.on('data', data => t.error(data.toString()));
});

test('--babel', (t) => {
    const babelTestPath = path.join(__dirname, 'fixture/babel.js');
    const runner = fork(iamtestBin, [babelTestPath, '--babel'], { silent: true });
    runner.on('exit', (code) => {
        t.equal(code, 0, 'exit code 0');
        t.end();
    });
    runner.stderr.on('data', data => t.error(data.toString()));
});

test('after', (t) => {
    process.nextTick(() => {
        fs.remove(coverageDir, t.end);
    });
});

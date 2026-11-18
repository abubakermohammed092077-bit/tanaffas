// renderer.js — the page script. Bundled into dist/renderer.bundle.js by esbuild.
//
// SDK usage is copied from the official electron-quickstart sample, trimmed to:
// camera preview + live breathing rate + live pulse rate + validation hints.

'use strict';

const {
    SmartSpectraSDK,
    ProcessingStatus,
    ValidationCode,
    breathingMetrics,
    cardioMetrics,
} = require('@smartspectra/node-sdk/renderer');

// Protobuf decoder shipped by the SDK (renderer-safe, per the sample).
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

// DOM ------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
    preview:      $('preview'),
    status:       $('status'),
    hint:         $('hint'),
    error:        $('error'),
    breathing:    $('breathing'),
    pulse:        $('pulse'),
    pulseToggle:  $('measure-pulse'),
    btnStart:     $('btn-start'),
    btnStop:      $('btn-stop'),
};

const STATUS_NAMES = Object.fromEntries(
    Object.entries(ProcessingStatus).map(([k, v]) => [v, k.replace(/^k/, '')]),
);
const VALIDATION_NAMES = Object.fromEntries(
    Object.entries(ValidationCode).map(([k, v]) => [v, k.replace(/^k/, '')]),
);

function showError(code, message) {
    els.error.hidden = false;
    els.error.textContent = `${code}: ${message}`;
}

function lastValue(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1].value;
}

// SDK ------------------------------------------------------------------------
let sdk = null;

function buildSdk(apiKey) {
    // Breathing is always on. Pulse needs an API key enabled for cardio metrics
    // (see the sample's troubleshooting table), so it's a checkbox.
    const requestedMetrics = [...breathingMetrics];
    if (els.pulseToggle.checked) requestedMetrics.push(...cardioMetrics);

    sdk = new SmartSpectraSDK({
        apiKey,
        requestedMetrics,
        enableAccumulatedOutput: false,
    });

    sdk.on('processingStatus', (status) => {
        els.status.textContent = STATUS_NAMES[status] || `Status(${status})`;
        const running = status === ProcessingStatus.kStarting || status === ProcessingStatus.kRunning;
        els.btnStart.disabled = running || status === ProcessingStatus.kStopping;
        els.btnStop.disabled = !running;
    });

    sdk.on('validationStatus', (code, timestampUs, hint) => {
        const name = VALIDATION_NAMES[code] || `Code(${code})`;
        els.hint.textContent = `${name}${hint ? ' — ' + hint : ''}`;
        els.hint.className = 'hint ' + (
            code === ValidationCode.kOk ? 'hint-ok' :
            code === ValidationCode.kCameraTuning ? 'hint-warn' : 'hint-err'
        );
    });

    // Each 'metrics' event is a windowed slice; show the latest value in it.
    sdk.on('metrics', (buf) => {
        try {
            const m = decodeMetrics(buf);
            const br = lastValue(m.breathing?.rate);
            if (br != null) els.breathing.textContent = br.toFixed(0);
            const pr = lastValue(m.cardio?.pulseRate);
            if (pr != null) els.pulse.textContent = pr.toFixed(0);
        } catch (e) {
            console.error('[tanaffas] failed to decode metrics:', e);
        }
    });

    sdk.on('error', (code, message, retryable) => {
        console.error(`[tanaffas] error code=${code} retryable=${retryable}: ${message}`);
        showError(code, retryable ? `${message} (retryable)` : message);
    });

    sdk.on('streamAvailable', (stream) => {
        els.preview.srcObject = stream;
        els.preview.play().catch(() => {});
    });
}

// Buttons ----------------------------------------------------------------------
async function start() {
    els.btnStart.disabled = true;
    els.pulseToggle.disabled = true;
    els.error.hidden = true;
    els.breathing.textContent = '—';
    els.pulse.textContent = '—';
    try {
        const apiKey = await window.tanaffasConfig.getApiKey();
        if (!apiKey) {
            throw Object.assign(
                new Error('No API key found. Copy .env.example to .env, paste your key, and restart the app.'),
                { code: 'NO_KEY' });
        }
        if (!sdk) buildSdk(apiKey);
        await sdk.start();   // SDK opens the camera and emits 'streamAvailable'
    } catch (err) {
        showError(err.code ?? 'JS', err.message);
        els.btnStart.disabled = false;
        els.pulseToggle.disabled = false;
    }
}

async function stop() {
    els.btnStop.disabled = true;
    try { if (sdk) await sdk.stop(); } catch (err) { console.error('stop() failed:', err); }
    els.preview.srcObject = null;
    // requestedMetrics is fixed per SDK instance, so destroy and rebuild on next Start.
    if (sdk) { try { sdk.destroy(); } catch { /* already destroyed */ } sdk = null; }
    els.btnStart.disabled = false;
    els.pulseToggle.disabled = false;
}

els.btnStart.addEventListener('click', start);
els.btnStop.addEventListener('click', stop);

window.addEventListener('beforeunload', () => {
    if (sdk) { try { sdk.destroy(); } catch { /* already destroyed */ } }
});

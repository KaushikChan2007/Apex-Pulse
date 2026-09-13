/**
 * Apex Pulse - F1 Cockpit Steering Wheel Logic (Authentic 3-Card F1 LCD)
 * 15-LED RPM shift light controller, closed-loop telemetry updates,
 * Red Bull 2023 ignition roar, and continuous hands-free pit intercom.
 */

let currentRoomCode = "849201";
let telemetryWs = null;
let audioWs = null;
let isIntercomStarted = false;
let isCoachOnline = false;

// DOM Elements - Ignition Overlay
const f1IgnitionOverlay = document.getElementById('f1IgnitionOverlay');
const driverRoomInput = document.getElementById('driverRoomInput');

// DOM Elements - LCD Header
const f1LapNum = document.getElementById('f1LapNum');
const f1RoomCodeText = document.getElementById('f1RoomCodeText');

// DOM Elements - 3 Core Panels
// Option 1 (Left): Delta Gap & Mode
const f1DeltaDisplay = document.getElementById('f1DeltaDisplay');
const f1DeltaVal = document.getElementById('f1DeltaVal');
const f1ClosingVal = document.getElementById('f1ClosingVal');
const f1ModeBadge = document.getElementById('f1ModeBadge');
const f1DrsBadge = document.getElementById('f1DrsBadge');

// Option 2 (Center): Gear & Speed
const f1GearNum = document.getElementById('f1GearNum');
const f1SpeedNum = document.getElementById('f1SpeedNum');
const f1RpmText = document.getElementById('f1RpmText');

// Option 3 (Right): Battery SoC & ERS
const f1SocDisplay = document.getElementById('f1SocDisplay');
const f1SocVal = document.getElementById('f1SocVal');
const f1SocBar = document.getElementById('f1SocBar');
const f1DeployTag = document.getElementById('f1DeployTag');
const f1RrVal = document.getElementById('f1RrVal');

// Option 4 (Bottom): Pit Directive Banner
const f1DirectiveStrip = document.getElementById('f1DirectiveStrip');
const f1DirectiveText = document.getElementById('f1DirectiveText');
const f1DirectiveReason = document.getElementById('f1DirectiveReason');

// Footer Intercom Elements
const driverVoiceBar = document.getElementById('driverVoiceBar');
const btnDriverMute = document.getElementById('btnDriverMute');
const f1CoachStatus = document.getElementById('f1CoachStatus');

/**
 * 1. Ignition & Pre-Race Engine Start Sequence
 */
function startF1IgnitionAndCockpit() {
    // 1. Initialize Web Audio API for continuous hands-free intercom
    if (window.radioAudio) {
        window.radioAudio.initAudioContext();
    }

    // 2. Read room code
    const code = (driverRoomInput.value || '').trim().toUpperCase();
    if (code.length === 6) {
        currentRoomCode = code;
        localStorage.setItem('apex_room_code', currentRoomCode);
    }
    f1RoomCodeText.textContent = `#${currentRoomCode}`;

    // 3. Smooth fadeout of initialization overlay into live steering wheel
    f1IgnitionOverlay.classList.add('faded-out');

    // 4. Connect WebSockets and start continuous hands-free intercom
    connectToRoom(currentRoomCode);
    setTimeout(() => {
        startContinuousVoiceIntercom();
    }, 400);
}

/**
 * 2. Room Session & URL Parsing
 */
function initSessionRoom() {
    const params = new URLSearchParams(window.location.search);
    const codeInUrl = params.get('code');

    if (codeInUrl && codeInUrl.trim().length === 6) {
        currentRoomCode = codeInUrl.trim().toUpperCase();
        localStorage.setItem('apex_room_code', currentRoomCode);
        driverRoomInput.value = currentRoomCode;
    } else {
        const savedCode = localStorage.getItem('apex_room_code');
        if (savedCode && savedCode.length === 6) {
            currentRoomCode = savedCode;
            driverRoomInput.value = currentRoomCode;
        }
    }

    f1RoomCodeText.textContent = `#${currentRoomCode}`;
}

/**
 * 3. Connect WebSockets for Telemetry & Voice Intercom
 */
function connectToRoom(roomCode) {
    if (telemetryWs) {
        telemetryWs.close();
        telemetryWs = null;
    }
    if (audioWs) {
        audioWs.close();
        audioWs = null;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const backendParam = urlParams.get('backend') || localStorage.getItem('apex_backend_host');
    if (urlParams.get('backend')) {
        localStorage.setItem('apex_backend_host', urlParams.get('backend'));
    }
    const loc = window.location;
    const isCustom = Boolean(backendParam);
    const host = backendParam ? backendParam.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '') : loc.host;
    const wsProto = (loc.protocol === 'https:' || isCustom) ? 'wss:' : 'ws:';

    // 1. Telemetry WebSocket
    telemetryWs = new WebSocket(`${wsProto}//${host}/ws/telemetry/${roomCode}`);

    telemetryWs.onopen = () => {
        console.log(`[F1 WHEEL] Connected to telemetry stream for room #${roomCode}.`);
    };

    telemetryWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'telemetry_frame') {
                updateF1SteeringWheel(data);
            } else if (data.type === 'control_ack') {
                if (data.coach_directive) {
                    f1DirectiveText.textContent = data.coach_directive;
                }
            }
        } catch (e) {
            console.error('[F1 WHEEL] Parse error:', e);
        }
    };

    telemetryWs.onclose = () => {
        setTimeout(() => {
            if (telemetryWs === null || telemetryWs.readyState === WebSocket.CLOSED) {
                connectToRoom(currentRoomCode);
            }
        }, 2000);
    };

    // 2. Audio Intercom WebSocket
    audioWs = new WebSocket(`${wsProto}//${host}/ws/audio/${roomCode}?role=driver`);

    audioWs.onopen = () => {
        console.log(`[F1 WHEEL] Connected to audio intercom for room #${roomCode}.`);
        // Keepalive heartbeat to keep cloud proxy WebSocket connections alive (e.g. Render 55s timeout)
        if (window.driverAudioPingInterval) clearInterval(window.driverAudioPingInterval);
        window.driverAudioPingInterval = setInterval(() => {
            if (audioWs && audioWs.readyState === WebSocket.OPEN) {
                audioWs.send(JSON.stringify({ type: 'ping' }));
            }
        }, 15000);
    };

    audioWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pong') return; // Heartbeat response
            handleIntercomMessage(msg);
        } catch (e) {
            console.error('[F1 WHEEL] Audio WS parse error:', e);
        }
    };

    audioWs.onclose = () => {
        f1CoachStatus.textContent = 'COACH STANDBY';
        f1CoachStatus.style.borderColor = '#475569';
        f1CoachStatus.style.color = '#94a3b8';
        if (window.driverAudioPingInterval) clearInterval(window.driverAudioPingInterval);
    };
}

/**
 * 4. Update the 3 Core F1 Steering Wheel Displays + Shift Lights
 */
function updateF1SteeringWheel(frame) {
    const tel = frame.telemetry || {};
    const rec = frame.recommendation || {};
    const rr = frame.risk_reward || {};

    const speed = tel.speed_kph || 0;
    const gear = frame.gear || tel.gear || (speed > 290 ? 8 : speed > 250 ? 7 : speed > 200 ? 6 : speed > 150 ? 5 : 4);
    const rpm = frame.rpm || tel.rpm || Math.round(9200 + (speed % 45) * 75);
    const lap = frame.lap || 1;
    const soc = (frame.battery_soc_dynamic !== undefined) ? frame.battery_soc_dynamic : (tel.battery_soc_pct !== undefined ? tel.battery_soc_pct : 75.0);
    const gap = tel.gap_sec !== undefined ? tel.gap_sec : 1.25;
    const closing = tel.closing_speed_kph !== undefined ? tel.closing_speed_kph : 0.0;
    const drs = Boolean(tel.drs_available);
    const mode = rec.mode || 'Balance';
    const deployKw = tel.deploy_kw || 0;
    const directive = frame.coach_directive || 'HOLD BALANCED PACE';
    const reasoning = rec.reasoning || '';

    // ================= HEADER =================
    f1LapNum.textContent = String(lap).padStart(2, '0');

    // ================= 15-LED RPM SHIFT LIGHT BAR =================
    updateShiftLights(rpm);

    // ================= OPTION 1 (LEFT): DELTA GAP & MODE =================
    const deltaSign = gap >= 0 ? '+' : '';
    f1DeltaVal.textContent = `${deltaSign}${gap.toFixed(3)}`;

    if (gap <= 1.0) {
        f1DeltaDisplay.className = 'delta-display delta-green';
    } else if (gap > 2.5) {
        f1DeltaDisplay.className = 'delta-display delta-red';
    } else {
        f1DeltaDisplay.className = 'delta-display';
    }

    const cSign = closing >= 0 ? '+' : '';
    f1ClosingVal.textContent = `${cSign}${closing.toFixed(1)}`;

    // ERS Mode Badge
    f1ModeBadge.className = 'ers-mode-box';
    if (mode === 'Overtake') {
        f1ModeBadge.classList.add('mode-overtake');
        f1ModeBadge.textContent = 'OVERTAKE // BOOST';
    } else if (mode === 'Push') {
        f1ModeBadge.classList.add('mode-push');
        f1ModeBadge.textContent = 'PUSH PACE';
    } else if (mode === 'Harvest') {
        f1ModeBadge.classList.add('mode-harvest');
        f1ModeBadge.textContent = 'HARVEST // RECHARGE';
    } else {
        f1ModeBadge.classList.add('mode-balance');
        f1ModeBadge.textContent = 'BALANCE';
    }

    // DRS Status
    if (drs) {
        f1DrsBadge.className = 'drs-status-badge drs-active';
        f1DrsBadge.textContent = 'DRS ACTIVE';
    } else {
        f1DrsBadge.className = 'drs-status-badge drs-closed';
        f1DrsBadge.textContent = gap <= 1.0 ? 'DRS DETECTED' : 'DRS CLOSED';
    }

    // ================= OPTION 2 (CENTER HERO): GEAR & SPEED =================
    f1GearNum.textContent = gear;
    f1SpeedNum.textContent = Math.round(speed);
    f1RpmText.textContent = `${rpm.toLocaleString()} RPM`;

    // ================= OPTION 3 (RIGHT): BATTERY SOC % & ERS =================
    f1SocVal.textContent = soc.toFixed(1);
    f1SocBar.style.width = `${Math.min(100, Math.max(0, soc))}%`;

    f1SocDisplay.className = 'soc-display';
    if (soc <= 15.0) {
        f1SocDisplay.classList.add('soc-critical');
        f1SocBar.style.backgroundColor = 'var(--neon-red)';
    } else if (soc <= 35.0) {
        f1SocDisplay.classList.add('soc-warning');
        f1SocBar.style.backgroundColor = 'var(--neon-yellow)';
    } else {
        f1SocDisplay.classList.add('soc-optimal');
        f1SocBar.style.backgroundColor = 'var(--neon-green)';
    }

    // MGU-K Deploy / Regen Tag
    if (deployKw > 10) {
        f1DeployTag.className = 'ers-deploy-tag tag-deploy';
        f1DeployTag.textContent = `+${Math.round(deployKw)} kW MGU-K DEPLOY`;
    } else if (deployKw < -10) {
        f1DeployTag.className = 'ers-deploy-tag tag-regen';
        f1DeployTag.textContent = `${Math.round(deployKw)} kW MGU-K REGEN`;
    } else {
        f1DeployTag.className = 'ers-deploy-tag';
        f1DeployTag.style.background = '#141b27';
        f1DeployTag.style.color = '#94a3b8';
        f1DeployTag.textContent = '0 kW ENERGY NEUTRAL';
    }

    // Risk / Reward
    f1RrVal.textContent = rr.ratio || '1.2 : 1';

    // ================= OPTION 4 (BOTTOM): PIT WALL DIRECTIVE BANNER =================
    f1DirectiveText.textContent = directive;
    f1DirectiveReason.textContent = reasoning || 'Executing real-time powertrain deployment strategy.';

    if (mode === 'Overtake' || directive.includes('OVERTAKE')) {
        f1DirectiveStrip.className = 'lcd-directive-strip alert-overtake';
    } else if (mode === 'Harvest') {
        f1DirectiveStrip.className = 'lcd-directive-strip alert-harvest';
    } else {
        f1DirectiveStrip.className = 'lcd-directive-strip';
    }
}

/**
 * 5. Update 15-LED RPM Shift Lights Bar
 * Grounded in FastF1 2023 Monza GP Car 16 telemetry:
 * Racing range: 8,800 RPM (10th percentile racing throttle) to 12,650 RPM (8th gear main straight redline).
 * 5 Green (8,800 - 10,080 RPM): Powerband entry
 * 5 Red   (10,080 - 11,360 RPM): Optimal torque plateau
 * 5 Blue  (11,360 - 12,650 RPM): Redline shift point flash
 */
function updateShiftLights(rpm) {
    const minRpm = 8800;
    const maxRpm = 12650;
    const clampedRpm = Math.max(minRpm, Math.min(maxRpm, rpm));
    const pct = (clampedRpm - minRpm) / (maxRpm - minRpm);
    const activeCount = Math.round(pct * 15);

    for (let i = 0; i < 15; i++) {
        const led = document.getElementById(`led${i}`);
        if (!led) continue;
        if (i < activeCount) {
            led.classList.add('active');
        } else {
            led.classList.remove('active');
        }
    }
}

/**
 * 6. Continuous Hands-Free Full-Duplex Intercom
 */
async function startContinuousVoiceIntercom() {
    if (isIntercomStarted || !window.radioAudio) return;

    window.radioAudio.onVolumeChange = (vol) => {
        if (driverVoiceBar) {
            driverVoiceBar.style.width = `${Math.min(100, Math.round(vol * 100))}%`;
        }
    };

    const ok = await window.radioAudio.startContinuousIntercom((base64Pcm) => {
        if (audioWs && audioWs.readyState === WebSocket.OPEN) {
            audioWs.send(JSON.stringify({
                type: 'audio_stream',
                sender: 'driver',
                room_code: currentRoomCode,
                audio: base64Pcm
            }));
        }
    });

    if (ok) {
        isIntercomStarted = true;
        console.log('[F1 WHEEL] Continuous hands-free mic streaming active.');
    }
}

function handleIntercomMessage(msg) {
    if (msg.type === 'audio_status') {
        isCoachOnline = Boolean(msg.coach_online);
        f1CoachStatus.textContent = isCoachOnline ? 'COACH ONLINE' : 'COACH STANDBY';
        f1CoachStatus.style.borderColor = isCoachOnline ? 'var(--neon-green)' : '#475569';
        f1CoachStatus.style.color = isCoachOnline ? 'var(--neon-green)' : '#94a3b8';
    } else if (msg.type === 'audio_stream') {
        // Continuous live voice from Coach!
        if (window.radioAudio && msg.audio) {
            window.radioAudio.playRemotePcmChunk(msg.audio);
        }
    } else if (msg.type === 'coach_directive') {
        // Real-time strategic directive sent from Pit Wall Coach Console
        f1DirectiveText.textContent = msg.directive || 'HOLD BALANCED PACE';
        f1DirectiveReason.textContent = "COACH DIRECTIVE VIA PIT RADIO";
        if (msg.directive && msg.directive.includes('OVERTAKE')) {
            f1DirectiveStrip.className = 'lcd-directive-strip alert-overtake';
        } else if (msg.directive && msg.directive.includes('HARVEST')) {
            f1DirectiveStrip.className = 'lcd-directive-strip alert-harvest';
        }
    } else if (msg.type === 'radio_call') {
        // Synthesized Coach team radio directive
        if (window.radioAudio) {
            window.radioAudio.dispatchRadioVoice(msg.text);
        }
        f1DirectiveText.textContent = `COACH: ${msg.command}`;
        f1DirectiveReason.textContent = msg.text;
    }
}

function toggleDriverMute() {
    if (window.radioAudio) {
        const muted = window.radioAudio.toggleMute();
        if (muted) {
            btnDriverMute.classList.add('muted');
            btnDriverMute.textContent = 'UNMUTE MIC';
            driverVoiceBar.style.width = '0%';
        } else {
            btnDriverMute.classList.remove('muted');
            btnDriverMute.textContent = 'MUTE MIC';
        }
    }
}

// User click unlocks audio context
document.addEventListener('click', () => {
    if (window.radioAudio) {
        window.radioAudio.initAudioContext();
    }
}, { once: false });

window.addEventListener('DOMContentLoaded', () => {
    initSessionRoom();
});

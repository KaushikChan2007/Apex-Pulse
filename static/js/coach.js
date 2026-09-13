/**
 * Apex Pulse - Haas F1 Team Race Engineering Pit Wall Logic
 * Authentic 3-column dense telemetry pit wall dashboard:
 * 1. Multi-device 6-digit session code synchronization across separate laptops.
 * 2. Full-duplex continuous open-mic radio intercom between Driver HUD & Coach.
 * 3. Haas F1 Team telemetry: ERS radial gauge, tyre thermal chassis wireframe,
 *    gap to car ahead, lap delta vs best, sector times table, lap timeline scrubber.
 * 4. Gemini AI Telemetry Analyst (live insights feed & collapsible tactical Q&A).
 * 5. Track Map view (Yas Marina dual-car tracking) & Strategy view (25-lap forecast & FIA sentinel).
 */

let currentRoomCode = "849201";
let telemetryWs = null;
let audioWs = null;
let isReplayPlaying = false;
let currentReplayLap = 28;
let totalLaps = 58;
let currentSpeed = 1.0;
let isIntercomStarted = false;
let isDriverOnline = false;
let serverLanIp = "127.0.0.1";
let lastAutoInsightTime = 0;

// Chart references
let chartGapAheadInstance = null;
let chartLapDeltaInstance = null;
let forecastChart = null;

// Clock & Session Timers
let sessionElapsedSeconds = 32 * 60 + 17; // Initial 32:17
let clockInterval = null;
let sessionTimerInterval = null;

// Telemetry rolling buffer
const MAX_BUFFER = 25;
const streamBuffer = {
    labels: [],
    speed: [],
    closingSpeed: [],
    gap: [],
    soc: [],
    deploy: []
};

// DOM Elements
const coachSessionModal = document.getElementById('coachSessionModal');
const coachInputRoomCode = document.getElementById('coachInputRoomCode');
const coachRoomDisplay = document.getElementById('coachRoomDisplay');
const coachIntercomStatusText = document.getElementById('coachIntercomStatusText');
const coachMicMeter = document.getElementById('coachMicMeter');
const btnCoachMute = document.getElementById('btnCoachMute');
const radioDot = document.getElementById('radioDot');
const wsStatusBadge = document.getElementById('wsStatusBadge');

const localClockDisplay = document.getElementById('localClockDisplay');
const sessionTimerDisplay = document.getElementById('sessionTimerDisplay');

const btnPlayPause = document.getElementById('btnPlayPause');
const playIcon = document.getElementById('playIcon');
const playText = document.getElementById('playText');
const lapScrubber = document.getElementById('lapScrubber');
const timelinePinLabel = document.getElementById('timelinePinLabel');

// Left Column Elements
const valGapDisplay = document.getElementById('valGapDisplay');
const valGapDeltaDisplay = document.getElementById('valGapDeltaDisplay');
const valLapDeltaDisplay = document.getElementById('valLapDeltaDisplay');

const sec1Current = document.getElementById('sec1Current');
const sec1Best = document.getElementById('sec1Best');
const sec1Delta = document.getElementById('sec1Delta');
const sec2Current = document.getElementById('sec2Current');
const sec2Best = document.getElementById('sec2Best');
const sec2Delta = document.getElementById('sec2Delta');
const sec3Current = document.getElementById('sec3Current');
const sec3Best = document.getElementById('sec3Best');
const sec3Delta = document.getElementById('sec3Delta');

// Center Column Hero ERS & Gauges
const ersGaugeFill = document.getElementById('ersGaugeFill');
const ersLevelPctDisplay = document.getElementById('ersLevelPctDisplay');
const ersEnergyRemainingDisplay = document.getElementById('ersEnergyRemainingDisplay');
const valEnergyUsed = document.getElementById('valEnergyUsed');
const valEnergyRecovered = document.getElementById('valEnergyRecovered');

const valHeroSpeed = document.getElementById('valHeroSpeed');
const valSpeedDelta = document.getElementById('valSpeedDelta');
const valHeroRpm = document.getElementById('valHeroRpm');
const valRpmDelta = document.getElementById('valRpmDelta');

const valThrottlePct = document.getElementById('valThrottlePct');
const barThrottle = document.getElementById('barThrottle');
const valBrakePct = document.getElementById('valBrakePct');
const barBrake = document.getElementById('barBrake');

const valHeroGear = document.getElementById('valHeroGear');
const valHeroModeName = document.getElementById('valHeroModeName');
const badgeHeroErsMode = document.getElementById('badgeHeroErsMode');

// Tyre Thermal Badges
const badgeFlTemp = document.getElementById('badgeFlTemp');
const valFlTemp = document.getElementById('valFlTemp');
const badgeFrTemp = document.getElementById('badgeFrTemp');
const valFrTemp = document.getElementById('valFrTemp');
const badgeRlTemp = document.getElementById('badgeRlTemp');
const valRlTemp = document.getElementById('valRlTemp');
const badgeRrTemp = document.getElementById('badgeRrTemp');
const valRrTemp = document.getElementById('valRrTemp');

const badgeCompound = document.getElementById('badgeCompound');
const valCompoundName = document.getElementById('valCompoundName');
const valTyreStintLaps = document.getElementById('valTyreStintLaps');

// Lap & Position
const valHeroCurrentLap = document.getElementById('valHeroCurrentLap');
const valHeroPosition = document.getElementById('valHeroPosition');
const valHeroBestLap = document.getElementById('valHeroBestLap');
const valHeroLastLap = document.getElementById('valHeroLastLap');
const valHeroLapDeltaTag = document.getElementById('valHeroLapDeltaTag');

// Gemini AI Telemetry Analyst Elements
const geminiModelSelect = document.getElementById('geminiModelSelect');
const geminiStatusPill = document.getElementById('geminiStatusPill');
const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
const btnConnectGemini = document.getElementById('btnConnectGemini');
const geminiLiveFeedList = document.getElementById('geminiLiveFeedList');

const insightCard1Text = document.getElementById('insightCard1Text');
const insightCard1Time = document.getElementById('insightCard1Time');
const insightCard2Text = document.getElementById('insightCard2Text');
const insightCard2Time = document.getElementById('insightCard2Time');
const insightCard3Text = document.getElementById('insightCard3Text');
const insightCard3Time = document.getElementById('insightCard3Time');

const qaChevron = document.getElementById('qaChevron');
const qaDrawerContent = document.getElementById('qaDrawerContent');
const chatMessagesFeed = document.getElementById('chatMessagesFeed');
const chatQueryInput = document.getElementById('chatQueryInput');
const btnSendChat = document.getElementById('btnSendChat');

let currentGeminiKey = localStorage.getItem('apex_gemini_key') || '';
let isGeminiConnected = false;

// Track Map Elements (Yas Marina)
const circuitTrackPath = document.getElementById('circuitTrackPath');
const car16MarkerGroup = document.getElementById('car16MarkerGroup');
const car1LeaderGroup = document.getElementById('car1LeaderGroup');
const circuitSectorDisplay = document.getElementById('circuitSectorDisplay');
const circuitDrsDisplay = document.getElementById('circuitDrsDisplay');
const circuitSpeedDisplay = document.getElementById('circuitSpeedDisplay');
const trackProgressVal = document.getElementById('trackProgressVal');
const trackLeaderGapVal = document.getElementById('trackLeaderGapVal');
const trackDeployVal = document.getElementById('trackDeployVal');
const trackSocVal = document.getElementById('trackSocVal');

// Strategy & Compliance Elements
const complianceStatusText = document.getElementById('complianceStatusText');
const alwaysPushDryText = document.getElementById('alwaysPushDryText');
const recomSurviveText = document.getElementById('recomSurviveText');
const dryAlertPill = document.getElementById('dryAlertPill');
const ruleDrsIcon = document.getElementById('ruleDrsIcon');
const ruleSocIcon = document.getElementById('ruleSocIcon');
const ruleThermalIcon = document.getElementById('ruleThermalIcon');
let lastForecastLap = -1;

// Race Summary Modal Elements
const raceSummaryModal = document.getElementById('raceSummaryModal');
const sumOvertakeAttempts = document.getElementById('sumOvertakeAttempts');
const sumOvertakeSuccess = document.getElementById('sumOvertakeSuccess');
const sumSuccessRate = document.getElementById('sumSuccessRate');
const sumEnergyDeployed = document.getElementById('sumEnergyDeployed');
const sumMinSoc = document.getElementById('sumMinSoc');
const sumMaxSpeed = document.getElementById('sumMaxSpeed');
const stintTableBody = document.getElementById('stintTableBody');

/**
 * -----------------------------------------------------------------------------
 * 1. REAL-TIME CLOCK & SESSION TIMER
 * -----------------------------------------------------------------------------
 */
function initClocks() {
    // 1. Live Local Clock (HH:MM:SS)
    function updateClock() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        if (localClockDisplay) {
            localClockDisplay.textContent = `${hrs}:${mins}:${secs}`;
        }
    }
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);

    // 2. Session Timer (MM:SS)
    function updateSessionTimer() {
        if (isReplayPlaying) {
            sessionElapsedSeconds++;
        }
        const m = Math.floor(sessionElapsedSeconds / 60);
        const s = sessionElapsedSeconds % 60;
        if (sessionTimerDisplay) {
            sessionTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(updateSessionTimer, 1000);
}

/**
 * -----------------------------------------------------------------------------
 * 2. 6-DIGIT MULTI-DEVICE SESSION MANAGEMENT
 * -----------------------------------------------------------------------------
 */
async function initSessionRoom() {
    const params = new URLSearchParams(window.location.search);
    const codeInUrl = params.get('code');

    if (codeInUrl && codeInUrl.trim().length === 6) {
        currentRoomCode = codeInUrl.trim().toUpperCase();
        localStorage.setItem('apex_room_code', currentRoomCode);
    } else {
        const savedCode = localStorage.getItem('apex_room_code');
        if (savedCode && savedCode.length === 6) {
            currentRoomCode = savedCode;
        }
    }

    if (coachRoomDisplay) {
        coachRoomDisplay.textContent = `#${currentRoomCode}`;
    }

    // Detect server local LAN IP
    try {
        const resp = await fetch('/api/network/info');
        const netInfo = await resp.json();
        if (netInfo && netInfo.local_ip) {
            serverLanIp = netInfo.local_ip;
        }
    } catch (e) {
        serverLanIp = window.location.hostname;
    }

    connectToRoom(currentRoomCode);
}

function openCoachSessionModal() {
    if (coachSessionModal) {
        coachSessionModal.classList.add('active');
        if (coachInputRoomCode) {
            coachInputRoomCode.value = currentRoomCode;
            coachInputRoomCode.focus();
        }
    }
}

function closeCoachSessionModal() {
    if (coachSessionModal) {
        coachSessionModal.classList.remove('active');
    }
}

function submitCoachRoomCode() {
    const val = (coachInputRoomCode?.value || '').trim().toUpperCase();
    if (val.length !== 6) {
        alert('Please enter a valid 6-digit session code (e.g. 849201).');
        return;
    }
    currentRoomCode = val;
    localStorage.setItem('apex_room_code', currentRoomCode);
    if (coachRoomDisplay) coachRoomDisplay.textContent = `#${currentRoomCode}`;
    closeCoachSessionModal();

    // Update URL parameter without reload
    const newUrl = `${window.location.pathname}?code=${currentRoomCode}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    connectToRoom(currentRoomCode);
}

function copyDriverLanUrl() {
    const port = window.location.port ? `:${window.location.port}` : '';
    const host = serverLanIp === '127.0.0.1' ? window.location.hostname : serverLanIp;
    const url = `http://${host}${port}/driver?code=${currentRoomCode}`;

    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.btn-copy-driver-url');
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = 'COPIED!';
            btn.style.background = 'var(--neon-green)';
            btn.style.color = '#050505';
            setTimeout(() => {
                btn.textContent = orig;
                btn.style.background = '';
                btn.style.color = '';
            }, 1800);
        }
    });
}

function openDriverHUD() {
    const port = window.location.port ? `:${window.location.port}` : '';
    const host = serverLanIp === '127.0.0.1' ? window.location.hostname : serverLanIp;
    const url = `http://${host}${port}/driver?code=${currentRoomCode}`;
    window.open(url, '_blank');
}

/**
 * -----------------------------------------------------------------------------
 * 3. WEBSOCKET CONNECTIONS (TELEMETRY & AUDIO)
 * -----------------------------------------------------------------------------
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

    // 1. Telemetry Stream WebSocket
    telemetryWs = new WebSocket(`${wsProto}//${host}/ws/telemetry/${roomCode}`);

    telemetryWs.onopen = () => {
        console.log(`[COACH] Connected to Telemetry Stream for room #${roomCode}.`);
        if (wsStatusBadge) {
            wsStatusBadge.className = 'telemetry-conn-indicator';
            const dot = wsStatusBadge.querySelector('.dot-online');
            if (dot) dot.style.background = 'var(--neon-green)';
            const title = wsStatusBadge.querySelector('.conn-status-title');
            if (title) title.textContent = 'Telemetry Connected';
        }
    };

    telemetryWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'telemetry_frame') {
                processTelemetryFrame(data);
            } else if (data.type === 'control_ack') {
                syncReplayControlState(data.replay_status);
            }
        } catch (e) {
            console.error('[COACH] Parse error:', e);
        }
    };

    telemetryWs.onclose = () => {
        if (wsStatusBadge) {
            const dot = wsStatusBadge.querySelector('.dot-online');
            if (dot) dot.style.background = '#ef4444';
            const title = wsStatusBadge.querySelector('.conn-status-title');
            if (title) title.textContent = 'Reconnecting...';
        }
        setTimeout(() => {
            if (telemetryWs === null || telemetryWs.readyState === WebSocket.CLOSED) {
                connectToRoom(currentRoomCode);
            }
        }, 2000);
    };

    // 2. Full-Duplex Continuous Audio Intercom WebSocket
    audioWs = new WebSocket(`${wsProto}//${host}/ws/audio/${roomCode}?role=coach`);

    audioWs.onopen = () => {
        console.log(`[COACH] Audio Intercom Channel connected for room #${roomCode}.`);
        startContinuousCoachMic();
        // Keepalive heartbeat to keep cloud proxy WebSocket connections alive (e.g. Render 55s timeout)
        if (window.coachAudioPingInterval) clearInterval(window.coachAudioPingInterval);
        window.coachAudioPingInterval = setInterval(() => {
            if (audioWs && audioWs.readyState === WebSocket.OPEN) {
                audioWs.send(JSON.stringify({ type: 'ping' }));
            }
        }, 15000);
    };

    audioWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pong') return; // Heartbeat response
            handleAudioIntercomMessage(msg);
        } catch (e) {
            console.error('[COACH] Audio WS error:', e);
        }
    };

    audioWs.onclose = () => {
        if (coachIntercomStatusText) {
            coachIntercomStatusText.textContent = 'RADIO DISCONNECTED';
        }
        if (radioDot) radioDot.classList.remove('active');
        if (window.coachAudioPingInterval) clearInterval(window.coachAudioPingInterval);
    };
}

/**
 * -----------------------------------------------------------------------------
 * 4. CONTINUOUS AUDIO INTERCOM HANDLERS
 * -----------------------------------------------------------------------------
 */
async function startContinuousCoachMic() {
    if (isIntercomStarted || !window.radioAudio) return;

    window.radioAudio.onVolumeChange = (vol) => {
        if (coachMicMeter) {
            coachMicMeter.style.width = `${Math.min(100, Math.round(vol * 100))}%`;
        }
    };

    const ok = await window.radioAudio.startContinuousIntercom((base64Pcm) => {
        if (audioWs && audioWs.readyState === WebSocket.OPEN) {
            audioWs.send(JSON.stringify({
                type: 'audio_stream',
                sender: 'coach',
                room_code: currentRoomCode,
                audio: base64Pcm
            }));
        }
    });

    if (ok) {
        isIntercomStarted = true;
        if (coachIntercomStatusText) coachIntercomStatusText.textContent = 'PIT RADIO OPEN';
        if (radioDot) radioDot.classList.add('active');
        console.log('[COACH] Continuous pit wall mic streaming active.');
    }
}

function toggleCoachMute() {
    if (window.radioAudio) {
        const muted = window.radioAudio.toggleMute();
        if (muted) {
            btnCoachMute.classList.add('muted');
            btnCoachMute.textContent = 'UNMUTE';
            coachMicMeter.style.width = '0%';
            if (coachIntercomStatusText) coachIntercomStatusText.textContent = 'MIC MUTED';
        } else {
            btnCoachMute.classList.remove('muted');
            btnCoachMute.textContent = 'MUTE';
            if (coachIntercomStatusText) coachIntercomStatusText.textContent = 'PIT RADIO OPEN';
        }
    }
}

function handleAudioIntercomMessage(msg) {
    if (msg.type === 'audio_status') {
        isDriverOnline = Boolean(msg.driver_online);
        if (isDriverOnline) {
            if (coachIntercomStatusText) coachIntercomStatusText.textContent = 'RADIO LINKED // DRIVER ONLINE';
            if (radioDot) radioDot.classList.add('active');
        } else {
            if (coachIntercomStatusText) coachIntercomStatusText.textContent = 'PIT RADIO OPEN (WAITING DRIVER)';
        }
    } else if (msg.type === 'audio_stream') {
        // Continuous voice audio from Driver's helmet mic
        if (window.radioAudio && msg.audio) {
            window.radioAudio.playRemotePcmChunk(msg.audio);
        }
    }
}

/**
 * -----------------------------------------------------------------------------
 * 5. PROCESS INCOMING TELEMETRY FRAME (HAAS PIT WALL DASHBOARD)
 * -----------------------------------------------------------------------------
 */
function processTelemetryFrame(frame) {
    const tel = frame.telemetry || {};
    const rec = frame.recommendation || {};
    const timing = frame.timing_stats || {};
    const energy = frame.energy_stats || {};
    const tyres = frame.tyre_stats || {};
    const sectors = frame.sector_times || {};
    const rep = frame.replay_status || {};
    const comp = frame.compliance || 'COMPLIANT';
    const compDetail = frame.compliance_detail || {};

    // 1. Sync Replay State
    syncReplayControlState(rep);

    currentReplayLap = timing.current_lap || frame.lap || 28;
    totalLaps = timing.total_laps || 58;

    // 2. Left Column: Gap to Car Ahead & Lap Delta
    const currentGap = tel.gap_sec !== undefined ? tel.gap_sec : 1.42;
    if (valGapDisplay) valGapDisplay.textContent = `${currentGap.toFixed(2)}s`;

    if (valGapDeltaDisplay) {
        const gapDelta = frame.gap_delta_vs_last || '+0.36s';
        valGapDeltaDisplay.innerHTML = `↑ ${gapDelta} <span class="tag-sub">(vs. last lap)</span>`;
    }

    const lapDeltaVsBest = timing.delta_vs_best || '-0.24s';
    if (valLapDeltaDisplay) valLapDeltaDisplay.textContent = lapDeltaVsBest;

    // Update Chart.js traces
    if (chartGapAheadInstance) {
        // Smoothly interpolate current gap into active index
        chartGapAheadInstance.data.datasets[0].data[5] = currentGap;
        chartGapAheadInstance.update('none');
    }
    if (chartLapDeltaInstance) {
        const deltaVal = parseFloat(lapDeltaVsBest);
        if (!isNaN(deltaVal)) {
            chartLapDeltaInstance.data.datasets[0].data[5] = deltaVal;
            chartLapDeltaInstance.update('none');
        }
    }

    // Update Sector Times Table
    if (sectors.s1) {
        if (sec1Current) sec1Current.textContent = sectors.s1.current || '28.346';
        if (sec1Best) sec1Best.textContent = sectors.s1.best || '28.112';
        if (sec1Delta) sec1Delta.textContent = sectors.s1.delta || '+0.234';
    }
    if (sectors.s2) {
        if (sec2Current) sec2Current.textContent = sectors.s2.current || '32.781';
        if (sec2Best) sec2Best.textContent = sectors.s2.best || '32.450';
        if (sec2Delta) sec2Delta.textContent = sectors.s2.delta || '+0.331';
    }
    if (sectors.s3) {
        if (sec3Current) sec3Current.textContent = sectors.s3.current || '24.502';
        if (sec3Best) sec3Best.textContent = sectors.s3.best || '24.310';
        if (sec3Delta) sec3Delta.textContent = sectors.s3.delta || '+0.192';
    }

    // 3. Center Column: Hero Battery / ERS Gauge
    const ersPct = energy.ers_level_pct !== undefined ? energy.ers_level_pct : (tel.battery_soc_pct !== undefined ? tel.battery_soc_pct : 62);
    if (ersLevelPctDisplay) ersLevelPctDisplay.textContent = `${Math.round(ersPct)}%`;

    const energyRem = energy.energy_remaining_mj !== undefined ? energy.energy_remaining_mj : ((ersPct / 100.0) * 4.0);
    if (ersEnergyRemainingDisplay) ersEnergyRemainingDisplay.textContent = `${energyRem.toFixed(1)} MJ`;

    // Radial Gauge Progress (radius 82, circumference = 2 * PI * 82 = 515.22)
    if (ersGaugeFill) {
        const circumference = 515.22;
        const clampedPct = Math.max(0, Math.min(100, ersPct));
        const offset = circumference - (circumference * (clampedPct / 100.0));
        ersGaugeFill.style.strokeDashoffset = offset;

        if (clampedPct > 50) {
            ersGaugeFill.style.stroke = 'var(--neon-green)';
            ersGaugeFill.style.filter = 'drop-shadow(0 0 8px rgba(0, 229, 153, 0.6))';
        } else if (clampedPct >= 25) {
            ersGaugeFill.style.stroke = 'var(--accent-amber)';
            ersGaugeFill.style.filter = 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.6))';
        } else {
            ersGaugeFill.style.stroke = 'var(--haas-red)';
            ersGaugeFill.style.filter = 'drop-shadow(0 0 8px rgba(225, 6, 0, 0.6))';
        }
    }

    // Energy stats
    if (valEnergyUsed) valEnergyUsed.textContent = `${(energy.energy_used_mj || 1.8).toFixed(1)} MJ`;
    if (valEnergyRecovered) valEnergyRecovered.textContent = `${(energy.energy_recovered_mj || 2.6).toFixed(1)} MJ`;

    // Speed & RPM
    const speed = tel.speed_kph !== undefined ? Math.round(tel.speed_kph) : 248;
    if (valHeroSpeed) valHeroSpeed.textContent = speed;
    if (valSpeedDelta) valSpeedDelta.textContent = frame.speed_delta || '↑ 12';

    const rpm = tel.rpm !== undefined ? tel.rpm : 11234;
    if (valHeroRpm) valHeroRpm.textContent = rpm;
    if (valRpmDelta) valRpmDelta.textContent = frame.rpm_delta || '↑ 320';

    // Throttle & Brake Meters
    const throttle = tel.throttle_pct !== undefined ? tel.throttle_pct : 78;
    if (valThrottlePct) valThrottlePct.textContent = `${throttle}%`;
    if (barThrottle) barThrottle.style.width = `${throttle}%`;

    const brake = tel.brake_pct !== undefined ? tel.brake_pct : 12;
    if (valBrakePct) valBrakePct.textContent = `${brake}%`;
    if (barBrake) barBrake.style.width = `${brake}%`;

    // Gear & Mode
    if (valHeroGear) valHeroGear.textContent = tel.gear || 7;
    const mode = rec.mode || 'Deploy';
    if (valHeroModeName) valHeroModeName.textContent = mode;

    if (badgeHeroErsMode) {
        if (mode === 'Overtake') {
            badgeHeroErsMode.style.borderColor = 'var(--neon-green)';
            badgeHeroErsMode.style.color = 'var(--neon-green)';
            badgeHeroErsMode.style.background = 'rgba(0, 229, 153, 0.2)';
        } else if (mode === 'Push') {
            badgeHeroErsMode.style.borderColor = 'var(--accent-amber)';
            badgeHeroErsMode.style.color = 'var(--accent-amber)';
            badgeHeroErsMode.style.background = 'rgba(245, 158, 11, 0.2)';
        } else if (mode === 'Harvest') {
            badgeHeroErsMode.style.borderColor = 'var(--accent-cyan)';
            badgeHeroErsMode.style.color = 'var(--accent-cyan)';
            badgeHeroErsMode.style.background = 'rgba(0, 200, 230, 0.2)';
        } else {
            badgeHeroErsMode.style.borderColor = '#94a3b8';
            badgeHeroErsMode.style.color = '#ffffff';
            badgeHeroErsMode.style.background = 'rgba(148, 163, 184, 0.15)';
        }
    }

    // 4. Tyre Temperatures (°C)
    updateTyreBadge(badgeFlTemp, valFlTemp, tyres.fl || 91);
    updateTyreBadge(badgeFrTemp, valFrTemp, tyres.fr || 93);
    updateTyreBadge(badgeRlTemp, valRlTemp, tyres.rl || 88);
    updateTyreBadge(badgeRrTemp, valRrTemp, tyres.rr || 90);

    if (valCompoundName) valCompoundName.textContent = tyres.compound || 'Soft';
    if (valTyreStintLaps) {
        const lapsOn = tyres.laps_on_set || 12;
        const totLaps = tyres.total_compound_laps || 20;
        valTyreStintLaps.textContent = `${lapsOn} / ${totLaps}`;
    }

    // 5. Lap & Position
    if (valHeroCurrentLap) {
        valHeroCurrentLap.innerHTML = `${currentReplayLap} <span class="lp-sub">/ ${totalLaps}</span>`;
    }
    if (valHeroPosition) valHeroPosition.textContent = timing.position || 'P6';
    if (valHeroBestLap) valHeroBestLap.textContent = timing.best_lap || '1:21.345';
    if (valHeroLastLap) valHeroLastLap.textContent = timing.last_lap || '1:22.487';
    if (valHeroLapDeltaTag) {
        valHeroLapDeltaTag.textContent = `Lap Delta ${timing.lap_delta || '+0.142'}`;
    }

    // 6. Lap Timeline Scrubber with Dynamic Marker Pin
    if (lapScrubber) {
        lapScrubber.value = currentReplayLap;
        lapScrubber.max = totalLaps;
    }
    if (timelinePinLabel) {
        timelinePinLabel.textContent = `Lap ${currentReplayLap}`;
        const pinPct = Math.max(0, Math.min(100, ((currentReplayLap - 1) / (totalLaps - 1)) * 100));
        timelinePinLabel.style.left = `${pinPct}%`;
    }

    // 7. Live Metrics: Closing Speed, Risk/Reward, Deploy kW, Compound Badge
    const valClosingTag = document.getElementById('valClosingSpeedTag');
    if (valClosingTag) {
        const cVal = tel.closing_speed_kph !== undefined ? tel.closing_speed_kph : 0.0;
        valClosingTag.textContent = `CLOSING: ${cVal >= 0 ? '+' : ''}${cVal.toFixed(1)} KM/H`;
    }

    const probDisp = document.getElementById('valSuccessProbDisplay');
    if (probDisp && rec.success_prob !== undefined) {
        probDisp.textContent = `AI CONFIDENCE: ${Math.round(rec.success_prob * 100)}%`;
    }

    const rrDisp = document.getElementById('valRiskRewardDisplay');
    if (rrDisp && frame.risk_reward) {
        rrDisp.textContent = `RISK/REWARD: ${frame.risk_reward.ratio} [${frame.risk_reward.label}]`;
    }

    const deployKwHero = document.getElementById('valDeployKwHero');
    if (deployKwHero && tel.deploy_kw !== undefined) {
        const dVal = tel.deploy_kw;
        const dTag = dVal > 80 ? '[BOOST]' : dVal > 0 ? '[DEPLOY]' : '[REGEN]';
        deployKwHero.textContent = `${dVal >= 0 ? '+' : ''}${Math.round(dVal)} kW ${dTag}`;
    }

    if (badgeCompound && tyres.compound_short) {
        badgeCompound.textContent = tyres.compound_short;
        badgeCompound.className = `compound-mini-badge badge-${(tyres.compound || 'soft').toLowerCase()}`;
    }

    const coachDirDisp = document.getElementById('coachDirectiveDisplay');
    if (coachDirDisp && frame.coach_directive) {
        coachDirDisp.textContent = frame.coach_directive;
    }

    // One-Line Inline AI Tactical Insight Banner
    const inlineAi = document.getElementById('inlineAiInsightText');
    if (inlineAi) {
        if (mode === 'Overtake') {
            inlineAi.textContent = `GOING RIGHT: Slipstream delta (+${(tel.closing_speed_kph || 8.4).toFixed(1)} km/h) & DRS allow clean pass into Turn 1. GOING WRONG: Full MGU-K deploy drains battery; plan regen exit.`;
        } else if (mode === 'Push') {
            inlineAi.textContent = `GOING RIGHT: High pace delta through Curva Grande. GOING WRONG: Tyre surface temperatures approaching 100°C threshold.`;
        } else if (mode === 'Harvest') {
            inlineAi.textContent = `GOING RIGHT: Regenerating +${Math.abs(tel.deploy_kw || 45).toFixed(0)} kW into Variante della Roggia braking zone. GOING WRONG: Gap to Sterling temporarily widening.`;
        } else {
            inlineAi.textContent = `GOING RIGHT: Balanced thermal equilibrium & safe reserve floor. GOING WRONG: Trailing Sterling in turbulent dirty air; hold 0.5s slipstream range.`;
        }
    }

    // 8. FIA Compliance Sentinel
    updateComplianceAudit(comp, compDetail);

    // 9. Track Map Circuit Animation
    updateCircuitSimulation(frame.t_in_lap, tel, frame);

    // 10. Strategy View Live Forecast
    if (frame.lap && frame.lap !== lastForecastLap) {
        lastForecastLap = frame.lap;
        const liveSoc = energy.ers_level_pct !== undefined ? energy.ers_level_pct : (tel.battery_soc_pct !== undefined ? tel.battery_soc_pct : 62.0);
        const lapsRem = Math.max(1, (timing.total_laps || totalLaps || 51) - (timing.current_lap || frame.lap));
        const liveGap = tel.gap_sec !== undefined ? tel.gap_sec : 1.42;
        loadForecastData(liveSoc, lapsRem, liveGap);
    }

    // 11. Auto Gemini AI Insights during active playback
    const now = Date.now();
    if (isReplayPlaying && (now - lastAutoInsightTime > 8000)) {
        lastAutoInsightTime = now;
        requestGeminiInsight();
    }
}

/**
 * Updates Tyre Heat Badges with dynamic motorsport color coding
 */
function updateTyreBadge(badgeEl, textEl, temp) {
    if (!badgeEl || !textEl) return;
    textEl.textContent = `${Math.round(temp)}°C`;

    if (temp < 80) {
        badgeEl.style.borderColor = '#38bdf8';
        textEl.style.color = '#38bdf8';
        badgeEl.style.boxShadow = '0 0 6px rgba(56, 189, 248, 0.3)';
    } else if (temp <= 104) {
        badgeEl.style.borderColor = '#00e599';
        textEl.style.color = '#00e599';
        badgeEl.style.boxShadow = '0 0 8px rgba(0, 229, 153, 0.4)';
    } else if (temp <= 114) {
        badgeEl.style.borderColor = '#f59e0b';
        textEl.style.color = '#f59e0b';
        badgeEl.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.4)';
    } else {
        badgeEl.style.borderColor = '#e10600';
        textEl.style.color = '#e10600';
        badgeEl.style.boxShadow = '0 0 10px rgba(225, 6, 0, 0.6)';
    }
}

/**
 * -----------------------------------------------------------------------------
 * 6. LAYER 2: SECONDARY TAB SWITCHING & DRAWER CONTROLS
 * -----------------------------------------------------------------------------
 */
function selectSecondaryTab(tabId) {
    const tabMap = {
        'trackmap': { btn: 'tabBtnTrackMap', panel: 'tabPanelTrackMap' },
        'sectors': { btn: 'tabBtnSectors', panel: 'tabPanelSectors' },
        'summary': { btn: 'tabBtnSummary', panel: 'tabPanelSummary' },
        'strategy': { btn: 'tabBtnStrategy', panel: 'tabPanelStrategy' },
        'notes': { btn: 'tabBtnNotes', panel: 'tabPanelNotes' }
    };

    document.querySelectorAll('.sec-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sec-tab-panel').forEach(p => p.classList.remove('active'));

    const target = tabMap[tabId];
    if (target) {
        const btn = document.getElementById(target.btn);
        const panel = document.getElementById(target.panel);
        if (btn) btn.classList.add('active');
        if (panel) panel.classList.add('active');

        if (tabId === 'strategy') {
            const liveSoc = parseFloat(ersLevelPctDisplay?.textContent) || 62.0;
            const lapsRem = Math.max(1, (totalLaps || 51) - currentReplayLap);
            const liveGap = parseFloat(valGapDisplay?.textContent) || 1.42;
            loadForecastData(liveSoc, lapsRem, liveGap);
        } else if (tabId === 'summary') {
            loadSummaryTabStats();
        }
    }
}

function switchView(viewName, btnEl) {
    selectSecondaryTab(viewName);
}

function toggleGeminiDrawer() {
    const drawer = document.getElementById('geminiChatDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    if (drawer) {
        drawer.classList.toggle('open');
        if (backdrop) {
            backdrop.classList.toggle('open', drawer.classList.contains('open'));
        }
    }
}

function dispatchCoachDirective() {
    const input = document.getElementById('inputNewDirective');
    if (!input) return;
    const text = input.value.trim().toUpperCase();
    if (!text) return;

    // 1. Update Card 6 display
    const dirDisp = document.getElementById('coachDirectiveDisplay');
    if (dirDisp) dirDisp.textContent = text;

    // 2. Add entry to Notes feed
    const feed = document.getElementById('notesLogFeed');
    if (feed) {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <span class="note-time">[LAP ${currentReplayLap} // PIT WALL DIRECTIVE]</span>
            <p class="note-text">${text}</p>
        `;
        feed.prepend(card);
    }

    // 3. Send over telemetry WebSocket
    if (telemetryWs && telemetryWs.readyState === WebSocket.OPEN) {
        telemetryWs.send(JSON.stringify({
            action: 'set_directive',
            directive: text
        }));
    }

    // 4. Send over audio intercom channel
    if (audioWs && audioWs.readyState === WebSocket.OPEN) {
        audioWs.send(JSON.stringify({
            type: 'coach_directive',
            directive: text,
            room_code: currentRoomCode
        }));
    }

    input.value = '';
}

async function loadSummaryTabStats() {
    try {
        const resp = await fetch('/api/race/summary');
        const data = await resp.json();
        const elAttempts = document.getElementById('tabSumAttempts');
        const elSuccess = document.getElementById('tabSumSuccess');
        const elRate = document.getElementById('tabSumRate');
        const elAvgSpeed = document.getElementById('tabSumAvgSpeed');
        const elPeakSpeed = document.getElementById('tabSumPeakSpeed');
        const elMinSoc = document.getElementById('tabSumMinSoc');

        if (elAttempts) elAttempts.textContent = (data.overtake_attempts || 3279).toLocaleString();
        if (elSuccess) elSuccess.textContent = (data.overtake_successes || 2822).toLocaleString();
        if (elRate) elRate.textContent = `${data.overtake_success_rate_pct || 86.1}%`;
        if (elAvgSpeed) elAvgSpeed.textContent = `${data.avg_speed_kph || 234.8} KM/H`;
        if (elPeakSpeed) elPeakSpeed.textContent = `${data.max_speed_kph || 351.4} KM/H`;
        if (elMinSoc) elMinSoc.textContent = `${data.min_battery_soc_pct || 24.0}%`;
    } catch (e) {
        console.warn('[SUMMARY TAB] Error fetching summary:', e);
    }
}

/**
 * -----------------------------------------------------------------------------
 * 7. ACTION TOOLBAR CONTROLS
 * -----------------------------------------------------------------------------
 */
function toggleReplayPlay() {
    if (!telemetryWs || telemetryWs.readyState !== WebSocket.OPEN) return;
    const nextAction = isReplayPlaying ? 'pause' : 'play';
    telemetryWs.send(JSON.stringify({ action: nextAction }));
}

function pauseReplay() {
    if (!telemetryWs || telemetryWs.readyState !== WebSocket.OPEN) return;
    telemetryWs.send(JSON.stringify({ action: 'pause' }));
}

function restartCurrentLap() {
    if (!telemetryWs || telemetryWs.readyState !== WebSocket.OPEN) return;
    telemetryWs.send(JSON.stringify({ action: 'seek_lap', lap: currentReplayLap }));
}

function onScrubLap(val) {
    if (!telemetryWs || telemetryWs.readyState !== WebSocket.OPEN) return;
    const lapNum = parseInt(val, 10);
    telemetryWs.send(JSON.stringify({ action: 'seek_lap', lap: lapNum }));
}

function setReplaySpeed(multiplier, btnEl) {
    document.querySelectorAll('.speed-pill-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    currentSpeed = multiplier;

    if (telemetryWs && telemetryWs.readyState === WebSocket.OPEN) {
        telemetryWs.send(JSON.stringify({
            action: 'set_speed',
            speed: multiplier
        }));
    }
}

function syncReplayControlState(rep) {
    if (!rep) return;
    isReplayPlaying = Boolean(rep.is_playing);
    if (isReplayPlaying) {
        if (btnPlayPause) btnPlayPause.classList.add('play-active');
        if (playIcon) playIcon.textContent = '⏸';
        if (playText) playText.textContent = 'Pause Session';
    } else {
        if (btnPlayPause) btnPlayPause.classList.remove('play-active');
        if (playIcon) playIcon.textContent = '▶';
        if (playText) playText.textContent = 'Start Session';
    }

    if (rep.speed_multiplier !== undefined) {
        const mult = parseFloat(rep.speed_multiplier);
        document.querySelectorAll('.speed-pill-btn').forEach(b => {
            const txt = b.textContent;
            if ((mult <= 0.3 && txt.includes('0.25')) ||
                (mult > 0.3 && mult <= 0.75 && txt.includes('0.5')) ||
                (mult > 0.75 && mult <= 1.5 && txt.includes('1.0')) ||
                (mult > 1.5 && txt.includes('2.0'))) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }
}

function exportTelemetryCsv() {
    window.location.href = '/api/telemetry/export';
}

function openAlertsModal() {
    alert("[APEX RACING PIT WALL NOTIFICATIONS - 2 ACTIVE]\n\n1. DRS Zone: Slipstream detection active within 1.0s window on Back Straight.\n2. MGU-K Thermal Target: Deployment optimal at 120 kW regulatory ceiling.");
}

function toggleDriverNotes() {
    const defaultNote = localStorage.getItem('apex_driver_notes') || "Target Turn 4 apex kerb clipping; maintain battery charge above 55% for lap 32 undercut attempt.";
    const note = prompt("Enter driver engineering debrief / pit wall note:", defaultNote);
    if (note !== null) {
        localStorage.setItem('apex_driver_notes', note);
        alert("Driver note saved to pit wall telemetry log.");
    }
}

/**
 * -----------------------------------------------------------------------------
 * 8. GEMINI AI TELEMETRY ANALYST (UNIVERSAL MODEL SUPPORT)
 * -----------------------------------------------------------------------------
 */
function getSelectedGeminiModel() {
    if (!geminiModelSelect) return 'gemini-1.5-flash';
    if (geminiModelSelect.value === 'custom') {
        const customInput = document.getElementById('geminiCustomModelInput');
        return (customInput && customInput.value.trim()) ? customInput.value.trim() : 'gemini-1.5-flash';
    }
    return geminiModelSelect.value;
}

function onGeminiModelChange() {
    const customInput = document.getElementById('geminiCustomModelInput');
    if (geminiModelSelect && geminiModelSelect.value === 'custom') {
        if (customInput) customInput.style.display = 'block';
    } else {
        if (customInput) customInput.style.display = 'none';
    }
    const model = getSelectedGeminiModel();
    localStorage.setItem('apex_gemini_model', model);
}

function toggleApiKeyVisibility() {
    if (geminiApiKeyInput) {
        geminiApiKeyInput.type = geminiApiKeyInput.type === 'password' ? 'text' : 'password';
    }
}

function usePreconfiguredKey() {
    const savedKey = localStorage.getItem('apex_gemini_key');
    if (savedKey && geminiApiKeyInput) {
        geminiApiKeyInput.value = savedKey;
        connectGeminiKey();
    } else {
        alert("Enter your Gemini API key (starts with AIza...) in the input field and click Connect.");
    }
}

async function connectGeminiKey() {
    const key = (geminiApiKeyInput?.value || '').trim();
    if (!key) {
        alert('Please enter a valid Google Gemini API key.');
        return;
    }

    const model = getSelectedGeminiModel();
    if (btnConnectGemini) btnConnectGemini.textContent = 'CONNECTING...';
    if (geminiStatusPill) {
        geminiStatusPill.className = 'gemini-status-indicator';
        geminiStatusPill.innerHTML = '<span class="status-dot"></span> Verifying...';
    }

    try {
        const resp = await fetch('/api/gemini/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, model: model })
        });
        const data = await resp.json();

        if (data.status === 'connected') {
            isGeminiConnected = true;
            currentGeminiKey = key;
            localStorage.setItem('apex_gemini_key', key);
            localStorage.setItem('apex_gemini_model', model);
            if (geminiStatusPill) {
                geminiStatusPill.className = 'gemini-status-indicator connected';
                geminiStatusPill.innerHTML = `<span class="status-dot"></span> Linked (${data.model || model})`;
            }
            if (btnConnectGemini) {
                btnConnectGemini.textContent = 'CONNECTED';
                btnConnectGemini.style.background = 'var(--neon-green)';
                btnConnectGemini.style.color = '#050505';
            }
            addChatMessage(
                `Pit Wall Chief Strategist AI connected via ${data.model || model}. Live FastF1 telemetry context linked.`,
                'ai',
                data.model || model
            );
        } else {
            isGeminiConnected = false;
            if (geminiStatusPill) {
                geminiStatusPill.className = 'gemini-status-indicator disconnected';
                geminiStatusPill.innerHTML = '<span class="status-dot"></span> Auth Error';
            }
            if (btnConnectGemini) btnConnectGemini.textContent = 'Retry';
            alert(data.message || 'Gemini API authentication failed.');
        }
    } catch (err) {
        console.error('[GEMINI] Connection error:', err);
        if (geminiStatusPill) {
            geminiStatusPill.className = 'gemini-status-indicator disconnected';
            geminiStatusPill.innerHTML = '<span class="status-dot"></span> Error';
        }
        if (btnConnectGemini) btnConnectGemini.textContent = 'Connect';
    }
}

async function clearGeminiKey() {
    localStorage.removeItem('apex_gemini_key');
    currentGeminiKey = '';
    if (geminiApiKeyInput) geminiApiKeyInput.value = '';
    isGeminiConnected = false;
    try {
        await fetch('/api/gemini/disconnect', { method: 'POST' });
    } catch (e) {}
    if (geminiStatusPill) {
        geminiStatusPill.className = 'gemini-status-indicator';
        geminiStatusPill.innerHTML = '<span class="status-dot"></span> Scrubbed';
    }
    if (btnConnectGemini) {
        btnConnectGemini.textContent = 'Connect';
        btnConnectGemini.style.background = '';
        btnConnectGemini.style.color = '';
    }
    addChatMessage('Gemini API key scrubbed from browser storage and server memory. High-accuracy FastF1 domain intelligence active.', 'ai');
}

async function requestGeminiInsight() {
    const soc = parseFloat(ersLevelPctDisplay?.textContent) || 62.0;
    const gap = parseFloat(valGapDisplay?.textContent) || 1.42;
    const speed = parseFloat(valHeroSpeed?.textContent) || 248.0;
    const mode = valHeroModeName?.textContent || 'Deploy';
    const drs = gap <= 1.0;
    const model = getSelectedGeminiModel();

    try {
        const resp = await fetch('/api/gemini/insight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: currentGeminiKey || null,
                model: model,
                lap: currentReplayLap,
                battery_soc_pct: soc,
                gap_sec: gap,
                closing_speed_kph: 12.0,
                drs_available: drs,
                mode: mode,
                success_prob: 0.85,
                reasoning: "FastF1 live Monza telemetry analysis"
            })
        });

        const data = await resp.json();
        if (data && data.insight) {
            updateLiveInsightCards(data.insight, currentReplayLap);
        }
    } catch (err) {
        console.warn('[GEMINI] Insight fetch notice:', err);
    }
}

function updateLiveInsightCards(insightText, lap) {
    if (insightCard1Text && insightText) {
        insightCard1Text.textContent = insightText;
        if (insightCard1Time) insightCard1Time.textContent = `Just now (Lap ${lap})`;
    }
}

function toggleQaDrawer() {
    if (qaDrawerContent) {
        qaDrawerContent.classList.toggle('open');
        if (qaChevron) {
            qaChevron.textContent = qaDrawerContent.classList.contains('open') ? '▴' : '▾';
        }
    }
}

function sendQuickPrompt(promptText) {
    if (chatQueryInput) {
        chatQueryInput.value = promptText;
        submitChatQuery();
    }
}

function onChatKey(e) {
    if (e.key === 'Enter') {
        submitChatQuery();
    }
}

async function submitChatQuery() {
    const question = (chatQueryInput?.value || '').trim();
    if (!question) return;

    chatQueryInput.value = '';
    addChatMessage(question, 'user');

    const soc = parseFloat(ersLevelPctDisplay?.textContent) || 62.0;
    const gap = parseFloat(valGapDisplay?.textContent) || 1.42;
    const speed = parseFloat(valHeroSpeed?.textContent) || 248.0;
    const mode = valHeroModeName?.textContent || 'Balance';
    const drs = gap <= 1.0;
    const model = getSelectedGeminiModel();

    if (btnSendChat) {
        btnSendChat.disabled = true;
        btnSendChat.textContent = '...';
    }

    try {
        const resp = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: currentGeminiKey || null,
                model: model,
                question: question,
                lap: currentReplayLap,
                battery_soc_pct: soc,
                gap_sec: gap,
                closing_speed_kph: 12.0,
                drs_available: drs,
                mode: mode,
                success_prob: 0.85,
                speed_kph: speed
            })
        });

        const data = await resp.json();
        if (data && data.answer) {
            const sourceLabel = data.source ? data.source.toUpperCase() : 'GEMINI';
            addChatMessage(data.answer, 'ai', sourceLabel);
        }
    } catch (e) {
        addChatMessage('Telemetry link timeout. Retrying calculation...', 'ai');
    } finally {
        if (btnSendChat) {
            btnSendChat.disabled = false;
            btnSendChat.textContent = 'SEND';
        }
    }
}

function addChatMessage(text, sender, sourceLabel = null) {
    if (!chatMessagesFeed) return;
    const bubble = document.createElement('div');
    bubble.className = sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai';
    bubble.style.cssText = sender === 'user'
        ? 'background: #1e293b; color: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem; border-left: 3px solid #00c8e6;'
        : 'background: rgba(0, 229, 153, 0.1); color: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem; border-left: 3px solid #00e599;';

    const label = sourceLabel ? `CHIEF STRATEGIST (${sourceLabel})` : 'CHIEF STRATEGIST (GEMINI)';
    const meta = sender === 'user' ? 'YOU (PIT WALL)' : label;
    bubble.innerHTML = `<div style="font-size: 0.68rem; font-weight: 800; color: #94a3b8; margin-bottom: 3px;">${meta}</div><div>${text}</div>`;
    chatMessagesFeed.appendChild(bubble);
    chatMessagesFeed.scrollTop = chatMessagesFeed.scrollHeight;
}

/**
 * -----------------------------------------------------------------------------
 * 9. TRACK MAP DUAL-CAR CIRCUIT SIMULATION (AUTODROMO NAZIONALE MONZA)
 * -----------------------------------------------------------------------------
 */
function updateCircuitSimulation(t_in_lap, tel, frame) {
    if (!circuitTrackPath) return;

    const progress = Math.max(0, Math.min(1.0, t_in_lap !== undefined ? t_in_lap : 0.0));
    const totalLength = circuitTrackPath.getTotalLength();

    // 1. Position Car 16 (Alex Vance // Apex Racing)
    if (car16MarkerGroup) {
        const distance16 = progress * totalLength;
        const pt16 = circuitTrackPath.getPointAtLength(distance16);
        car16MarkerGroup.setAttribute('transform', `translate(${pt16.x.toFixed(1)}, ${pt16.y.toFixed(1)})`);
    }

    // 2. Position Car 1 (Marcus Sterling // Vortex GP Leader)
    if (car1LeaderGroup) {
        const leaderProgress = (frame && frame.leader_t_in_lap !== undefined)
            ? frame.leader_t_in_lap
            : ((progress + ((tel.gap_sec !== undefined ? tel.gap_sec : 0.45) * 0.015)) % 1.0);
        const distance1 = Math.max(0, Math.min(1.0, leaderProgress)) * totalLength;
        const pt1 = circuitTrackPath.getPointAtLength(distance1);
        car1LeaderGroup.setAttribute('transform', `translate(${pt1.x.toFixed(1)}, ${pt1.y.toFixed(1)})`);
    }

    // 3. Monza Sectors & DRS Detection
    let sector = "SECTOR 1 (PIT STRAIGHT & RETTIFILO T1-T4)";
    if (progress > 0.72) {
        sector = "SECTOR 3 (CURVA PARABOLICA & PIT STRAIGHT)";
    } else if (progress > 0.35) {
        sector = "SECTOR 2 (ROGGIA & LESMOS TO ASCARI T4-T10)";
    }
    if (circuitSectorDisplay) circuitSectorDisplay.textContent = sector;

    const drs = Boolean(tel.drs_available);
    if (circuitDrsDisplay) {
        if (drs) {
            circuitDrsDisplay.textContent = "DRS ACTIVE (MONZA MAIN STRAIGHT)";
            circuitDrsDisplay.style.background = "var(--neon-green)";
            circuitDrsDisplay.style.color = "#050505";
        } else {
            circuitDrsDisplay.textContent = "DRS CLOSED";
            circuitDrsDisplay.style.background = "#1e293b";
            circuitDrsDisplay.style.color = "#64748b";
        }
    }

    const speed = tel.speed_kph || 248;
    if (circuitSpeedDisplay) circuitSpeedDisplay.textContent = `${Math.round(speed)} KM/H`;

    if (trackProgressVal) {
        trackProgressVal.textContent = `LAP ${String(currentReplayLap).padStart(2, '0')} // ${(progress * 100).toFixed(1)}%`;
    }

    if (trackLeaderGapVal) {
        const gap = tel.gap_sec !== undefined ? tel.gap_sec.toFixed(3) : "0.420";
        const slip = (tel.gap_sec !== undefined && tel.gap_sec <= 1.0) ? " (SLIPSTREAM)" : " (CLEAN AIR)";
        trackLeaderGapVal.textContent = `+${gap}s${slip}`;
        trackLeaderGapVal.style.color = (tel.gap_sec !== undefined && tel.gap_sec <= 1.0) ? "var(--neon-green)" : "#f87171";
    }

    if (trackDeployVal) {
        const deploy = tel.deploy_kw !== undefined ? tel.deploy_kw : 120;
        const modeLabel = deploy > 90 ? "[BOOST]" : deploy > 0 ? "[DEPLOY]" : "[REGEN]";
        trackDeployVal.textContent = `${deploy > 0 ? '+' : ''}${deploy.toFixed(0)} kW ${modeLabel}`;
        trackDeployVal.style.color = deploy > 90 ? "var(--haas-red)" : deploy > 0 ? "var(--accent-cyan)" : "var(--neon-green)";
    }

    if (trackSocVal) {
        const soc = (frame && frame.battery_soc_dynamic !== undefined)
            ? frame.battery_soc_dynamic
            : (tel.battery_soc_pct !== undefined ? tel.battery_soc_pct : 62.0);
        trackSocVal.textContent = `${soc.toFixed(1)}%`;
    }
}

/**
 * -----------------------------------------------------------------------------
 * 10. STRATEGY VIEW (25-LAP FORECAST & SENTINEL)
 * -----------------------------------------------------------------------------
 */
function updateComplianceAudit(status, detail) {
    if (!complianceStatusText) return;

    const isCompliant = status === 'COMPLIANT';
    if (isCompliant) {
        complianceStatusText.textContent = 'STATUS: COMPLIANT';
        complianceStatusText.style.background = 'rgba(0, 229, 153, 0.15)';
        complianceStatusText.style.color = 'var(--neon-green)';
        complianceStatusText.style.borderColor = 'var(--neon-green)';
    } else {
        const violations = (detail && detail.violations) ? detail.violations : [];
        const reason = violations.length > 0 ? violations[0] : (detail?.violation_reason || 'REGULATORY BREACH');
        complianceStatusText.textContent = `STATUS: VIOLATION (${reason})`;
        complianceStatusText.style.background = 'rgba(225, 6, 0, 0.2)';
        complianceStatusText.style.color = 'var(--haas-red)';
        complianceStatusText.style.borderColor = 'var(--haas-red)';
    }

    const rules = (detail && detail.rules_checked) ? detail.rules_checked : {};

    // 1. DRS Rule
    if (ruleDrsIcon) {
        const ok = rules.drs_rule_respected !== false;
        ruleDrsIcon.textContent = ok ? '✓' : '✗';
        ruleDrsIcon.className = ok ? 'chk-ico text-green' : 'chk-ico text-red';
    }

    // 2. Reserve Floor Guard (15%)
    if (ruleSocIcon) {
        const ok = rules.reserve_floor_respected !== false;
        ruleSocIcon.textContent = ok ? '✓' : '✗';
        ruleSocIcon.className = ok ? 'chk-ico text-green' : 'chk-ico text-red';
    }

    // 3. Powertrain Thermal & Power Ceiling (120 kW)
    if (ruleThermalIcon) {
        const ok = rules.power_ceiling_respected !== false && rules.zero_depletion_respected !== false;
        ruleThermalIcon.textContent = ok ? '✓' : '✗';
        ruleThermalIcon.className = ok ? 'chk-ico text-green' : 'chk-ico text-red';
    }
}

async function loadForecastData(soc, laps, gap) {
    const currentSoc = (soc !== undefined && !isNaN(soc)) ? soc : (parseFloat(ersLevelPctDisplay?.textContent) || 62.0);
    const lapsRem = (laps !== undefined && !isNaN(laps)) ? laps : Math.max(1, totalLaps - currentReplayLap);
    const gapSec = (gap !== undefined && !isNaN(gap)) ? gap : (parseFloat(valGapDisplay?.textContent) || 1.42);

    try {
        const resp = await fetch(`/api/forecast_all?current_soc=${currentSoc}&laps_remaining=${lapsRem}&initial_gap_sec=${gapSec}`);
        const data = await resp.json();

        const recom = data.recommended || {};
        const push = data.always_push || {};
        const bal = data.always_balance || {};
        const harv = data.always_harvest || {};

        if (alwaysPushDryText) {
            if (push.dry_out_lap) {
                alwaysPushDryText.textContent = `Always Push runs dry on Lap +${push.dry_out_lap}`;
            } else {
                alwaysPushDryText.textContent = `Always Push survives stint`;
            }
        }

        if (recomSurviveText) {
            recomSurviveText.textContent = recom.survives ? 'Recommended preserves reserve' : 'Conserves critical energy';
        }

        if (dryAlertPill) {
            if (recom.survives) {
                dryAlertPill.textContent = 'RESERVE PROTECTED';
                dryAlertPill.style.background = 'rgba(0, 229, 153, 0.2)';
                dryAlertPill.style.color = 'var(--neon-green)';
                dryAlertPill.style.borderColor = 'var(--neon-green)';
            } else {
                dryAlertPill.textContent = 'CRITICAL DEPLETION RISK';
                dryAlertPill.style.background = 'rgba(225, 6, 0, 0.2)';
                dryAlertPill.style.color = 'var(--haas-red)';
                dryAlertPill.style.borderColor = 'var(--haas-red)';
            }
        }

        renderForecastChart(recom.trajectory, push.trajectory, bal.trajectory, harv.trajectory);
    } catch (e) {
        console.warn('[FORECAST] Notice:', e);
    }
}

function renderForecastChart(recomTraj, pushTraj, balTraj, harvTraj) {
    if (!recomTraj || recomTraj.length === 0) return;

    const getOffset = p => (Array.isArray(p) ? p[0] : (p.lap_offset !== undefined ? p.lap_offset : 0));
    const getSoc = p => (Array.isArray(p) ? p[1] : (p.soc_pct !== undefined ? p.soc_pct : 0));

    const labels = recomTraj.map(p => `+${getOffset(p)}`);
    const recomSoc = recomTraj.map(getSoc);
    const pushSoc = pushTraj ? pushTraj.map(getSoc) : [];
    const balSoc = balTraj ? balTraj.map(getSoc) : [];
    const harvSoc = harvTraj ? harvTraj.map(getSoc) : [];

    const ctx = document.getElementById('forecastChart')?.getContext('2d');
    if (!ctx) return;

    if (forecastChart) {
        forecastChart.destroy();
    }

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Recommended',
                    data: recomSoc,
                    borderColor: '#00e599',
                    backgroundColor: 'rgba(0, 229, 153, 0.08)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    fill: true
                },
                {
                    label: 'Always Push',
                    data: pushSoc,
                    borderColor: '#e10600',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.25,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    fill: false
                },
                {
                    label: 'Always Balance',
                    data: balSoc,
                    borderColor: '#00c8e6',
                    borderWidth: 1.8,
                    tension: 0.25,
                    pointRadius: 1.5,
                    pointHoverRadius: 4,
                    fill: false
                },
                {
                    label: 'Always Harvest',
                    data: harvSoc,
                    borderColor: '#a855f7',
                    borderWidth: 1.8,
                    tension: 0.25,
                    pointRadius: 1.5,
                    pointHoverRadius: 4,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        boxWidth: 16,
                        boxHeight: 8,
                        font: { family: 'Rajdhani', size: 11, weight: 'bold' },
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}% SoC`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Rajdhani', size: 10, weight: '700' },
                        maxTicksLimit: 14
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Rajdhani', size: 10, weight: '700' },
                        stepSize: 10,
                        callback: (v) => `${v}%`
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

/**
 * -----------------------------------------------------------------------------
 * 11. 50-LAP WHOLE RACE STRATEGIC SUMMARY MODAL
 * -----------------------------------------------------------------------------
 */
async function openRaceSummaryModal() {
    if (raceSummaryModal) raceSummaryModal.classList.add('active');

    try {
        const resp = await fetch('/api/race/summary');
        const data = await resp.json();

        if (sumOvertakeAttempts) sumOvertakeAttempts.textContent = data.overtake_attempts || 0;
        if (sumOvertakeSuccess) sumOvertakeSuccess.textContent = data.overtake_successes || 0;
        if (sumSuccessRate) sumSuccessRate.textContent = `${data.overtake_success_rate_pct || 0}%`;
        if (sumEnergyDeployed) sumEnergyDeployed.textContent = `${data.energy_deployed_mj || 0} MJ`;
        if (sumMinSoc) sumMinSoc.textContent = `${data.min_battery_soc_pct || 0}%`;
        if (sumMaxSpeed) sumMaxSpeed.textContent = `${data.max_speed_kph || 0} KM/H`;

        if (stintTableBody && data.stints) {
            stintTableBody.innerHTML = '';
            data.stints.forEach(s => {
                const tr = document.createElement('tr');
                const profile = s.stint === 1 ? 'Balanced Energy Stint' : s.stint === 2 ? 'Push Pace Delta Attack' : 'Late-Race Harvest & Defend';
                tr.innerHTML = `
                    <td>STINT ${s.stint}</td>
                    <td>LAPS ${s.laps}</td>
                    <td>${s.avg_speed} KM/H</td>
                    <td style="color: var(--neon-green); font-weight: 800;">${s.overtakes} PASSES</td>
                    <td style="color: #94a3b8;">${profile}</td>
                `;
                stintTableBody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error('[SUMMARY] Error loading race summary:', e);
    }
}

function closeRaceSummaryModal() {
    if (raceSummaryModal) raceSummaryModal.classList.remove('active');
}

/**
 * -----------------------------------------------------------------------------
 * 12. INITIALIZE HAAS LINE CHARTS
 * -----------------------------------------------------------------------------
 */
function initHaasCharts() {
    // 1. Gap to Car Ahead Line Chart
    const ctxGap = document.getElementById('chartGapAhead');
    if (ctxGap) {
        const ctx = ctxGap.getContext('2d');
        const redGradient = ctx.createLinearGradient(0, 0, 0, 110);
        redGradient.addColorStop(0, 'rgba(225, 6, 0, 0.35)');
        redGradient.addColorStop(1, 'rgba(225, 6, 0, 0.0)');

        const initialLaps = [5, 10, 15, 20, 25, 28, 35, 40, 45, 50, 55];
        const initialGaps = [2.8, 2.4, 2.1, 1.8, 1.6, 1.42, 1.35, 1.25, 1.15, 0.95, 0.85];

        chartGapAheadInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: initialLaps,
                datasets: [{
                    label: 'Gap (s)',
                    data: initialGaps,
                    borderColor: '#e10600',
                    borderWidth: 2,
                    backgroundColor: redGradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: (ctx) => ctx.dataIndex === 5 ? 4 : 0,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#e10600',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#64748b', font: { family: 'Rajdhani', size: 10, weight: '700' } }
                    },
                    y: {
                        min: 0.0,
                        max: 4.0,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Rajdhani', size: 10, weight: '700' },
                            callback: (v) => `${v.toFixed(1)}s`
                        }
                    }
                }
            }
        });
    }

    // 2. Lap Delta (vs. Best) Line Chart
    const ctxDelta = document.getElementById('chartLapDelta');
    if (ctxDelta) {
        const ctx = ctxDelta.getContext('2d');
        const cyanGradient = ctx.createLinearGradient(0, 0, 0, 110);
        cyanGradient.addColorStop(0, 'rgba(0, 200, 230, 0.35)');
        cyanGradient.addColorStop(1, 'rgba(0, 200, 230, 0.0)');

        const initialLaps = [5, 10, 15, 20, 25, 28, 35, 40, 45, 50, 55];
        const initialDeltas = [0.45, 0.32, 0.18, -0.05, -0.15, -0.24, -0.20, -0.12, 0.05, -0.18, -0.30];

        chartLapDeltaInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: initialLaps,
                datasets: [{
                    label: 'Lap Delta (s)',
                    data: initialDeltas,
                    borderColor: '#00c8e6',
                    borderWidth: 2,
                    backgroundColor: cyanGradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: (ctx) => ctx.dataIndex === 5 ? 4 : 0,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#00c8e6',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#64748b', font: { family: 'Rajdhani', size: 10, weight: '700' } }
                    },
                    y: {
                        min: -1.0,
                        max: 1.0,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Rajdhani', size: 10, weight: '700' },
                            callback: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}s`
                        }
                    }
                }
            }
        });
    }
}

// User click unlocks Web Audio API
document.addEventListener('click', () => {
    if (window.radioAudio) {
        window.radioAudio.initAudioContext();
        if (!isIntercomStarted) {
            startContinuousCoachMic();
        }
    }
}, { once: false });

// DOM Ready
window.addEventListener('DOMContentLoaded', () => {
    initClocks();
    initHaasCharts();
    initSessionRoom();
    loadForecastData(62.0, 25, 1.42);

    // Restore saved Gemini model and API key if present
    const savedModel = localStorage.getItem('apex_gemini_model');
    if (savedModel && geminiModelSelect) {
        let found = false;
        for (let opt of geminiModelSelect.options) {
            if (opt.value === savedModel) {
                geminiModelSelect.value = savedModel;
                found = true;
                break;
            }
        }
        if (!found) {
            geminiModelSelect.value = 'custom';
            const customInput = document.getElementById('geminiCustomModelInput');
            if (customInput) {
                customInput.style.display = 'block';
                customInput.value = savedModel;
            }
        }
    }

    if (currentGeminiKey && geminiApiKeyInput) {
        geminiApiKeyInput.value = currentGeminiKey;
        connectGeminiKey();
    }
});

/**
 * Apex Pulse - Continuous Radio Audio & Web Audio Synthesizer
 * Provides:
 * 1. Low-latency continuous full-duplex PCM microphone streaming over WebSocket
 * 2. Glitch-free scheduled continuous audio playback queue
 * 3. Realistic F1 Pit-to-Car radio click/beep chimes and static burst filter
 * 4. Text-to-Speech radio dispatcher (synthesizes team radio voice with telemetry distortion)
 */

class RadioAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.micStream = null;
        this.micSourceNode = null;
        this.processorNode = null;
        this.isIntercomActive = false;
        this.isMuted = false;
        this.onAudioChunkCallback = null;
        this.nextPlayTime = 0;
        this.sampleRate = 16000; // 16kHz for walkie-talkie bandwidth & low network overhead
        this.volumeLevel = 0;
        this.onVolumeChange = null;
    }

    initAudioContext() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    /**
     * Authentic Formula 1 team radio transmit chirp / squelch
     */
    playRadioBeep(type = 'start') {
        this.initAudioContext();
        if (!this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const now = ctx.currentTime;

            if (type === 'start') {
                osc.frequency.setValueAtTime(1480, now);
                osc.frequency.setValueAtTime(1960, now + 0.05);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.13);
            } else {
                osc.frequency.setValueAtTime(1960, now);
                osc.frequency.setValueAtTime(1200, now + 0.04);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.10);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.11);
            }
        } catch (e) {
            console.warn('[RADIO] Beep error:', e);
        }
    }

    /**
     * Plays a brief burst of radio static crackle
     */
    playRadioStaticBurst(duration = 0.12) {
        this.initAudioContext();
        if (!this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.10;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1800;
            filter.Q.value = 1.8;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            noise.start();
        } catch (e) {
            console.warn('[RADIO] Static error:', e);
        }
    }

    /**
     * Synthesizes an authentic 2023 Red Bull Honda RBPT V6 Turbo-Hybrid Engine Roar
     * With 15,000 RPM rev-up, turbocharger spool, anti-lag gearshift pop, and Doppler flyby.
     */
    playF1EngineIgnitionRoar() {
        this.initAudioContext();
        if (!this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            const now = ctx.currentTime;

            // 1. Fundamental Engine Cylinders Oscillator (V6 uneven firing order)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const oscGain = ctx.createGain();

            osc1.type = 'sawtooth';
            osc2.type = 'triangle';

            // Idle at 3,500 RPM (fundamental ~175 Hz), then throttle blast to 13,500 RPM (675 Hz)
            osc1.frequency.setValueAtTime(140, now);
            osc1.frequency.exponentialRampToValueAtTime(580, now + 1.2); // First gear pull
            osc1.frequency.setValueAtTime(420, now + 1.3); // Upshift drop
            osc1.frequency.exponentialRampToValueAtTime(680, now + 2.2); // Second gear pull
            osc1.frequency.setValueAtTime(480, now + 2.25); // Upshift drop
            osc1.frequency.exponentialRampToValueAtTime(740, now + 3.0); // Top revs
            osc1.frequency.exponentialRampToValueAtTime(220, now + 3.8); // Flyby decel

            osc2.frequency.setValueAtTime(142, now);
            osc2.frequency.exponentialRampToValueAtTime(585, now + 1.2);
            osc2.frequency.setValueAtTime(425, now + 1.3);
            osc2.frequency.exponentialRampToValueAtTime(685, now + 2.2);
            osc2.frequency.setValueAtTime(485, now + 2.25);
            osc2.frequency.exponentialRampToValueAtTime(745, now + 3.0);
            osc2.frequency.exponentialRampToValueAtTime(225, now + 3.8);

            // Distortion / Saturation Curve for authentic exhaust rasp
            const waveshaper = ctx.createWaveShaper();
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            const k = 50;
            for (let i = 0; i < n_samples; ++i) {
                const x = (i * 2) / n_samples - 1;
                curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            waveshaper.curve = curve;

            // Exhaust Resonance Bandpass Filter
            const exhaustFilter = ctx.createBiquadFilter();
            exhaustFilter.type = 'bandpass';
            exhaustFilter.frequency.setValueAtTime(950, now);
            exhaustFilter.frequency.exponentialRampToValueAtTime(2800, now + 2.5);
            exhaustFilter.Q.value = 3.5;

            oscGain.gain.setValueAtTime(0.01, now);
            oscGain.gain.linearRampToValueAtTime(0.28, now + 0.3);
            oscGain.gain.setValueAtTime(0.28, now + 2.8);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);

            osc1.connect(waveshaper);
            osc2.connect(waveshaper);
            waveshaper.connect(exhaustFilter);
            exhaustFilter.connect(oscGain);
            oscGain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 4.1);
            osc2.stop(now + 4.1);

            // 2. High-Frequency MGU-H Turbocharger Spool Whine
            const turboOsc = ctx.createOscillator();
            const turboGain = ctx.createGain();
            turboOsc.type = 'sine';
            turboOsc.frequency.setValueAtTime(1800, now);
            turboOsc.frequency.exponentialRampToValueAtTime(6200, now + 2.5); // Spooling to 125,000 RPM
            turboGain.gain.setValueAtTime(0.01, now);
            turboGain.gain.linearRampToValueAtTime(0.08, now + 1.0);
            turboGain.gain.exponentialRampToValueAtTime(0.001, now + 3.6);

            turboOsc.connect(turboGain);
            turboGain.connect(ctx.destination);
            turboOsc.start(now);
            turboOsc.stop(now + 3.7);

            // 3. Radio squelch at end of flyby
            setTimeout(() => {
                this.playRadioBeep('start');
            }, 3200);
        } catch (e) {
            console.warn('[RADIO] Engine roar synthesis notice:', e);
        }
    }

    /**
     * Text-to-Speech radio command dispatch with F1 sound effects
     */
    dispatchRadioVoice(messageText) {
        this.playRadioBeep('start');
        setTimeout(() => {
            this.playRadioStaticBurst(0.12);
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(messageText);
                utterance.rate = 1.05;
                utterance.pitch = 0.92;
                utterance.volume = 1.0;

                const voices = window.speechSynthesis.getVoices();
                const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google'))) ||
                                 voices.find(v => v.lang.startsWith('en'));
                if (engVoice) utterance.voice = engVoice;

                utterance.onend = () => {
                    this.playRadioBeep('end');
                };
                utterance.onerror = () => {
                    this.playRadioBeep('end');
                };

                window.speechSynthesis.speak(utterance);
            } else {
                setTimeout(() => this.playRadioBeep('end'), 600);
            }
        }, 100);
    }

    /**
     * Starts continuous live microphone streaming
     * @param {Function} onChunkCallback callback receiving PCM base64 payload
     */
    async startContinuousIntercom(onChunkCallback) {
        this.initAudioContext();
        this.onAudioChunkCallback = onChunkCallback;

        if (this.isIntercomActive) return true;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('[RADIO] Microphone requires a secure context (HTTPS or localhost). When deploying, ensure HTTPS is active.');
            return false;
        }

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                },
                video: false
            });

            const ctx = this.audioCtx;
            this.micSourceNode = ctx.createMediaStreamSource(this.micStream);

            // 2048 buffer size gives ~46ms chunks at 44.1kHz, downsampled to 16kHz
            const bufferSize = 2048;
            this.processorNode = ctx.createScriptProcessor(bufferSize, 1, 1);

            this.processorNode.onaudioprocess = (e) => {
                if (this.isMuted) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const inputSampleRate = ctx.sampleRate;

                // Calculate volume level for UI visualizer
                let sumSquares = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sumSquares += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sumSquares / inputData.length);
                this.volumeLevel = Math.min(1.0, rms * 5);
                if (this.onVolumeChange) {
                    this.onVolumeChange(this.volumeLevel);
                }

                // Downsample to 16kHz PCM
                const downsampled = this.downsampleBuffer(inputData, inputSampleRate, this.sampleRate);
                const int16Array = new Int16Array(downsampled.length);
                for (let i = 0; i < downsampled.length; i++) {
                    const s = Math.max(-1, Math.min(1, downsampled[i]));
                    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Base64 encode
                const base64Str = this.int16ToBase64(int16Array);
                if (this.onAudioChunkCallback && base64Str) {
                    this.onAudioChunkCallback(base64Str);
                }
            };

            // Connect through a mute gain node to destination to keep ScriptProcessor running
            const dummyGain = ctx.createGain();
            dummyGain.gain.value = 0;
            this.micSourceNode.connect(this.processorNode);
            this.processorNode.connect(dummyGain);
            dummyGain.connect(ctx.destination);

            this.isIntercomActive = true;
            this.playRadioBeep('start');
            console.log('[RADIO] Continuous hands-free intercom activated.');
            return true;
        } catch (err) {
            console.warn('[RADIO] Mic access not available or blocked:', err);
            return false;
        }
    }

    /**
     * Toggle Mute for open mic
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    /**
     * Stops continuous microphone recording
     */
    stopContinuousIntercom() {
        if (this.processorNode) {
            try { this.processorNode.disconnect(); } catch (e) {}
            this.processorNode = null;
        }
        if (this.micSourceNode) {
            try { this.micSourceNode.disconnect(); } catch (e) {}
            this.micSourceNode = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        this.isIntercomActive = false;
        this.playRadioBeep('end');
    }

    /**
     * Plays received base64 PCM audio chunk seamlessly in continuous schedule
     */
    playRemotePcmChunk(base64Data) {
        this.initAudioContext();
        if (!this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            const int16Array = this.base64ToInt16(base64Data);
            if (!int16Array || int16Array.length === 0) return;

            // Convert to Float32
            const float32 = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32[i] = int16Array[i] / 32768.0;
            }

            const audioBuffer = ctx.createBuffer(1, float32.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(float32);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Bandpass filter for authentic radio sound
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1600;
            filter.Q.value = 1.2;

            const gain = ctx.createGain();
            gain.gain.value = 1.2;

            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            // Schedule glitch-free playback
            const currentTime = ctx.currentTime;
            const startTime = Math.max(currentTime, this.nextPlayTime);
            source.start(startTime);
            this.nextPlayTime = startTime + audioBuffer.duration;
        } catch (e) {
            console.error('[RADIO] PCM Playback error:', e);
        }
    }

    /**
     * Downsample Float32 buffer to target sample rate
     */
    downsampleBuffer(buffer, inputRate, outputRate) {
        if (outputRate === inputRate) return buffer;
        if (outputRate > inputRate) return buffer;

        const ratio = inputRate / outputRate;
        const newLength = Math.round(buffer.length / ratio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count > 0 ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    int16ToBase64(int16) {
        const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToInt16(base64) {
        const binary = window.atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    }
}

// Global instance
window.radioAudio = new RadioAudioEngine();

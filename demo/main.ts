import './styles.css';
import Hls from 'hls.js';
import {
  createAnalyticsPlugin,
  createColorGradingPlugin,
  createStereoPlugin,
  createSubtitlesPlugin,
  createWatermarkPlugin,
  createWebGL360Player,
  isSecureContext,
  type WebGL360ColorFilters,
  type WebGL360Player,
  type WebGL360Source,
} from '../src/index';

const viewer = document.querySelector<HTMLElement>('#viewer');
const eventLog = document.querySelector<HTMLPreElement>('#event-log');
const DEMO_CONFIG = {
  brandText: '',
  loop: true,
  sources: [
    {
      src: 'https://stream-akamai.castr.com/5b9352dbda7b8c769937e459/live_2361c920455111ea85db6911fe397b9e/index.fmp4.m3u8',
      type: 'hls',
      quality: 'hls-live',
      mimeType: 'application/vnd.apple.mpegurl',
      label: 'Castr HLS Live',
    },
    { src: 'example_8k.mp4', type: 'mp4', quality: '8k', width: 7680, height: 3840, mimeType: 'video/mp4; codecs="hev1"', bitrate: 76000000 },
    { src: 'example_4k.mp4', type: 'mp4', quality: '4k', width: 3840, height: 1920, mimeType: 'video/mp4; codecs="hvc1"', bitrate: 25000000 },
    { src: 'example_1080p.mp4', type: 'mp4', quality: '1080p', width: 1920, height: 960, mimeType: 'video/mp4', bitrate: 5000000 },
    { src: 'example_720p.mp4', type: 'mp4', quality: '720p', width: 1280, height: 640, mimeType: 'video/mp4', bitrate: 2500000 }
  ] as WebGL360Source[]
};

const uiContainer = document.querySelector<HTMLElement>('#player-ui');
const uiBrandBadge = document.querySelector<HTMLElement>('#ui-brand-badge');
const uiQualitySelect = document.querySelector<HTMLSelectElement>('#ui-quality');
const progressBar = document.querySelector<HTMLInputElement>('#ui-progress');
const timeDisplay = document.querySelector<HTMLElement>('#ui-time');
const btnPlayPause = document.querySelector<HTMLButtonElement>('#ui-play-pause');
const btnBigPlay = document.querySelector<HTMLButtonElement>('#ui-big-play');
const btnMute = document.querySelector<HTMLButtonElement>('#ui-mute');
const btnZoomIn = document.querySelector<HTMLButtonElement>('#ui-zoom-in');
const btnZoomOut = document.querySelector<HTMLButtonElement>('#ui-zoom-out');
const zoomLevelDisplay = document.querySelector<HTMLElement>('#ui-zoom-level');
const btnMotion = document.querySelector<HTMLButtonElement>('#ui-motion');
const btnDebug = document.querySelector<HTMLButtonElement>('#ui-debug');
const btnFullscreen = document.querySelector<HTMLButtonElement>('#ui-fullscreen');
const btnResetColor = document.querySelector<HTMLButtonElement>('#color-reset');
const colorFilterInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-color-filter]'));

let player: WebGL360Player | undefined;
let lastStateJson = '';
let hasStartedPlaying = false;
let uiHideTimer: number | undefined;
const colorGrading = createColorGradingPlugin();
const analytics = createAnalyticsPlugin({
  track(event, payload) {
    writeEvent(event, payload);
  },
  viewDurationIntervalMs: 5000,
});
const subtitles = createSubtitlesPlugin({
  tracks: [
    {
      id: 'en',
      src: '/subtitles-en.vtt',
      label: 'English',
      srclang: 'en',
      default: true,
    },
  ],
});
const watermark = createWatermarkPlugin({
  text: 'MIRAME360.COM',
  href: 'https://mirame360.com',
  poweredBy: true,
  position: 'top-left',
});
const stereo = createStereoPlugin({
  eyeYawOffset: 1.5,
  requestFullscreen: false,
});

function formatFilterValue(filter: keyof WebGL360ColorFilters, value: number): string {
  if (filter === 'contrast' || filter === 'saturation') {
    return `${value.toFixed(2)}x`;
  }
  return value.toFixed(2);
}

function syncColorControls(): void {
  const filters = colorGrading.getFilters();

  for (const input of colorFilterInputs) {
    const filter = input.dataset.colorFilter as keyof WebGL360ColorFilters | undefined;
    if (!filter) continue;

    const value = filters[filter];
    input.value = String(value);

    const output = document.querySelector<HTMLElement>(`[data-color-value="${filter}"]`);
    if (output) {
      output.textContent = formatFilterValue(filter, value);
    }
  }
}

function handleColorControlInput(input: HTMLInputElement): void {
  const filter = input.dataset.colorFilter as keyof WebGL360ColorFilters | undefined;
  if (!filter) return;

  const value = Number(input.value);
  colorGrading.setFilters({ [filter]: value });

  const output = document.querySelector<HTMLElement>(`[data-color-value="${filter}"]`);
  if (output) {
    output.textContent = formatFilterValue(filter, colorGrading.getFilters()[filter]);
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateUI() {
  if (!player || !progressBar || !timeDisplay) return;
  const state = player.getState();
  
  // Only update heavy DOM elements if state actually changed
  const stateJson = JSON.stringify({
    isPaused: state.isPaused,
    isMuted: state.isMuted,
    isMotionEnabled: state.isMotionEnabled,
    isDebug: state.isDebug,
    quality: state.selectedSource?.quality,
    fov: state.fov.toFixed(1)
  });

  if (state.duration > 0) {
    progressBar.max = state.duration.toString();
    progressBar.value = state.currentTime.toString();
    const remaining = Math.max(0, state.duration - state.currentTime);
    timeDisplay.textContent = `-${formatTime(remaining)}`;
    const percent = (state.currentTime / state.duration) * 100;
    progressBar.style.background = `linear-gradient(to right, #3b82f6 ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%)`;
  }

  if (stateJson !== lastStateJson) {
    if (btnPlayPause) {
      if (state.isPaused) {
        btnPlayPause.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      } else {
        btnPlayPause.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    }

    if (btnBigPlay) {
      if (state.isPaused && !hasStartedPlaying) {
        btnBigPlay.classList.remove('hidden');
      } else {
        btnBigPlay.classList.add('hidden');
      }
    }
    
    if (btnMute) {
      if (state.isMuted) {
        btnMute.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
      } else {
        btnMute.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
      }
    }

    if (zoomLevelDisplay) {
      const zoom = (75 / state.fov).toFixed(1);
      zoomLevelDisplay.textContent = `${zoom}x`;
    }
    
    if (btnMotion) {
      btnMotion.style.color = state.isMotionEnabled ? '#4ade80' : '#fff';
    }

    if (btnDebug) {
      btnDebug.style.color = state.isDebug ? '#4ade80' : '#fff';
    }

    lastStateJson = stateJson;
  }

  requestAnimationFrame(updateUI);
}

requestAnimationFrame(updateUI);

btnPlayPause?.addEventListener('click', () => {
  if (!player) return;
  void player.togglePlay();
});

btnBigPlay?.addEventListener('click', () => {
  if (!player) return;
  void player.play();
});

btnMute?.addEventListener('click', () => {
  if (!player) return;
  player.setMuted(!player.getState().isMuted);
});

btnZoomIn?.addEventListener('click', () => {
  if (!player) return;
  const state = player.getState();
  player.setFov(state.fov - 10);
});

btnZoomOut?.addEventListener('click', () => {
  if (!player) return;
  const state = player.getState();
  player.setFov(state.fov + 10);
});

btnMotion?.addEventListener('click', () => {
  if (!player) return;
  // IMPORTANT: Do not await anything here before setMotionEnabled.
  // iOS requires the permission request (inside setMotionEnabled) 
  // to be strictly in the same tick as the user gesture.
  const state = player.getState();
  const nextEnabled = !state.isMotionEnabled;
  
  player.setMotionEnabled(nextEnabled).then((actuallyEnabled) => {
    writeEvent('motion_toggled', { requested: nextEnabled, result: actuallyEnabled });
  }).catch(err => {
    console.error('Motion toggle failed', err);
  });
});

btnDebug?.addEventListener('click', () => {
  if (!player) return;
  player.setDebug(!player.getState().isDebug);
});

const syncFullscreenUI = () => {
  const container = document.querySelector('#viewer-container');
  const btn = document.querySelector<HTMLButtonElement>('#ui-fullscreen');
  if (!container || !btn) return;

  const isFullscreen = !!document.fullscreenElement || container.classList.contains('is-pseudo-fullscreen');
  
  if (isFullscreen) {
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';
  } else {
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
  }
};

const toggleFullscreen = () => {
  const container = document.querySelector('#viewer-container');
  if (!container) return;

  const isFullscreen = !!document.fullscreenElement || container.classList.contains('is-pseudo-fullscreen');

  if (!isFullscreen) {
    if (container.requestFullscreen) {
      container.requestFullscreen().then(() => syncFullscreenUI()).catch(() => {
        container.classList.add('is-pseudo-fullscreen');
        syncFullscreenUI();
      });
    } else {
      container.classList.add('is-pseudo-fullscreen');
      syncFullscreenUI();
    }
  } else {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen();
    }
    container.classList.remove('is-pseudo-fullscreen');
    syncFullscreenUI();
  }
};

btnFullscreen?.addEventListener('click', toggleFullscreen);

for (const input of colorFilterInputs) {
  input.addEventListener('input', () => handleColorControlInput(input));
}

btnResetColor?.addEventListener('click', () => {
  colorGrading.reset();
  syncColorControls();
  writeEvent('color_grading_reset', colorGrading.getFilters());
});

// Handle escape key for pseudo-fullscreen
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const container = document.querySelector('#viewer-container');
    if (container?.classList.contains('is-pseudo-fullscreen')) {
      container.classList.remove('is-pseudo-fullscreen');
      syncFullscreenUI();
    }
  }
});

document.addEventListener('fullscreenchange', syncFullscreenUI);

progressBar?.addEventListener('input', () => {
  if (!player || !progressBar) return;
  player.seek(parseFloat(progressBar.value));
});

function loadPlayer(targetQuality?: string) {
  if (!viewer) return;

  const prevState = player?.getState();
  player?.destroy();
  viewer.innerHTML = '';
  
  // If we haven't started playing yet, ensure the flag stays false
  // so the big play button shows on the new player instance.
  if (!prevState || !hasStartedPlaying) {
    hasStartedPlaying = false;
  }

  const sources = DEMO_CONFIG.sources;

  if (sources.length === 0) {
    viewer.innerHTML = '<p class="empty-state">No source URLs provided in DEMO_CONFIG.</p>';
    writeEvent('No source URL provided.');
    return;
  }

  writeEvent('loading_player', {
    sources,
    targetQuality,
    isSecure: isSecureContext(),
  });

  if (!isSecureContext()) {
    console.warn('WebGL360Player: Motion controls usually require a Secure Context (HTTPS). This site is currently using an insecure connection.');
  }

  const defaultQual = targetQuality || '4k';
  
  // If we were already playing, the new player should autoplay to maintain continuity.
  // If we never started, it stays stopped.
  const shouldAutoplay = prevState ? !prevState.isPaused : false;
  
  // If we were already in the main or post stage, don't play the intro again.
  const skipIntro = prevState && (prevState.stage === 'main' || prevState.stage === 'post');

  player = createWebGL360Player(viewer, {
    sources,
    plugins: [colorGrading, analytics, subtitles, watermark, stereo],
    loop: DEMO_CONFIG.loop,
    preSources: skipIntro ? [] : [
      { src: 'example_720p.mp4', type: 'mp4', quality: '720p' }
    ],
    postSources: [
       { src: 'example_720p.mp4', type: 'mp4', quality: '720p' }
    ],
    defaultQuality: defaultQual,
    maxQuality: '8k',
    sourcePreference: ['hls', 'mp4'],
    initialYaw: prevState?.yaw,
    initialPitch: prevState?.pitch,
    initialFov: prevState?.fov,
    debug: false,
    autoplay: shouldAutoplay,
    muted: prevState ? prevState.isMuted : false,
    sourceLoader: async ({ video, source, defaultLoad, waitForReady }) => {
      if (source.type === 'hls' && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(source.src);
        hls.attachMedia(video);
        await waitForReady();
        return () => {
          hls.destroy();
        };
      }
      await defaultLoad();
    },
    onReady(state) {
      writeEvent('webgl_360_player_ready', state);
      uiContainer?.classList.remove('hidden');

      // Auto-hide UI logic
      const showUI = () => {
        uiContainer?.classList.remove('ui-hidden');
        if (uiHideTimer) window.clearTimeout(uiHideTimer);
        
        const playerState = player?.getState();
        // Only start timer if autoHide is enabled and video is playing
        if (!playerState?.isPaused) {
          uiHideTimer = window.setTimeout(() => {
            uiContainer?.classList.add('ui-hidden');
          }, 3000);
        }
      };

      // Show UI on any interaction
      viewer.addEventListener('pointermove', showUI);
      viewer.addEventListener('pointerdown', showUI);
      uiContainer?.addEventListener('pointermove', showUI);
      
      // Initial show
      showUI();

      if (uiBrandBadge) {
        const brandText = DEMO_CONFIG.brandText.trim();
        if (brandText) {
          uiBrandBadge.textContent = brandText;
          uiBrandBadge.style.display = 'block';
        } else {
          uiBrandBadge.style.display = 'none';
        }
      }

      if (uiQualitySelect) {
        const currentOptions = Array.from(uiQualitySelect.options).map(o => o.value).join(',');
        const qualities = Array.from(new Set(DEMO_CONFIG.sources.map(s => s.quality)));
        const availableQualities = new Set(state.availableQualities);
        const supportByQuality = new Map(state.sourceSupport.map((support) => [support.source.quality, support]));
        
        if (currentOptions !== qualities.join(',')) {
          uiQualitySelect.innerHTML = '';
          for (const quality of qualities) {
            const option = document.createElement('option');
            option.value = quality;
            option.textContent = quality;
            uiQualitySelect.appendChild(option);
          }
        }

        for (const option of Array.from(uiQualitySelect.options)) {
          const support = supportByQuality.get(option.value);
          option.disabled = !availableQualities.has(option.value);
          option.title = support && !support.supported && support.reason ? support.reason : '';
        }
        
        if (state.selectedSource) {
          uiQualitySelect.value = state.selectedSource.quality;
        }
      }

      if (prevState && prevState.currentTime > 0 && player) {
        player.seek(prevState.currentTime);
      }
      
      if (prevState && prevState.isMotionEnabled && player) {
        player.setMotionEnabled(true).catch(() => {});
      }
    },
    onClick(e) {
      if (player) {
        void player.togglePlay();
      }
      writeEvent('click', { x: e.clientX, y: e.clientY });
    },
    onPlay() {
      hasStartedPlaying = true;
      uiContainer?.classList.remove('ui-hidden');
      if (uiHideTimer) window.clearTimeout(uiHideTimer);
      uiHideTimer = window.setTimeout(() => {
        uiContainer?.classList.add('ui-hidden');
      }, 3000);
      writeEvent('play');
    },
    onPause() {
      if (uiHideTimer) window.clearTimeout(uiHideTimer);
      uiContainer?.classList.remove('ui-hidden');
      writeEvent('pause');
    },
    onEnded() {
      writeEvent('sequence_ended');
    },
    onError(error, state) {
      writeEvent('webgl_360_player_error', { error: String(error), state });
    },
    fallback(context) {
      if (targetQuality && uiQualitySelect) {
        uiQualitySelect.value = targetQuality;
      }
      writeEvent('fallback', {
        reason: context.reason,
        targetQuality,
        attemptedSources: context.attemptedSources,
        selectedSource: context.selectedSource,
      });
      viewer.innerHTML = `<p class="empty-state">The WebGL player could not start: ${context.reason}</p>`;
    },
  });
}

uiQualitySelect?.addEventListener('change', () => {
  const targetQuality = uiQualitySelect.value;
  if (!player) {
    loadPlayer(targetQuality);
    return;
  }

  const previousQuality = player.getState().selectedSource?.quality;
  player.setQuality(targetQuality).then((result) => {
    writeEvent('quality_change', result);
    if (!result.ok && previousQuality) {
      uiQualitySelect.value = previousQuality;
    }
  }).catch((error) => {
    writeEvent('quality_change_failed', { targetQuality, error: String(error) });
    if (previousQuality) {
      uiQualitySelect.value = previousQuality;
    }
  });
});

queueMicrotask(() => {
  syncColorControls();
  loadPlayer();
});

window.addEventListener('pagehide', () => {
  player?.destroy();
});

function writeEvent(eventName: string, payload?: unknown): void {
  if (!eventLog) {
    return;
  }

  eventLog.textContent = JSON.stringify({
    event: eventName,
    payload,
    at: new Date().toISOString(),
  }, null, 2);
}

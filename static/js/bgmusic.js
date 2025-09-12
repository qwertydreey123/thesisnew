function initBackgroundMusic() {
    // Static variables to keep state and avoid duplicate listeners
    if (!initBackgroundMusic.state) {
        initBackgroundMusic.state = {
            bgMusic: null,
            volumeListenersAdded: false,
            muteListenersAdded: false,
            isBgmMuted: false,
            previousBgmVolume: 50,
            sfxVolume: 1,
            isSfxMuted: false,
            settingsLoaded: false
        };
    }

    const state = initBackgroundMusic.state;

    // Get control elements
    const volumeSlider = document.getElementById('volume');
    const sfxVolumeSlider = document.getElementById('sfx-volume');
    const muteCheckbox = document.getElementById('muteCheckbox');
    const sfxMuteCheckbox = document.getElementById('sfxMuteCheckbox');

    // Load saved settings once
    if (!state.settingsLoaded) {
        const savedBgmVolume = localStorage.getItem('bgmVolume');
        const savedBgmMute = localStorage.getItem('bgmMuted');
        const savedSfxVolume = localStorage.getItem('sfxVolume');
        const savedSfxMute = localStorage.getItem('sfxMuted');

        if (savedBgmVolume !== null) {
            const vol = parseInt(savedBgmVolume, 10);
            if (!isNaN(vol)) {
                state.previousBgmVolume = vol;
                if (volumeSlider) volumeSlider.value = vol;
            }
        }
        if (savedBgmMute === 'true') {
            state.isBgmMuted = true;
        }
        if (savedSfxVolume !== null) {
            const sfxVol = parseFloat(savedSfxVolume);
            if (!isNaN(sfxVol)) {
                state.sfxVolume = sfxVol;
                if (sfxVolumeSlider) sfxVolumeSlider.value = sfxVol * 100;
            }
        }
        if (savedSfxMute === 'true') {
            state.isSfxMuted = true;
        }
        state.settingsLoaded = true;
    }

    // Create or reuse bgMusic element
    if (!state.bgMusic) {
        let bgMusic = document.getElementById('bg-music');
        if (!bgMusic) {
            bgMusic = document.createElement('audio');
            bgMusic.id = 'bg-music';
            bgMusic.loop = true;
            bgMusic.autoplay = false;
            document.body.appendChild(bgMusic);
        }
        state.bgMusic = bgMusic;
    }

    // Determine current bgm source based on map parameter or attribute
    const bodyBgmAttr = document.body.getAttribute('data-bgm');
    let bgMusicSrc = '';
    if (bodyBgmAttr === 'dynamic') {
        const urlParams = new URLSearchParams(window.location.search);
        const selectedMap = urlParams.get('map') || 'multiplication';
        const mapMusicSources = {
            multiplication: '/static/bgm/multiplication.mp3',
            addition: '/static/bgm/addition.mp3',
            subtraction: '/static/bgm/subtraction.mp3',
            division: '/static/bgm/division.mp3',
            counting: '/static/bgm/counting.mp3',
            comparison: '/static/bgm/comparison.mp3',
            numerals: '/static/bgm/numerals.mp3',
            placevalue: '/static/bgm/placevalue.mp3',
        };
        bgMusicSrc = mapMusicSources[selectedMap] || '';
    } else if (bodyBgmAttr) {
        bgMusicSrc = bodyBgmAttr;
    }

    // Update audio source only if changed
    if (bgMusicSrc && state.bgMusic.src !== bgMusicSrc) {
        state.bgMusic.src = bgMusicSrc;
        state.bgMusic.load(); // reload the source
    }

    // Set volume and mute state
    state.bgMusic.volume = state.isBgmMuted ? 0 : state.previousBgmVolume / 100;
    state.bgMusic.muted = state.isBgmMuted;

    // Add volume listeners once
    if (!state.volumeListenersAdded) {
        if (volumeSlider) {
            volumeSlider.addEventListener('input', () => {
                if (state.isBgmMuted) return;
                const value = volumeSlider.value;
                state.bgMusic.volume = value / 100;
                state.previousBgmVolume = parseInt(value, 10);
                localStorage.setItem('bgmVolume', value);
            });
        }
        if (sfxVolumeSlider) {
            sfxVolumeSlider.addEventListener('input', () => {
                if (state.isSfxMuted) return;
                state.sfxVolume = sfxVolumeSlider.value / 100;
                localStorage.setItem('sfxVolume', state.sfxVolume);
            });
        }
        state.volumeListenersAdded = true;
    }

    // Add mute listeners once
    if (!state.muteListenersAdded) {
        if (muteCheckbox) {
            muteCheckbox.checked = state.isBgmMuted;
            muteCheckbox.addEventListener('change', (e) => {
                state.isBgmMuted = e.target.checked;
                state.bgMusic.volume = state.isBgmMuted ? 0 : (volumeSlider ? volumeSlider.value / 100 : state.previousBgmVolume / 100);
                state.bgMusic.muted = state.isBgmMuted;
                localStorage.setItem('bgmMuted', state.isBgmMuted);
            });
        }

        if (sfxMuteCheckbox) {
            sfxMuteCheckbox.checked = state.isSfxMuted;
            sfxMuteCheckbox.addEventListener('change', (e) => {
                state.isSfxMuted = e.target.checked;
                localStorage.setItem('sfxMuted', state.isSfxMuted);
            });
        }
        state.muteListenersAdded = true;
    }

    // Detect if page reload (using PerformanceNavigationTiming API)
    const perfEntries = performance.getEntriesByType("navigation");
    const isReload = perfEntries.length > 0 && perfEntries[0].type === "reload";

    if (isReload) {
        // On reload, play only on first user interaction
        const playOnInteraction = () => {
            state.bgMusic.play().catch(e => console.log('Autoplay prevented:', e));
            window.removeEventListener('click', playOnInteraction);
            window.removeEventListener('keydown', playOnInteraction);
            window.removeEventListener('touchstart', playOnInteraction);
        };
        window.addEventListener('click', playOnInteraction);
        window.addEventListener('keydown', playOnInteraction);
        window.addEventListener('touchstart', playOnInteraction);
    } else {
        // Normal load, autoplay if not muted
        if (!state.isBgmMuted) {
            state.bgMusic.play().catch(e => console.log('Autoplay prevented:', e));
        }
    }
}

// Initialize on page load
window.addEventListener('load', initBackgroundMusic);

// Handle pageshow (back-forward cache) to resume bgMusic if paused
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic && bgMusic.paused) {
            bgMusic.play().catch(err => console.warn('Autoplay blocked:', err));
        }
    }
});

// Global sound functions
window.playSound = function(src, delay = 0) {
    // Try to get volume slider by id; fallback to default volume 1
    const sfxVolumeSlider = document.getElementById('sfx-volume');
    let volume = 1;
    
    // If slider exists, read volume from slider
    if (sfxVolumeSlider) {
        volume = parseFloat(sfxVolumeSlider.value) / 100;
    } else {
        // Optionally, get volume from localStorage (if you want volume to persist)
        const storedVolume = localStorage.getItem('sfxVolume');
        if (storedVolume !== null) {
            volume = parseFloat(storedVolume);
        }
    }
    
    // Get mute status from localStorage (should be persistent across pages)
    const isSfxMuted = localStorage.getItem('sfxMuted') === 'true';

    // Stop playing if muted or volume is zero
    if (isSfxMuted || volume === 0) return;

    setTimeout(() => {
        const sound = new Audio(src);
        sound.volume = volume;
        sound.play();
    }, delay);
};

window.muteBgMusic = function () {
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) bgMusic.muted = true;
};

window.unmuteBgMusic = function () {
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) bgMusic.muted = false;
};

window.toggleBgMusic = function () {
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) bgMusic.muted = !bgMusic.muted;
};

window.toggleSfxMute = function() {
    const sfxMuteCheckbox = document.getElementById('sfxMuteCheckbox');
    if (!sfxMuteCheckbox) return;

    // Toggle the checked state
    sfxMuteCheckbox.checked = !sfxMuteCheckbox.checked;

    // Update localStorage
    localStorage.setItem('sfxMuted', sfxMuteCheckbox.checked);

    // (Optional) You can add any additional logic here if needed
};


// *** NEW CODE FOR AUTO MUTE WHEN TAB IS NOT ACTIVE ***

document.addEventListener('visibilitychange', () => {
    const bgMusic = document.getElementById('bg-music');
    if (!bgMusic) return;

    if (document.hidden) {
        bgMusic.muted = true;
    } else {
        // Restore the intended mute state from localStorage
        const isBgmMuted = localStorage.getItem('bgmMuted') === 'true';
        bgMusic.muted = isBgmMuted;
    }
});

// ===== PHONEME MAPPING =====
// Map Vietnamese characters to lip image numbers based on the reference chart
const PHONEME_MAP = {
  // Lip #1: A, Ă
  1: { chars: ['a', 'ă', 'á', 'à', 'ả', 'ã', 'ạ', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ'], label: 'A, Ă' },
  // Lip #2: V, PH
  2: { chars: ['v', 'p', 'f'], label: 'V, PH' },
  // Lip #3: U, Ô
  3: { chars: ['u', 'ô', 'ú', 'ù', 'ủ', 'ũ', 'ụ', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ'], label: 'U, Ô' },
  // Lip #4: X, TR
  4: { chars: ['x', 's'], label: 'X, S' },
  // Lip #5: Đ, L, N
  5: { chars: ['đ', 'l', 'n', 'd'], label: 'Đ, L, N' },
  // Lip #6: M
  6: { chars: ['m', 'b', 'p'], label: 'M, B, P' },
  // Lip #7: E, Ê, I, Y
  7: { chars: ['e', 'ê', 'i', 'y', 'é', 'è', 'ẻ', 'ẽ', 'ẹ', 'ế', 'ề', 'ể', 'ễ', 'ệ', 'í', 'ì', 'ỉ', 'ĩ', 'ị', 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'], label: 'E, Ê, I, Y' },
  // Lip #8: Ư
  8: { chars: ['ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự'], label: 'Ư' },
  // Lip #9: Â, B, Ơ
  9: { chars: ['â', 'ơ', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ'], label: 'Â, Ơ' },
  // Lip #10: K, CH
  10: { chars: ['k', 'c'], label: 'K, C' },
  // Lip #11: R
  11: { chars: ['r'], label: 'R' },
  // Lip #12: O, Q
  12: { chars: ['o', 'q', 'ó', 'ò', 'ỏ', 'õ', 'ọ'], label: 'O, Q' },
  // Lip #13: SMIRK
  13: { chars: [], label: 'SMIRK' },
  // Lip #14: SAD
  14: { chars: [], label: 'SAD' },
  // Lip #15: TH, T
  15: { chars: ['t'], label: 'TH, T' },
  // Lip #16: C, D
  16: { chars: [], label: 'C, D' },
  // Lip #17: NEUTRAL (silent/default)
  17: { chars: [], label: 'NEUTRAL' },
  // Lip #18: SMILE
  18: { chars: [], label: 'SMILE' },
  // Lip #19: NH
  19: { chars: ['h'], label: 'H' },
  // Lip #20: G
  20: { chars: ['g'], label: 'G' },
};

const NEUTRAL_LIP = 17;

// ===== DOM Elements =====
const lipOverlay = document.getElementById('lipOverlay');
const phonemeValue = document.getElementById('phonemeValue');
const uploadArea = document.getElementById('uploadArea');
const filesInput = document.getElementById('filesInput');
const nowPlaying = document.getElementById('nowPlaying');
const trackName = document.getElementById('trackName');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStop = document.getElementById('btnStop');
const btnUploadNew = document.getElementById('btnUploadNew');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const characterContainer = document.getElementById('characterContainer');
const chartGrid = document.getElementById('chartGrid');
const timelineTokens = document.getElementById('timelineTokens');



// ===== Audio & Logic State =====
let audioPlayer = document.getElementById('audioPlayer');
let isPlaying = false;
let animationFrameId = null;
let currentLipId = NEUTRAL_LIP;
let currentTokenIndex = -1;

// The JSON alignment data
let alignmentData = [];
let lastActiveLipTime = 0; // Track when lip was last active for debounce
const NEUTRAL_GRACE_MS = 0.08; // 80ms grace period before returning to neutral



// ===== Preload all lip images =====
const lipImages = {};
for (let i = 1; i <= 20; i++) {
  const img = new Image();
  img.src = `/assets/lips/${i}.png`;
  lipImages[i] = img;
}

// ===== Set Lip =====
function setLip(lipId) {
  if (lipId === currentLipId) return;
  currentLipId = lipId;
  lipOverlay.src = `/assets/lips/${lipId}.png`;
  phonemeValue.textContent = PHONEME_MAP[lipId].label;

  // Update chart active state
  document.querySelectorAll('.chart-item').forEach(item => {
    item.classList.toggle('active', item.dataset.lipId === String(lipId));
  });
}

// ===== Token -> LipID mapping logic =====
function getLipIdForToken(token) {
  // If empty or non-alphabetic, return neutral
  if (!token) return NEUTRAL_LIP;
  const char = token.toLowerCase().trim();
  if (!char) {
    return NEUTRAL_LIP;
  }

  // Handle multi-character phonemes first if any exist in the token string
  // For simplicity since the JSON looks character by character, we just match the single character

  for (const [lipId, data] of Object.entries(PHONEME_MAP)) {
    if (data.chars.includes(char)) {
      return parseInt(lipId);
    }
  }

  return NEUTRAL_LIP;
}

// ===== Animation Loop =====
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  if (!isPlaying) return;

  const time = audioPlayer.currentTime;

  // 1. Find current active token
  let activeIndex = -1;
  // Optimize: search around currentTokenIndex if playing forward
  for (let i = 0; i < alignmentData.length; i++) {
    const item = alignmentData[i];
    if (time >= item.start && time < item.end) {
      activeIndex = i;
      break;
    }
  }

  // 2. Set Lip State
  if (activeIndex !== -1) {
    const item = alignmentData[activeIndex];
    // Use pre-computed lipId from smoothAlignment, or compute on the fly
    const lipId = item._lipId || getLipIdForToken(item.token);
    setLip(lipId);
    lastActiveLipTime = time;
  } else {
    // Grace period: don't snap to neutral immediately between close tokens
    // Check if a next token is coming soon
    const timeSinceLastActive = time - lastActiveLipTime;
    if (timeSinceLastActive > NEUTRAL_GRACE_MS) {
      setLip(NEUTRAL_LIP);
    }
    // else: keep the last lip shape to prevent flicker
  }

  // 3. Update timeline UI
  if (activeIndex !== currentTokenIndex) {
    // Remove old active class
    if (currentTokenIndex !== -1 && timelineTokens.children[currentTokenIndex]) {
      timelineTokens.children[currentTokenIndex].classList.remove('active');
    }
    // Add new active class
    if (activeIndex !== -1 && timelineTokens.children[activeIndex]) {
      timelineTokens.children[activeIndex].classList.add('active');
    }
    currentTokenIndex = activeIndex;
  }

  // Scroll timeline to center active token
  if (audioPlayer.duration > 0) {
    const pct = time / audioPlayer.duration;
    // 100% of tokens width corresponds to audio duration
    const containerWidth = timelineTokens.parentElement.offsetWidth;
    const scrollPos = (pct * timelineTokens.scrollWidth) - (containerWidth / 2);
    timelineTokens.style.transform = `translateX(-${scrollPos}px)`;
  }

  updateProgress();
}

// ===== Build Timeline =====
function buildTimeline() {
  timelineTokens.innerHTML = '';

  // Calculate total duration from Audio or JSON data, whichever is longer
  let totalDuration = alignmentData.length > 0 ? alignmentData[alignmentData.length - 1].end : 0;
  if (audioPlayer.duration && audioPlayer.duration > totalDuration) {
    totalDuration = audioPlayer.duration;
  }
  if (totalDuration === 0) return;

  // Make timeline width dynamic based on container to fit screen roughly, or fixed scroll
  const containerWidth = timelineTokens.parentElement.offsetWidth || 500;
  // Ensure we have at least container width, up to a scrollable width
  const pixelsPerSecond = Math.max(containerWidth / totalDuration, 300);

  timelineTokens.style.width = (totalDuration * pixelsPerSecond) + 'px';

  alignmentData.forEach(item => {
    const span = document.createElement('span');
    span.className = 'timeline-token';

    let displayToken = item.token;
    if (displayToken === ' ') displayToken = '&nbsp;';
    span.innerHTML = displayToken;

    // Calculate absolute left & width
    const left = item.start * pixelsPerSecond;
    const width = (item.end - item.start) * pixelsPerSecond;

    span.style.position = 'absolute';
    span.style.left = left + 'px';
    span.style.width = width + 'px';

    timelineTokens.appendChild(span);
  });
}

// ===== Progress & Time =====
function updateProgress() {
  if (!audioPlayer.duration) return;
  const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  progressBar.style.width = `${pct}%`;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  totalTimeEl.textContent = formatTime(audioPlayer.duration);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ===== Build Lip Chart =====
function buildChart() {
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 19, 20, 17, 13, 14, 18];
  order.forEach(id => {
    const item = document.createElement('div');
    item.className = 'chart-item';
    item.dataset.lipId = id;
    if (id === NEUTRAL_LIP) item.classList.add('active');
    item.innerHTML = `
      <img src="/assets/lips/${id}.png" alt="${PHONEME_MAP[id].label}" />
      <span>${PHONEME_MAP[id].label}</span>
    `;
    // Click to preview
    item.addEventListener('click', () => setLip(id));
    chartGrid.appendChild(item);
  });
}

// ===== Startup Defaults & Load Logic =====
async function loadDefaultFiles() {
  try {
    const audioRes = await fetch('/audio-1.wav');
    if (!audioRes.ok) throw new Error("Audio 404");
    const audioBlob = await audioRes.blob();

    const jsonRes = await fetch('/alignment_audio-1.json');
    if (!jsonRes.ok) throw new Error("JSON 404");
    const jsonData = await jsonRes.json();

    processLoadedFiles(audioBlob, jsonData, "audio-1.wav (Mặc định)");
  } catch (e) {
    console.warn("Could not load default files", e);
  }
}

// Rescale alignment timestamps to match audio duration
function rescaleAlignment() {
  if (alignmentData.length === 0 || !audioPlayer.duration) return;

  // 1. Strip trailing empty/padding tokens first
  while (alignmentData.length > 0 && !alignmentData[alignmentData.length - 1].token.trim()) {
    alignmentData.pop();
  }
  if (alignmentData.length === 0) return;

  // 2. Find the end of actual speech content
  const jsonEnd = alignmentData[alignmentData.length - 1].end;
  if (jsonEnd <= 0) return;

  // 3. Rescale if there's a significant difference
  if (Math.abs(jsonEnd - audioPlayer.duration) > 0.1) {
    const scale = audioPlayer.duration / jsonEnd;
    console.log(`Rescaling JSON: ${jsonEnd.toFixed(3)}s → ${audioPlayer.duration.toFixed(3)}s (x${scale.toFixed(2)})`);
    alignmentData = alignmentData.map(item => ({
      ...item,
      start: item.start * scale,
      end: item.end * scale,
    }));
  }
}

// Smooth alignment: group by syllables, create consonant→vowel→close phases
function smoothAlignment() {
  if (alignmentData.length === 0) return;

  const vowels = 'aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ';

  // 1. Split tokens into syllable groups (separated by spaces/punctuation/empty)
  const syllables = [];
  let currentSyl = [];

  for (const item of alignmentData) {
    const t = item.token.trim();
    if (!t || t === ' ' || /^[^a-zA-ZÀ-ỹ]$/.test(t)) {
      if (currentSyl.length > 0) {
        syllables.push(currentSyl);
        currentSyl = [];
      }
    } else {
      currentSyl.push(item);
    }
  }
  if (currentSyl.length > 0) syllables.push(currentSyl);

  if (syllables.length === 0) {
    alignmentData = [];
    return;
  }

  // 2. For each syllable, create sub-phases: onset → vowel → coda
  const segments = [];

  for (const syl of syllables) {
    const sylStart = syl[0].start;
    const sylEnd = syl[syl.length - 1].end;
    const sylDur = sylEnd - sylStart;
    const fullToken = syl.map(s => s.token).join('');

    // Find consonant onset and vowel
    let onsetLipId = NEUTRAL_LIP;
    let vowelLipId = NEUTRAL_LIP;
    let codaLipId = NEUTRAL_LIP;
    let vowelFound = false;

    for (const item of syl) {
      const ch = item.token.toLowerCase().trim();
      if (!ch) continue;

      if (vowels.includes(ch)) {
        vowelLipId = getLipIdForToken(ch);
        vowelFound = true;
      } else if (!vowelFound) {
        // Consonant before vowel = onset
        onsetLipId = getLipIdForToken(ch);
      } else {
        // Consonant after vowel = coda
        codaLipId = getLipIdForToken(ch);
      }
    }

    // If no vowel found, use the onset consonant for the whole syllable
    if (vowelLipId === NEUTRAL_LIP) {
      vowelLipId = onsetLipId;
    }

    // Create sub-segments based on syllable duration
    if (sylDur < 0.08) {
      // Very short syllable: just use the vowel
      segments.push({ token: fullToken, start: sylStart, end: sylEnd, _lipId: vowelLipId });
    } else if (onsetLipId !== NEUTRAL_LIP && onsetLipId !== vowelLipId) {
      // Has distinct consonant onset: onset(25%) → vowel(75%)
      const onsetEnd = sylStart + sylDur * 0.25;
      segments.push({ token: fullToken[0], start: sylStart, end: onsetEnd, _lipId: onsetLipId });
      segments.push({ token: fullToken.slice(1), start: onsetEnd, end: sylEnd, _lipId: vowelLipId });
    } else {
      // No distinct onset: just vowel for the whole syllable
      segments.push({ token: fullToken, start: sylStart, end: sylEnd, _lipId: vowelLipId });
    }
  }

  console.log(`Smoothed: ${alignmentData.length} tokens → ${segments.length} sub-segments (from ${syllables.length} syllables)`);
  alignmentData = segments;
}

function processLoadedFiles(audioFile, jsonData, nameDisplay) {
  const url = URL.createObjectURL(audioFile);
  audioPlayer.src = url;

  // We must wait for duration to be known before building timeline
  audioPlayer.onloadedmetadata = () => {
    alignmentData = jsonData || [];
    rescaleAlignment();
    smoothAlignment();
    buildTimeline();
    updateProgress();
  };
  audioPlayer.load();

  trackName.textContent = nameDisplay;
  uploadArea.classList.add('hidden');
  nowPlaying.classList.remove('hidden');
}

// ===== File Upload Handlers =====
function handleFiles(files) {
  let audioFile = null;
  let jsonFile = null;

  for (const f of files) {
    if (f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|ogg|m4a)$/i)) {
      audioFile = f;
    } else if (f.type === 'application/json' || f.name.match(/\.json$/i)) {
      jsonFile = f;
    }
  }

  // Nếu đang có audio sẵn và người dùng kéo 1 cục JSON mới vào giao diện:
  if (!audioFile && jsonFile && audioPlayer.src) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        alignmentData = data || [];
        rescaleAlignment();
        smoothAlignment();
        buildTimeline();
        updateProgress();
      } catch (err) {
        alert("File JSON không hợp lệ!");
      }
    };
    reader.readAsText(jsonFile);
    return;
  }

  // Nếu upload audio bình thường
  if (!audioFile) {
    alert("Vui lòng tải lên ít nhất một file Audio!");
    return;
  }

  if (jsonFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const nameToUse = audioFile.name || "Custom Audio";
        processLoadedFiles(audioFile, data, nameToUse);
      } catch (err) {
        alert("File JSON không hợp lệ! Vẫn phát Audio.");
        const nameToUse = audioFile.name || "Custom Audio";
        processLoadedFiles(audioFile, null, nameToUse);
      }
    };
    reader.readAsText(jsonFile);
  } else {
    const nameToUse = audioFile.name || "Custom Audio";
    processLoadedFiles(audioFile, null, nameToUse);
  }
}

// ===== Playback Controls =====
async function togglePlay() {
  if (!audioPlayer.src) return;

  if (isPlaying) {
    audioPlayer.pause();
  } else {
    await audioPlayer.play();
  }
}

function stopPlayback() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  isPlaying = false;
  setLip(NEUTRAL_LIP);
  updatePlayButton();
  characterContainer.classList.remove('speaking');
  progressBar.style.width = '0%';
  currentTimeEl.textContent = '0:00';

  if (currentTokenIndex !== -1 && timelineTokens.children[currentTokenIndex]) {
    timelineTokens.children[currentTokenIndex].classList.remove('active');
  }
  currentTokenIndex = -1;
  timelineTokens.style.transform = `translateX(0px)`;
}

function updatePlayButton() {
  playIcon.classList.toggle('hidden', isPlaying);
  pauseIcon.classList.toggle('hidden', !isPlaying);
}

// ===== Event Listeners =====

// Upload Area Handlers
uploadArea.addEventListener('click', () => filesInput.click());
filesInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFiles(e.target.files);
  e.target.value = '';
});

// Drag & drop on Upload Area
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

// Drag & Drop on Now Playing Component (to hot-swap JSON)
nowPlaying.addEventListener('dragover', (e) => {
  e.preventDefault();
  nowPlaying.classList.add('drag-over');
});
nowPlaying.addEventListener('dragleave', () => {
  nowPlaying.classList.remove('drag-over');
});
nowPlaying.addEventListener('drop', (e) => {
  e.preventDefault();
  nowPlaying.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

// Playback buttons
btnPlayPause.addEventListener('click', togglePlay);
btnStop.addEventListener('click', stopPlayback);
btnUploadNew.addEventListener('click', () => {
  stopPlayback();
  audioPlayer.src = '';
  nowPlaying.classList.add('hidden');
  uploadArea.classList.remove('hidden');
  alignmentData = [];
});

// Audio events
audioPlayer.addEventListener('play', () => {
  isPlaying = true;
  updatePlayButton();
  characterContainer.classList.add('speaking');
  if (!animationFrameId) animate();
});

audioPlayer.addEventListener('pause', () => {
  isPlaying = false;
  updatePlayButton();
  characterContainer.classList.remove('speaking');
  setLip(NEUTRAL_LIP);
});

audioPlayer.addEventListener('ended', () => {
  isPlaying = false;
  updatePlayButton();
  characterContainer.classList.remove('speaking');
  setLip(NEUTRAL_LIP);
  progressBar.style.width = '100%';
});

// Progress bar seek
progressContainer.addEventListener('click', (e) => {
  if (!audioPlayer.duration) return;
  const rect = progressContainer.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioPlayer.currentTime = pct * audioPlayer.duration;
});

// ===== Init =====
buildChart();
loadDefaultFiles();

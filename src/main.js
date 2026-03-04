// Base URL for assets (works with GitHub Pages subdirectory)
const BASE = import.meta.env.BASE_URL;

// ===== PHONEME MAPPING =====
// Map Vietnamese characters to lip image numbers based on the reference chart
const PHONEME_MAP = {
  // Lip #1: A, Ă
  1: {
    chars: ["a", "ă", "á", "à", "ả", "ã", "ạ", "ắ", "ằ", "ẳ", "ẵ", "ặ"],
    label: "A, Ă",
  },
  // Lip #2: V, PH
  2: { chars: ["v", "f", "ph"], label: "V, PH" },
  // Lip #3: U, Ô
  3: {
    chars: ["u", "ô", "ú", "ù", "ủ", "ũ", "ụ", "ố", "ồ", "ổ", "ỗ", "ộ"],
    label: "U, Ô",
  },
  // Lip #4: X, S
  4: { chars: ["x", "s"], label: "X, S" },
  // Lip #5: Đ, L, N
  5: { chars: ["đ", "l", "n", "d"], label: "Đ, L, N" },
  // Lip #6: M, B, P
  6: { chars: ["m", "b", "p"], label: "M, B, P" },
  // Lip #7: E, Ê, I, Y
  7: {
    chars: [
      "e",
      "ê",
      "i",
      "y",
      "é",
      "è",
      "ẻ",
      "ẽ",
      "ẹ",
      "ế",
      "ề",
      "ể",
      "ễ",
      "ệ",
      "í",
      "ì",
      "ỉ",
      "ĩ",
      "ị",
      "ý",
      "ỳ",
      "ỷ",
      "ỹ",
      "ỵ",
    ],
    label: "E, Ê, I, Y",
  },
  // Lip #8: Ư
  8: { chars: ["ư", "ứ", "ừ", "ử", "ữ", "ự"], label: "Ư" },
  // Lip #9: Â, Ơ
  9: {
    chars: ["â", "ơ", "ấ", "ầ", "ẩ", "ẫ", "ậ", "ớ", "ờ", "ở", "ỡ", "ợ"],
    label: "Â, Ơ",
  },
  // Lip #10: K, C (âm /k/ đơn)
  10: { chars: ["k", "c", "q"], label: "K, C" },
  // Lip #11: R
  11: { chars: ["r"], label: "R" },
  // Lip #12: O
  12: { chars: ["o", "ó", "ò", "ỏ", "õ", "ọ"], label: "O" },
  // Lip #13: SMIRK
  13: { chars: [], label: "SMIRK" },
  // Lip #14: SAD
  14: { chars: [], label: "SAD" },
  // Lip #15: TH, T — môi hở nhẹ, lưỡi sau răng
  15: { chars: ["t", "th"], label: "TH, T" },
  // Lip #16: CH — âm /tɕ/, miệng hé, lưỡi giữa
  16: { chars: ["ch", "tr"], label: "CH, TR" },
  // Lip #17: NEUTRAL (silent/default)
  17: { chars: [], label: "NEUTRAL" },
  // Lip #18: SMILE
  18: { chars: [], label: "SMILE" },
  // Lip #19: NH, H — hơi thở qua mũi/họng
  19: { chars: ["h", "nh", "gi", "gh"], label: "NH, H" },
  // Lip #20: G, NG — âm cổ họng
  20: { chars: ["g", "ng", "ngh", "kh"], label: "G, NG" },
};

// ===== DIGRAPH / TRIGRAPH tiếng Việt =====
// Thứ tự quan trọng: trigraph trước, digraph trước, đơn sau
const VI_CLUSTERS = [
  "ngh",
  "ch",
  "gh",
  "gi",
  "kh",
  "ng",
  "nh",
  "ph",
  "th",
  "tr",
];

const NEUTRAL_LIP = 17;

// ===== DOM Elements =====
const lipOverlay = document.getElementById("lipOverlay");
const phonemeValue = document.getElementById("phonemeValue");
const uploadArea = document.getElementById("uploadArea");
const filesInput = document.getElementById("filesInput");
const nowPlaying = document.getElementById("nowPlaying");
const trackName = document.getElementById("trackName");
const btnPlayPause = document.getElementById("btnPlayPause");
const btnStop = document.getElementById("btnStop");
const btnUploadNew = document.getElementById("btnUploadNew");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const progressBar = document.getElementById("progressBar");
const progressContainer = document.getElementById("progressContainer");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");
const characterContainer = document.getElementById("characterContainer");
const chartGrid = document.getElementById("chartGrid");
const timelineTokens = document.getElementById("timelineTokens");

// ===== Audio & Logic State =====
let audioPlayer = document.getElementById("audioPlayer");
let isPlaying = false;
let animationFrameId = null;
let currentLipId = NEUTRAL_LIP;
let currentTokenIndex = -1;

// The JSON alignment data
let alignmentData = [];
let lastActiveLipTime = 0; // Track when lip was last active for debounce
const NEUTRAL_GRACE_MS = 0.08; // 80ms grace period before returning to neutral

// ===== Web Audio API for Real-time Fallback =====
let audioContext = null;
let analyser = null;
let dataArray = null;
let sourceNode = null;

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    sourceNode = audioContext.createMediaElementSource(audioPlayer);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
  }
}

// ===== Preload all lip images =====
const lipImages = {};
for (let i = 1; i <= 20; i++) {
  const img = new Image();
  img.src = `${BASE}assets/lips/${i}.png`;
  lipImages[i] = img;
}

// ===== Set Lip =====
const lipOverlay2 = document.getElementById("lipOverlay2");
lipOverlay.style.opacity = "1";
const MIN_HOLD_MS = 100; // Mỗi khẩu hình giữ ít nhất 150ms
let lastLipChangeTime = 0;

function setLip(lipId, tokenText) {
  if (lipId === currentLipId && !tokenText) return;

  const now = performance.now();
  const elapsed = now - lastLipChangeTime;

  // Debounce nháy quá nhanh (chỉ áp dụng nếu đang đổi sang hình khác neutral)
  if (
    elapsed < MIN_HOLD_MS &&
    lipId !== NEUTRAL_LIP &&
    currentLipId !== NEUTRAL_LIP
  ) {
    return;
  }

  currentLipId = lipId;
  lastLipChangeTime = now;

  // Kỹ thuật cross-fade bằng CSS Opacity
  if (lipOverlay.style.opacity === "0.02") {
    lipOverlay.src = `${BASE}assets/lips/${lipId}.png`;
    lipOverlay.style.opacity = "1";
    lipOverlay2.style.opacity = "0.02";
  } else {
    lipOverlay2.src = `${BASE}assets/lips/${lipId}.png`;
    lipOverlay2.style.opacity = "1";
    lipOverlay.style.opacity = "0.02";
  }

  phonemeValue.textContent = tokenText || PHONEME_MAP[lipId].label;

  // Update chart active state
  document.querySelectorAll(".chart-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.lipId === String(lipId));
  });
}

// ===== Token -> LipID mapping logic =====
function getLipIdForToken(token) {
  // If empty or non-alphabetic, return neutral
  if (!token) return NEUTRAL_LIP;
  const normalized = token.toLowerCase().trim();
  if (!normalized) return NEUTRAL_LIP;

  // Tìm trong PHONEME_MAP (hỗ trợ cả digraph lẫn ký tự đơn)
  for (const [lipId, data] of Object.entries(PHONEME_MAP)) {
    if (data.chars.includes(normalized)) {
      return parseInt(lipId);
    }
  }

  return NEUTRAL_LIP;
}

// ===== Gom các token liên tiếp thành digraph/trigraph =====
// Ví dụ: [{token:"c"},{token:"h"}] → [{token:"ch", start, end}]
function mergeClusterTokens(sylItems) {
  if (sylItems.length === 0) return sylItems;
  const merged = [];
  let i = 0;
  while (i < sylItems.length) {
    let matched = false;
    // Thử ghép 3 ký tự trước (ngh)
    if (i + 2 < sylItems.length) {
      const tri = (
        sylItems[i].token +
        sylItems[i + 1].token +
        sylItems[i + 2].token
      ).toLowerCase();
      if (VI_CLUSTERS.includes(tri)) {
        merged.push({
          token: tri,
          start: sylItems[i].start,
          end: sylItems[i + 2].end,
        });
        i += 3;
        matched = true;
      }
    }
    // Thử ghép 2 ký tự (ch, nh, ng, ...)
    if (!matched && i + 1 < sylItems.length) {
      const di = (sylItems[i].token + sylItems[i + 1].token).toLowerCase();
      if (VI_CLUSTERS.includes(di)) {
        merged.push({
          token: di,
          start: sylItems[i].start,
          end: sylItems[i + 1].end,
        });
        i += 2;
        matched = true;
      }
    }
    if (!matched) {
      merged.push(sylItems[i]);
      i++;
    }
  }
  return merged;
}

// ===== Tách đa âm tiết trong một từ =====
// VD: "Lumi" = [L,u,m,i] → [[L,u], [m,i]]   (Lu + mi = 2 âm tiết)
function splitToSubSyllables(items, vowelSet) {
  const result = [];
  let current = [];
  let vowelFound = false;

  for (let i = 0; i < items.length; i++) {
    const ch = items[i].token.toLowerCase().trim();
    const isVowel = vowelSet.includes(ch);

    if (isVowel && vowelFound) {
      // Đã có nguyên âm trước → kiểm tra cái trước nó có phải phụ âm không
      const prev = current[current.length - 1];
      const prevCh = prev ? prev.token.toLowerCase().trim() : "";
      const prevIsVowel = vowelSet.includes(prevCh);

      if (!prevIsVowel && prevCh !== "") {
        // Phụ âm cầu nối → tách: phụ âm đó đi với âm tiết tiếp theo
        const bridgeConsonant = current.pop(); // tách phụ âm cầu ra
        result.push(current); // lưu âm tiết cũ
        current = [bridgeConsonant, items[i]]; // bắt đầu âm tiết mới
        vowelFound = true;
      } else {
        // Hai nguyên âm liền nhau (VD: "oa", "ui") → cùng âm tiết
        current.push(items[i]);
      }
    } else {
      if (isVowel) vowelFound = true;
      current.push(items[i]);
    }
  }

  if (current.length > 0) result.push(current);
  return result.length > 0 ? result : [items];
}

// ===== Animation Loop =====
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  if (!isPlaying) return;

  const time = audioPlayer.currentTime;

  // 1. Find current active token
  let activeIndex = -1;
  // Optimize: search around currentTokenIndex if playing forward
  if (alignmentData.length > 0) {
    for (let i = 0; i < alignmentData.length; i++) {
      const item = alignmentData[i];
      if (time >= item.start && time < item.end) {
        activeIndex = i;
        break;
      }
    }
  }

  // --- 2. Gating Âm Lượng & Hiệu Ứng Anime Squash & Stretch ---
  let currentVolume = 0;
  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    currentVolume = sum / dataArray.length; // 0–255
  }

  // Hiệu ứng "Anime": Mở to miệng khi volume lớn, thu hẹp lại khi volume nhỏ.
  // Base scale = 1, tối đa scale Y lên 1.3 và thu hẹp Scale X xuống 0.95 (Squash & stretch)
  let scaleY = 1.0;
  let scaleX = 1.0;
  if (currentVolume > 2) {
    // 2 = rất nhạy để bắt cả các âm gió nhỏ
    const volumeRatio = Math.min(currentVolume / 70, 1); // Đạt 70 là max há to rồi
    scaleY = 1.0 + 0.35 * volumeRatio;
    // Nhép miệng cao lên thì bề ngang hẹp lại chút xíu cho tự nhiên
    scaleX = 1.0 - 0.05 * volumeRatio;
  }

  // Áp dụng CSS Transform trực tiếp
  lipOverlay.style.transform = `translateX(-50%) scale(${scaleX}, ${scaleY})`;
  lipOverlay2.style.transform = `translateX(-50%) scale(${scaleX}, ${scaleY})`;

  const SILENCE_THRESHOLD = 5;
  const isSilent = currentVolume < SILENCE_THRESHOLD;

  // 3. Set Lip State
  if (activeIndex !== -1 && !isSilent) {
    const item = alignmentData[activeIndex];
    const lipId = item._lipId || getLipIdForToken(item.token);
    // Show the token text (word being spoken)
    const displayText = item.token || "";
    setLip(lipId, displayText.toUpperCase());
    lastActiveLipTime = time;
  } else if (isSilent) {
    // Về NEUTRAL ngay khi im lặng
    const timeSinceLastActive = time - lastActiveLipTime;
    if (timeSinceLastActive > 0.05) {
      setLip(NEUTRAL_LIP);
    }
  } else if (alignmentData.length === 0 && analyser && isPlaying) {
    // REAL-TIME AUDIO ANALYSIS FALLBACK (Volume based)
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const averageVolume = sum / dataArray.length; // Range 0 - 255

    // Map volume to standard lip shapes based on openness
    // Neutral (17), Slight open (7 - E/I), Medium open (12 - O), Wide open (1 - A)
    let dynamicLipId = NEUTRAL_LIP;

    if (averageVolume > 70) {
      dynamicLipId = 1; // Wide open (A)
      phonemeValue.textContent = "🔊 (A)";
    } else if (averageVolume > 40) {
      dynamicLipId = 12; // Medium open (O)
      phonemeValue.textContent = "🔉 (O)";
    } else if (averageVolume > 15) {
      dynamicLipId = 7; // Slightly open (E/I)
      phonemeValue.textContent = "🔈 (E)";
    } else if (averageVolume > 5) {
      dynamicLipId = 6; // Closed but active (M/B/P)
      phonemeValue.textContent = "🔇 (M)";
    } else {
      dynamicLipId = NEUTRAL_LIP;
      phonemeValue.textContent = "Mute";
    }

    // Debounce rapid fluttering by applying a tiny grace period
    const timeSinceLastActive = time - lastActiveLipTime;
    if (dynamicLipId !== currentLipId && timeSinceLastActive > 0.05) {
      if (dynamicLipId !== NEUTRAL_LIP) {
        setLip(dynamicLipId, phonemeValue.textContent);
      } else {
        setLip(NEUTRAL_LIP);
      }
      lastActiveLipTime = time;
    }
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
    if (
      currentTokenIndex !== -1 &&
      timelineTokens.children[currentTokenIndex]
    ) {
      timelineTokens.children[currentTokenIndex].classList.remove("active");
    }
    // Add new active class
    if (activeIndex !== -1 && timelineTokens.children[activeIndex]) {
      timelineTokens.children[activeIndex].classList.add("active");
    }
    currentTokenIndex = activeIndex;
  }

  // Scroll timeline to center active token
  if (audioPlayer.duration > 0 && alignmentData.length > 0) {
    const pct = time / audioPlayer.duration;
    // 100% of tokens width corresponds to audio duration
    const containerWidth = timelineTokens.parentElement.offsetWidth;
    const scrollPos = pct * timelineTokens.scrollWidth - containerWidth / 2;
    timelineTokens.style.transform = `translateX(-${scrollPos}px)`;
  }
  updateProgress();
}

// ===== Build Timeline =====
function buildTimeline() {
  timelineTokens.innerHTML = "";

  // Calculate total duration from Audio or JSON data, whichever is longer
  let totalDuration =
    alignmentData.length > 0 ? alignmentData[alignmentData.length - 1].end : 0;
  if (audioPlayer.duration && audioPlayer.duration > totalDuration) {
    totalDuration = audioPlayer.duration;
  }
  if (totalDuration === 0) return;

  // Make timeline width dynamic based on container to fit screen roughly, or fixed scroll
  const containerWidth = timelineTokens.parentElement.offsetWidth || 500;
  // Ensure we have at least container width, up to a scrollable width
  const pixelsPerSecond = Math.max(containerWidth / totalDuration, 300);

  if (alignmentData.length > 0) {
    timelineTokens.style.width = totalDuration * pixelsPerSecond + "px";
  } else {
    timelineTokens.style.width = "100%";
  }

  alignmentData.forEach((item) => {
    const span = document.createElement("span");
    span.className = "timeline-token";

    let displayToken = item.token;
    if (displayToken === " ") displayToken = "&nbsp;";
    span.innerHTML = displayToken;

    // Calculate absolute left & width
    const left = item.start * pixelsPerSecond;
    const width = (item.end - item.start) * pixelsPerSecond;

    span.style.position = "absolute";
    span.style.left = left + "px";
    span.style.width = width + "px";

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
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ===== Build Lip Chart =====
function buildChart() {
  const order = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 19, 20, 17, 13, 14, 18,
  ];
  order.forEach((id) => {
    const item = document.createElement("div");
    item.className = "chart-item";
    item.dataset.lipId = id;
    if (id === NEUTRAL_LIP) item.classList.add("active");
    item.innerHTML = `
      <img src="${BASE}assets/lips/${id}.png" alt="${PHONEME_MAP[id].label}" />
      <span>${PHONEME_MAP[id].label}</span>
    `;
    // Click to preview
    item.addEventListener("click", () => setLip(id));
    chartGrid.appendChild(item);
  });
}

// ===== Startup Defaults & Load Logic =====
async function loadDefaultFiles() {
  try {
    const audioRes = await fetch(`${BASE}au-2.wav`);
    if (!audioRes.ok) throw new Error("Audio 404");
    const audioBlob = await audioRes.blob();

    const jsonRes = await fetch(`${BASE}alignment_au-2.json`);
    if (!jsonRes.ok) throw new Error("JSON 404");
    const jsonData = await jsonRes.json();

    processLoadedFiles(audioBlob, jsonData, "au-2.wav (Mặc định)");
  } catch (e) {
    console.warn("Could not load default files", e);
  }
}

// Rescale alignment timestamps to match audio duration
function rescaleAlignment() {
  if (alignmentData.length === 0 || !audioPlayer.duration) return;

  // 1. Strip metadata block [lang:vi] from beginning
  if (alignmentData[0].token === "[") {
    let metaEnd = 0;
    for (let i = 0; i < alignmentData.length; i++) {
      if (alignmentData[i].token === "]") {
        metaEnd = i + 1;
        break;
      }
    }
    if (metaEnd > 0) {
      const metaEndTime = alignmentData[metaEnd - 1].end;
      alignmentData = alignmentData.slice(metaEnd);
      // Offset all timestamps so speech starts at 0
      alignmentData = alignmentData.map((item) => ({
        ...item,
        start: Math.max(0, item.start - metaEndTime),
        end: item.end - metaEndTime,
      }));
      console.log(
        `Stripped metadata: removed ${metaEnd} tokens, offset by ${metaEndTime.toFixed(4)}s`,
      );
    }
  }

  // 2. Strip trailing empty/padding tokens
  while (
    alignmentData.length > 0 &&
    !alignmentData[alignmentData.length - 1].token.trim()
  ) {
    alignmentData.pop();
  }
  if (alignmentData.length === 0) return;

  // 3. Find the end of actual speech content
  const jsonEnd = alignmentData[alignmentData.length - 1].end;
  if (jsonEnd <= 0) return;

  // 4. Rescale if there's a significant difference
  if (Math.abs(jsonEnd - audioPlayer.duration) > 0.1) {
    const scale = audioPlayer.duration / jsonEnd;
    console.log(
      `Rescaling JSON: ${jsonEnd.toFixed(3)}s → ${audioPlayer.duration.toFixed(3)}s (x${scale.toFixed(2)})`,
    );
    alignmentData = alignmentData.map((item) => ({
      ...item,
      start: item.start * scale,
      end: item.end * scale,
    }));
  }
}

// Smooth alignment: group by syllables, create consonant→vowel→close phases
function smoothAlignment() {
  if (alignmentData.length === 0) return;

  const vowels =
    "aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ";

  // Phụ âm xát/mũi/lỏng: khẩu hình miệng kết hợp nhanh với nguyên âm, không cần chớp riêng
  const singleFrameOnsets = [
    // Phụ âm xát/mũi/lỏng: hòa vào nguyên âm rất nhanh
    "x",
    "s",
    "h",
    "ph",
    "v",
    "m",
    "n",
    "nh",
    "l",
    "r",
    "d",
    "gi",
    "p",
    "đ",
    "g",
    "c",
  ];

  // 0. Strip metadata block [lang:vi] from beginning
  let startIdx = 0;
  if (alignmentData.length > 0 && alignmentData[0].token === "[") {
    for (let i = 0; i < alignmentData.length; i++) {
      if (alignmentData[i].token === "]") {
        startIdx = i + 1;
        break;
      }
    }
  }
  const cleanData = alignmentData.slice(startIdx);

  // 1. Split tokens into syllable groups (separated by spaces/punctuation/empty)
  // Đồng thời ghi nhận các dấu câu (., !, ?) làm điểm nghỉ (pause)
  const syllables = [];
  const pauseAfterSyl = []; // parallel array: true nếu sau syllable đó có dấu câu
  let currentSyl = [];
  let pendingPause = false; // có dấu câu đang chờ

  for (const item of cleanData) {
    const t = item.token.trim();
    if (!t || t === " " || /^[^a-zA-ZÀ-ỹ]$/.test(t)) {
      // Kiểm tra có phải dấu câu (nghỉ) không
      if (/^[.!?;,]$/.test(t)) {
        pendingPause = true;
      }
      if (currentSyl.length > 0) {
        syllables.push(currentSyl);
        pauseAfterSyl.push(pendingPause);
        pendingPause = false;
        currentSyl = [];
      }
    } else {
      currentSyl.push(item);
    }
  }
  if (currentSyl.length > 0) {
    syllables.push(currentSyl);
    pauseAfterSyl.push(false);
  }

  if (syllables.length === 0) {
    alignmentData = [];
    return;
  }

  // 2. For each syllable, create sub-phases: onset → vowel
  const segments = [];

  for (let sylIdx = 0; sylIdx < syllables.length; sylIdx++) {
    const rawSyl = syllables[sylIdx];
    // Gom digraph/trigraph trước khi phân tích
    const merged = mergeClusterTokens(rawSyl);

    // Tách đa âm tiết trong 1 từ (VD: "Lumi" → ["Lu","mi"])
    const subSyllables = splitToSubSyllables(merged, vowels);

    for (const syl of subSyllables) {
      const sylStart = syl[0].start;
      const sylEnd = syl[syl.length - 1].end;
      const sylDur = sylEnd - sylStart;
      const fullToken = rawSyl.map((s) => s.token).join(""); // hiển thị nguyên bản toàn từ

      // Find consonant onset and vowel (sau khi đã gom digraph)
      let onsetLipId = NEUTRAL_LIP;
      let vowelLipId = NEUTRAL_LIP;
      let vowelFound = false;

      // Phân tích từ để lấy âm đầu (onset) âm chính (vowel)
      let onsetText = "";
      for (const item of syl) {
        const ch = item.token.toLowerCase().trim();
        if (!ch) continue;

        if (vowels.includes(ch)) {
          if (!vowelFound) {
            vowelLipId = getLipIdForToken(ch);
            vowelFound = true;
          }
        } else if (!vowelFound) {
          // Consonant before vowel = onset
          onsetText = ch;
          onsetLipId = getLipIdForToken(ch);
        }
      }

      // If no vowel found, use the onset consonant for the whole syllable
      if (vowelLipId === NEUTRAL_LIP) {
        vowelLipId = onsetLipId;
      }

      // Kiểm tra xem phụ âm đầu có thuộc nhóm cấu âm nhẹ/xát/mũi không (x, s, h...)
      const isSingleFrameOnset = singleFrameOnsets.includes(onsetText);

      // Create sub-segments: onset(30%) → vowel(70%)
      const hasOnset = onsetLipId !== NEUTRAL_LIP && onsetLipId !== vowelLipId;

      if (sylDur < 0.08 || !hasOnset || isSingleFrameOnset) {
        // Âm quá ngắn, hoặc không có phụ âm đầu rõ ràng,
        // hoặc phụ âm đầu là loại ít đổi khẩu hình -> Chỉ dùng 1 frame
        segments.push({
          token: fullToken,
          start: sylStart,
          end: sylEnd,
          _lipId: vowelLipId,
        });
      } else {
        // Có phụ âm đầu: chia 30% cho phụ âm đầu, 70% cho vần
        const onsetEnd = sylStart + sylDur * 0.3;
        segments.push({
          token: fullToken, // Giữ nguyên text để UI không bị giật
          start: sylStart,
          end: onsetEnd,
          _lipId: onsetLipId,
        });
        segments.push({
          token: fullToken, // Giữ nguyên text
          start: onsetEnd,
          end: sylEnd,
          _lipId: vowelLipId,
        });
      }
    } // end for syl of subSyllables

    // Nếu sau syllable này có dấu câu (., !, ?) → chèn NEUTRAL segment (nghỉ)
    if (pauseAfterSyl[sylIdx] && sylIdx + 1 < syllables.length) {
      const lastSeg = segments[segments.length - 1];
      const nextSylStart = syllables[sylIdx + 1][0].start;
      if (lastSeg && nextSylStart > lastSeg.end) {
        segments.push({
          token: "",
          start: lastSeg.end,
          end: nextSylStart,
          _lipId: NEUTRAL_LIP,
        });
      }
    }
  } // end for sylIdx

  console.log(
    `Smoothed: ${alignmentData.length} tokens → ${segments.length} sub-segments (from ${syllables.length} syllables)`,
  );
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
  uploadArea.classList.add("hidden");
  nowPlaying.classList.remove("hidden");
}

// ===== File Upload Handlers =====
function handleFiles(files) {
  let audioFile = null;
  let jsonFile = null;

  for (const f of files) {
    if (f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|ogg|m4a)$/i)) {
      audioFile = f;
    } else if (f.type === "application/json" || f.name.match(/\.json$/i)) {
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
    stopPlayback();
  }

  // start playing
  audioPlayer.currentTime = 0; // reset to beginning for play
  await audioPlayer.play();
}

function stopPlayback() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  isPlaying = false;
  setLip(NEUTRAL_LIP);
  updatePlayButton();
  characterContainer.classList.remove("speaking");
  progressBar.style.width = "0%";
  currentTimeEl.textContent = "0:00";

  if (currentTokenIndex !== -1 && timelineTokens.children[currentTokenIndex]) {
    timelineTokens.children[currentTokenIndex].classList.remove("active");
  }
  currentTokenIndex = -1;
  timelineTokens.style.transform = `translateX(0px)`;
}

function updatePlayButton() {
  playIcon.classList.toggle("hidden", isPlaying);
  pauseIcon.classList.toggle("hidden", !isPlaying);
}

// ===== Speed Control =====
const SPEEDS = [0.25, 0.5, 0.75, 1];
let speedIndex = 3; // default 1x
const btnSpeed = document.getElementById("btnSpeed");
const speedLabel = document.getElementById("speedLabel");

function cycleSpeed() {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  const rate = SPEEDS[speedIndex];
  audioPlayer.playbackRate = rate;
  speedLabel.textContent = `${rate}x`;
  // Highlight when slow
  btnSpeed.style.borderColor =
    rate < 1 ? "var(--accent)" : "var(--glass-border)";
  btnSpeed.style.color = rate < 1 ? "var(--accent)" : "var(--text-primary)";
}

btnSpeed.addEventListener("click", cycleSpeed);

// ===== Event Listeners =====

// Upload Area Handlers
uploadArea.addEventListener("click", () => filesInput.click());
filesInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) handleFiles(e.target.files);
  e.target.value = "";
});

// Drag & drop on Upload Area
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("drag-over");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

// Drag & Drop on Now Playing Component (to hot-swap JSON)
nowPlaying.addEventListener("dragover", (e) => {
  e.preventDefault();
  nowPlaying.classList.add("drag-over");
});
nowPlaying.addEventListener("dragleave", () => {
  nowPlaying.classList.remove("drag-over");
});
nowPlaying.addEventListener("drop", (e) => {
  e.preventDefault();
  nowPlaying.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

// Playback buttons
btnPlayPause.addEventListener("click", togglePlay);
btnStop.addEventListener("click", stopPlayback);
btnUploadNew.addEventListener("click", () => {
  stopPlayback();
  audioPlayer.src = "";
  nowPlaying.classList.add("hidden");
  uploadArea.classList.remove("hidden");
  alignmentData = [];
});

// Audio events
audioPlayer.addEventListener("play", () => {
  // Initialize Web Audio API on first user interaction to bypass autoplay policies
  initAudioContext();
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  isPlaying = true;
  updatePlayButton();
  characterContainer.classList.add("speaking");
  if (!animationFrameId) animate();
});

audioPlayer.addEventListener("pause", () => {
  isPlaying = false;
  updatePlayButton();
  characterContainer.classList.remove("speaking");
  setLip(NEUTRAL_LIP);
});

audioPlayer.addEventListener("ended", () => {
  isPlaying = false;
  updatePlayButton();
  characterContainer.classList.remove("speaking");
  setLip(NEUTRAL_LIP);
  progressBar.style.width = "100%";
});

// Progress bar seek
progressContainer.addEventListener("click", (e) => {
  if (!audioPlayer.duration) return;
  const rect = progressContainer.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioPlayer.currentTime = pct * audioPlayer.duration;
});

// ===== Init =====
buildChart();
loadDefaultFiles();

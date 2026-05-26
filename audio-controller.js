function clampAudioOffsetSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const limited = Math.max(-AUDIO_OFFSET_LIMIT_SEC, Math.min(AUDIO_OFFSET_LIMIT_SEC, parsed));
  const quantized = Math.round(limited / AUDIO_OFFSET_STEP_SEC) * AUDIO_OFFSET_STEP_SEC;
  return Number(quantized.toFixed(3));
}


function formatOffsetInputValue(raw) {
  return clampAudioOffsetSec(raw).toFixed(2);
}

function formatOffsetStepValue(raw) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return String(raw);
  }
  return String(Number(numeric.toFixed(2)));
}

function clampLoopGapSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const limited = Math.max(0, Math.min(LOOP_GAP_MAX_SEC, parsed));
  const quantized = Math.round(limited / LOOP_GAP_STEP_SEC) * LOOP_GAP_STEP_SEC;
  return Number(quantized.toFixed(2));
}

function normalizePresentationPlaybackRate(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  let closest = PRESENTATION_PLAYBACK_RATES[0];
  let minDistance = Math.abs(parsed - closest);
  for (let idx = 1; idx < PRESENTATION_PLAYBACK_RATES.length; idx += 1) {
    const candidate = PRESENTATION_PLAYBACK_RATES[idx];
    const distance = Math.abs(parsed - candidate);
    if (distance < minDistance) {
      closest = candidate;
      minDistance = distance;
    }
  }
  return closest;
}

function formatPresentationPlaybackRate(rate) {
  return Number(rate).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function syncPresentationSpeedInput() {
  if (!el.presentationSpeedSelect) {
    return;
  }
  const value = formatPresentationPlaybackRate(state.presentationPlaybackRate);
  if (el.presentationSpeedSelect.value !== value) {
    el.presentationSpeedSelect.value = value;
  }
}

function applyPresentationPlaybackRate(rate, persist = true) {
  state.presentationPlaybackRate = normalizePresentationPlaybackRate(rate);
  syncPresentationSpeedInput();
  if (el.sentenceAudio) {
    el.sentenceAudio.playbackRate = state.presentationPlaybackRate;
  }
  if (persist) {
    persistPreference(STORAGE_KEYS.presentationPlaybackRate, String(state.presentationPlaybackRate));
  }
  updatePresentationSpeedLabel();
}

function updatePresentationSpeedLabel() {
  if (!el.presentationSpeedSelect) {
    return;
  }
  const rateText = `${formatPresentationPlaybackRate(state.presentationPlaybackRate)}x`;
  const hint = t("presentationSpeedHint", rateText);
  el.presentationSpeedSelect.setAttribute("aria-label", hint);
  el.presentationSpeedSelect.title = hint;
}

function applyPresentationPhonemeVisibility(show, persist = true) {
  state.presentationShowPhonemes = !!show;
  if (el.presentationSection) {
    el.presentationSection.classList.toggle("presentation-hide-phonemes", !state.presentationShowPhonemes);
  }
  if (persist) {
    persistPreference(STORAGE_KEYS.presentationShowPhonemes, state.presentationShowPhonemes ? "1" : "0");
  }
  updatePresentationPhonemeToggleButton();
}

function updatePresentationPhonemeToggleButton() {
  if (!el.presentationPhonemeToggleBtn) {
    return;
  }
  const active = !!state.presentationShowPhonemes;
  el.presentationPhonemeToggleBtn.classList.toggle("active", active);
  el.presentationPhonemeToggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
  el.presentationPhonemeToggleBtn.textContent = active
    ? t("presentationPhonemeToggleOn")
    : t("presentationPhonemeToggleOff");
  const hint = active
    ? t("presentationPhonemeToggleOnHint")
    : t("presentationPhonemeToggleOffHint");
  el.presentationPhonemeToggleBtn.setAttribute("aria-label", hint);
  el.presentationPhonemeToggleBtn.title = hint;
}

function adjustPresentationPlaybackRate(direction) {
  if (!Number.isFinite(direction) || direction === 0) {
    return;
  }
  const current = normalizePresentationPlaybackRate(state.presentationPlaybackRate);
  const currentIdx = PRESENTATION_PLAYBACK_RATES.indexOf(current);
  if (currentIdx < 0) {
    applyPresentationPlaybackRate(1, true);
    return;
  }
  const nextIdx = Math.max(
    0,
    Math.min(PRESENTATION_PLAYBACK_RATES.length - 1, currentIdx + (direction > 0 ? 1 : -1)),
  );
  if (nextIdx === currentIdx) {
    return;
  }
  applyPresentationPlaybackRate(PRESENTATION_PLAYBACK_RATES[nextIdx], true);
}

function normalizeLoopCountInputValue(raw) {
  const text = String(raw ?? "");
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) {
    return "";
  }
  const normalized = digits.replace(/^0+/, "");
  if (!normalized) {
    return "";
  }
  return normalized;
}

function parseLoopCountTotal(raw) {
  const normalized = normalizeLoopCountInputValue(raw);
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function clearSeekSafetyTimeout() {
  if (state.seekSafetyTimerId !== null) {
    clearTimeout(state.seekSafetyTimerId);
    state.seekSafetyTimerId = null;
  }
}

function startInternalSeek() {
  state.internalSeekGen++;
  state.internalSeekActive = true;
  clearSeekSafetyTimeout();
  state.seekSafetyTimerId = window.setTimeout(() => {
    state.seekSafetyTimerId = null;
    state.internalSeekGen = 0;
    state.internalSeekActive = false;
  }, 500);
}

function addSeekClearHandler(audio) {
  function onSeekDone() {
    audio.removeEventListener("seeked", onSeekDone);
    state.internalSeekGen = Math.max(0, state.internalSeekGen - 1);
    if (state.internalSeekGen === 0) {
      state.internalSeekActive = false;
      clearSeekSafetyTimeout();
    }
  }
  audio.addEventListener("seeked", onSeekDone);
}

function cancelLoopRestartTimer() {
  if (state.loopRestartTimerId !== null) {
    clearTimeout(state.loopRestartTimerId);
    state.loopRestartTimerId = null;
  }
}

function resetLoopPlaybackState() {
  cancelLoopRestartTimer();
  state.loopRestartCount = 0;
  state.loopRestartFromTimer = false;
}

function canScheduleNextLoopPlayback() {
  if (state.loopCountTotal === null) {
    return true;
  }
  return state.loopRestartCount < state.loopCountTotal;
}

function applyLoopCountInputValue(rawValue, persist = true) {
  const normalized = normalizeLoopCountInputValue(rawValue);
  el.loopCountInput.value = normalized;
  state.loopCountTotal = parseLoopCountTotal(normalized);
  if (persist) {
    persistPreference(STORAGE_KEYS.loopCountTotal, normalized);
  }
  if (!canScheduleNextLoopPlayback()) {
    cancelLoopRestartTimer();
  }

  if (el.presentationLoopCountInput && el.presentationLoopCountInput.value !== normalized) {
    el.presentationLoopCountInput.value = normalized;
  }
}

function syncPresentationLoopGapInput() {
  if (!el.presentationLoopGapInput) {
    return;
  }
  const value = formatOffsetStepValue(state.loopGapSec);
  if (el.presentationLoopGapInput.value !== value) {
    el.presentationLoopGapInput.value = value;
  }
}

function applyLoopGapInputValue(rawValue, persist = true) {
  state.loopGapSec = clampLoopGapSec(rawValue);
  const text = formatOffsetStepValue(state.loopGapSec);
  el.loopGapInput.value = text;
  syncPresentationLoopGapInput();
  if (persist) {
    persistPreference(STORAGE_KEYS.loopGapSec, String(state.loopGapSec));
  }
}

function updatePresentationPlayPauseButton() {
  if (!el.presentationPlayPauseBtn) {
    return;
  }
  const isPlaying = !!(el.sentenceAudio && !el.sentenceAudio.paused);
  el.presentationPlayPauseBtn.textContent = isPlaying ? "⏸" : "▶";
  const label = isPlaying ? t("presentationPause") : t("presentationPlay");
  el.presentationPlayPauseBtn.setAttribute("aria-label", label);
  el.presentationPlayPauseBtn.title = label;
}

function updatePresentationLoopToggleButton() {
  if (!el.presentationLoopToggleBtn) {
    return;
  }
  const enabled = !!state.loopSentence;
  el.presentationLoopToggleBtn.classList.toggle("active", enabled);
  el.presentationLoopToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  const label = enabled ? t("presentationLoopHintOn") : t("presentationLoopHintOff");
  el.presentationLoopToggleBtn.setAttribute("aria-label", label);
  el.presentationLoopToggleBtn.title = label;
}

function updatePresentationPlayAllButton() {
  if (!el.presentationPlayAllBtn) {
    return;
  }
  const active = !!state.presentationPlayAllActive;
  const hasSentences = getVisibleSentences().length > 0;
  const text = active ? t("presentationStopAll") : t("presentationPlayAll");
  const hint = active ? t("presentationStopAllHint") : t("presentationPlayAllHint");
  el.presentationPlayAllBtn.disabled = !hasSentences;
  el.presentationPlayAllBtn.classList.toggle("active", active);
  el.presentationPlayAllBtn.setAttribute("aria-pressed", active ? "true" : "false");
  el.presentationPlayAllBtn.textContent = text;
  el.presentationPlayAllBtn.setAttribute("aria-label", hint);
  el.presentationPlayAllBtn.title = hint;
}
function toggleSentencePlayback() {
  if (!el.sentenceAudio || !el.sentenceAudio.getAttribute("src")) {
    return;
  }
  if (el.sentenceAudio.paused) {
    const playPromise = el.sentenceAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // ignore playback interruption
      });
    }
  } else {
    if (state.presentationPlayAllActive) {
      stopPresentationPlayAll();
    }
    el.sentenceAudio.pause();
  }
}

function ignoreNextPauseForPlayAllOnce() {
  state.presentationPlayAllIgnoreNextPause = true;
  window.setTimeout(() => {
    state.presentationPlayAllIgnoreNextPause = false;
  }, 250);
}

function stopPresentationPlayAll() {
  if (state.presentationPlayAllPauseGuardTimerId !== null) {
    window.clearTimeout(state.presentationPlayAllPauseGuardTimerId);
    state.presentationPlayAllPauseGuardTimerId = null;
  }
  state.presentationPlayAllActive = false;
  state.presentationPlayAllPendingAutoplay = false;
  state.presentationPlayAllIgnoreNextPause = false;
  state.presentationPlayAllAdvancing = false;
  state.presentationPlayAllLastEndedAtMs = 0;
  updatePresentationPlayAllButton();
}

function markPresentationPlayAllExpectEndingPause() {
  if (state.presentationPlayAllPauseGuardTimerId !== null) {
    window.clearTimeout(state.presentationPlayAllPauseGuardTimerId);
  }
  state.presentationPlayAllIgnoreNextPause = true;
  state.presentationPlayAllPauseGuardTimerId = window.setTimeout(() => {
    state.presentationPlayAllIgnoreNextPause = false;
    state.presentationPlayAllPauseGuardTimerId = null;
  }, 500);
}

function shouldIgnorePauseAsAutoBoundary() {
  const nowMs = Date.now();
  if (state.presentationPlayAllLastEndedAtMs > 0 && nowMs - state.presentationPlayAllLastEndedAtMs <= 700) {
    return true;
  }
  const audio = el.sentenceAudio;
  if (!audio) {
    return false;
  }
  const end = Number(state.audioRangeEndSec);
  const current = Number(audio.currentTime || 0);
  if (!Number.isFinite(end) || !Number.isFinite(current)) {
    return false;
  }
  return current >= end - Math.max(0.12, AUDIO_RANGE_EPSILON_SEC * 3);
}

function handleAudioPauseDuringPresentationPlayAll() {
  if (!state.presentationPlayAllActive) {
    return;
  }
  if (state.presentationPlayAllIgnoreNextPause || shouldIgnorePauseAsAutoBoundary()) {
    state.presentationPlayAllIgnoreNextPause = false;
    return;
  }
  stopPresentationPlayAll();
}

function playPendingPresentationPlayAll() {
  if (!state.presentationPlayAllActive || !state.presentationPlayAllPendingAutoplay) {
    return;
  }
  if (!el.sentenceAudio || !el.sentenceAudio.getAttribute("src")) {
    stopPresentationPlayAll();
    return;
  }
  state.presentationPlayAllPendingAutoplay = false;
  const audio = el.sentenceAudio;
  const token = ++playToken;

  function doPlay() {
    if (token !== playToken || !state.presentationPlayAllActive) return;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (state.presentationPlayAllActive) stopPresentationPlayAll();
      });
    }
  }

  function onPlaySeeked() {
    if (token !== playToken || !state.presentationPlayAllActive) {
      audio.removeEventListener("seeked", onPlaySeeked);
      return;
    }
    const expectedStart = state.audioRangeStartSec;
    if (Number.isFinite(expectedStart) && Math.abs(audio.currentTime - expectedStart) > 0.15) {
      return; // 舊 seek 先完成，位置不對 — 留守等下一個 seeked
    }
    audio.removeEventListener("seeked", onPlaySeeked);
    doPlay();
  }

  if (state.internalSeekActive) {
    // seek 已在進行中（來自 syncAudioToSentenceStart），等它完成即可
    audio.addEventListener("seeked", onPlaySeeked);
    return;
  }

  const start = state.audioRangeStartSec;
  if (!Number.isFinite(start)) return;
  if (!audio.paused) audio.pause();
  startInternalSeek();
  try {
    audio.currentTime = start;
    addSeekClearHandler(audio);
  } catch {
    // safety timeout will clear flag
    return;
  }
  audio.addEventListener("seeked", onPlaySeeked);
}

function requestPresentationPlayAllAutoplay() {
  if (!state.presentationPlayAllActive) {
    return;
  }
  if (!el.sentenceAudio || !el.sentenceAudio.getAttribute("src")) {
    stopPresentationPlayAll();
    return;
  }
  state.presentationPlayAllPendingAutoplay = true;
  if (Number(el.sentenceAudio.readyState || 0) >= 1) {
    playPendingPresentationPlayAll();
  }
}

function startPresentationPlayAll() {
  if (state.presentationPlayAllActive || state.viewMode !== "presentation") {
    return;
  }
  if (getVisibleSentences().length === 0) {
    updatePresentationPlayAllButton();
    return;
  }
  cancelLoopRestartTimer();
  state.loopRestartFromTimer = false;
  state.presentationPlayAllActive = true;
  state.presentationPlayAllPendingAutoplay = false;
  state.presentationPlayAllIgnoreNextPause = false;
  state.presentationPlayAllAdvancing = false;
  state.presentationPlayAllLastEndedAtMs = 0;
  updatePresentationPlayAllButton();
  if (!el.sentenceAudio || !el.sentenceAudio.getAttribute("src")) {
    stopPresentationPlayAll();
    return;
  }
  if (el.sentenceAudio.paused) {
    requestPresentationPlayAllAutoplay();
  }
}

function togglePresentationPlayAll() {
  if (state.presentationPlayAllActive) {
    stopPresentationPlayAll();
    if (!el.sentenceAudio.paused) {
      el.sentenceAudio.pause();
    }
    return;
  }
  startPresentationPlayAll();
}

function advancePresentationPlayAll() {
  if (!state.presentationPlayAllActive || state.presentationPlayAllAdvancing) {
    return;
  }
  state.presentationPlayAllAdvancing = true;
  markPresentationPlayAllExpectEndingPause();
  const moved = jumpToSentence(1, { preservePlayAll: true, autoplayAfterJump: true });
  state.presentationPlayAllAdvancing = false;
  if (!moved) {
    stopPresentationPlayAll();
    pauseAudioAtRangeStart();
  }
}
function getAudioDurationSec() {
  const duration = Number(el.sentenceAudio?.duration);
  if (!Number.isFinite(duration) || duration < 0) {
    return null;
  }
  return duration;
}

function resolveAudioBaseRange(baseStart, baseEnd) {
  if (!Number.isFinite(baseStart) || !Number.isFinite(baseEnd)) {
    return { start: null, end: null };
  }

  const safeStart = Math.max(0, Number(baseStart));
  const safeEnd = Math.max(safeStart, Number(baseEnd));
  const span = Math.max(0, safeEnd - safeStart);

  if (!state.audioUseClipRangeHint) {
    return { start: safeStart, end: safeEnd };
  }

  const duration = getAudioDurationSec();
  if (Number.isFinite(duration) && duration > 0) {
    const startWithinDuration = safeStart <= duration + AUDIO_RANGE_EPSILON_SEC;
    const endWithinDuration = safeEnd <= duration + AUDIO_RANGE_EPSILON_SEC;
    if (startWithinDuration && endWithinDuration) {
      return { start: safeStart, end: safeEnd };
    }

    const spanCloseToDuration = Math.abs(span - duration) <= Math.max(AUDIO_CLIP_RANGE_TOLERANCE_SEC, duration * 0.35);
    if (spanCloseToDuration || safeStart > duration + AUDIO_RANGE_EPSILON_SEC || safeEnd > duration + AUDIO_RANGE_EPSILON_SEC) {
      return { start: 0, end: span };
    }
  }

  if (safeStart > AUDIO_RANGE_EPSILON_SEC) {
    return { start: 0, end: span };
  }

  return { start: safeStart, end: safeEnd };
}

function computeEffectiveRange(baseStart, baseEnd, deltaStart, deltaEnd, audioDuration) {
  const ds = Number(deltaStart) || 0;
  const de = Number(deltaEnd) || 0;
  let start = Number(baseStart) + ds;
  let end = Number(baseEnd) + de;
  start = Math.max(0, start);
  end = Math.max(0, end);
  if (Number.isFinite(audioDuration)) {
    start = Math.min(start, audioDuration);
    end = Math.min(end, audioDuration);
  }
  if (end < start) {
    end = start;
  }
  return { start, end };
}

function refreshAudioRangeFromState() {
  const baseStart = state.audioBaseStartSec;
  const baseEnd = state.audioBaseEndSec;
  const baseRange = resolveAudioBaseRange(baseStart, baseEnd);
  if (!Number.isFinite(baseRange.start) || !Number.isFinite(baseRange.end)) {
    state.audioRangeStartSec = null;
    state.audioRangeEndSec = null;
    updateAudioEffectiveRangeText();
    return;
  }

  const audioDuration = state.audioUseClipRangeHint ? null : getAudioDurationSec();
  const range = computeEffectiveRange(
    baseRange.start,
    baseRange.end,
    state.audioStartOffsetSec || 0,
    state.audioEndOffsetSec || 0,
    audioDuration,
  );
  state.audioRangeStartSec = range.start;
  state.audioRangeEndSec = range.end;
  updateAudioEffectiveRangeText();
}

function updateAudioEffectiveRangeText() {
  const start = state.audioRangeStartSec;
  const end = state.audioRangeEndSec;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    el.audioEffectiveRange.textContent = "";
    return;
  }
  el.audioEffectiveRange.textContent = t("audioEffectiveRange", fmtTime(start), fmtTime(end));
}

function renderAudioOffsetControls() {
  const minText = String(-AUDIO_OFFSET_LIMIT_SEC);
  const maxText = String(AUDIO_OFFSET_LIMIT_SEC);
  const stepText = formatOffsetStepValue(AUDIO_OFFSET_STEP_SEC);

  el.audioStartOffsetInput.min = minText;
  el.audioStartOffsetInput.max = maxText;
  el.audioStartOffsetInput.step = stepText;
  el.audioStartOffsetInput.value = formatOffsetInputValue(state.audioStartOffsetSec);

  el.audioEndOffsetInput.min = minText;
  el.audioEndOffsetInput.max = maxText;
  el.audioEndOffsetInput.step = stepText;
  el.audioEndOffsetInput.value = formatOffsetInputValue(state.audioEndOffsetSec);

  updateAudioEffectiveRangeText();
}

function applyAudioOffsetsForCurrentSentence(startOffsetSec, endOffsetSec, forceSeek = false) {
  const sentence = getCurrentSentence();
  if (!sentence) {
    return;
  }

  state.audioStartOffsetSec = clampAudioOffsetSec(startOffsetSec);
  state.audioEndOffsetSec = clampAudioOffsetSec(endOffsetSec);
  saveOffsetsForSentence(sentence, state.audioStartOffsetSec, state.audioEndOffsetSec);

  refreshAudioRangeFromState();
  renderAudioOffsetControls();

  if (forceSeek) {
    syncAudioToSentenceStart(true);
    return;
  }
  enforceAudioPlaybackRange();
}


function nudgeCurrentSentenceOffset(kind, deltaSec) {
  const delta = Number(deltaSec);
  if (!Number.isFinite(delta)) {
    return;
  }

  if (kind === "start") {
    applyAudioOffsetsForCurrentSentence(state.audioStartOffsetSec + delta, state.audioEndOffsetSec, false);
    return;
  }

  applyAudioOffsetsForCurrentSentence(state.audioStartOffsetSec, state.audioEndOffsetSec + delta, false);
}

function applyOffsetInputChange(kind) {
  const input = kind === "start" ? el.audioStartOffsetInput : el.audioEndOffsetInput;
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) {
    renderAudioOffsetControls();
    return;
  }

  if (kind === "start") {
    applyAudioOffsetsForCurrentSentence(parsed, state.audioEndOffsetSec, false);
    return;
  }

  applyAudioOffsetsForCurrentSentence(state.audioStartOffsetSec, parsed, false);
}

function clearAudioRange() {
  resetLoopPlaybackState();
  state.loopRestartCount = 0;
  state.loopRestartFromTimer = false;
  state.audioSentenceId = null;
  state.audioBaseStartSec = null;
  state.audioBaseEndSec = null;
  state.audioRangeStartSec = null;
  state.audioRangeEndSec = null;
  state.audioStartOffsetSec = 0;
  state.audioEndOffsetSec = 0;
  state.audioUseClipRangeHint = false;
  renderAudioOffsetControls();
}

function setAudioRangeForSentence(sentence) {
  const prevSentenceId = state.audioSentenceId;
  const start = Number(sentence?.start_sec ?? 0);
  const end = Number(sentence?.end_sec ?? start);

  const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
  const safeEndRaw = Number.isFinite(end) ? end : safeStart;
  const safeEnd = Math.max(safeStart, safeEndRaw);
  const offsets = loadOffsetsForSentence(sentence);
  const useClipRangeHint = isLikelySentenceClipAudio(sentence);

  state.audioSentenceId = sentence?.sentence_id || null;
  state.audioBaseStartSec = safeStart;
  state.audioBaseEndSec = safeEnd;
  state.audioUseClipRangeHint = useClipRangeHint;
  state.audioStartOffsetSec = offsets.start;
  state.audioEndOffsetSec = offsets.end;
  refreshAudioRangeFromState();
  renderAudioOffsetControls();

  if (prevSentenceId !== state.audioSentenceId) {
    state.loopRestartCount = 0;
    state.loopRestartFromTimer = false;
  }

  return prevSentenceId !== state.audioSentenceId;
}

function syncAudioToSentenceStart(forceSeek = false) {
  const start = state.audioRangeStartSec;
  const end = state.audioRangeEndSec;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return;
  }

  const audio = el.sentenceAudio;
  const current = Number(audio.currentTime || 0);
  const epsilon = AUDIO_RANGE_EPSILON_SEC;
  const outsideRange = current < start - epsilon || current > end + epsilon;

  if (!forceSeek && !outsideRange) {
    return;
  }

  startInternalSeek();
  try {
    audio.currentTime = start;
    addSeekClearHandler(audio);
  } catch {
    // safety timeout will clear flag
  }
}

function pauseAudioAtRangeStart() {
  const start = Number(state.audioRangeStartSec);
  const audio = el.sentenceAudio;
  cancelLoopRestartTimer();
  state.loopRestartFromTimer = false;
  if (!audio.paused) {
    audio.pause();
  }
  if (!Number.isFinite(start)) {
    return;
  }
  startInternalSeek();
  try {
    audio.currentTime = start;
    addSeekClearHandler(audio);
  } catch {
    // safety timeout will clear flag
  }
}

function scheduleLoopRestart() {
  if (!state.loopSentence || state.loopRestartTimerId !== null || !canScheduleNextLoopPlayback()) {
    return;
  }

  const start = state.audioRangeStartSec;
  const end = state.audioRangeEndSec;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return;
  }

  const audio = el.sentenceAudio;
  const delayMs = Math.round(clampLoopGapSec(state.loopGapSec) * 1000);

  if (!audio.paused) {
    audio.pause();
  }

  state.loopRestartTimerId = window.setTimeout(() => {
    state.loopRestartTimerId = null;
    if (!state.loopSentence) {
      return;
    }

    if (!canScheduleNextLoopPlayback()) {
      return;
    }

    state.loopRestartCount += 1;
    state.loopRestartFromTimer = true;

    const restartStart = state.audioRangeStartSec;
    const restartEnd = state.audioRangeEndSec;
    if (!Number.isFinite(restartStart) || !Number.isFinite(restartEnd)) {
      return;
    }

    const token = ++playToken;
    startInternalSeek();
    try {
      audio.currentTime = restartStart;
      addSeekClearHandler(audio);
    } catch {
      // safety timeout will clear flag
      return;
    }

    audio.addEventListener("seeked", function onLoopSeeked() {
      if (token !== playToken || !state.loopSentence) {
        audio.removeEventListener("seeked", onLoopSeeked);
        return;
      }
      const expectedStart = state.audioRangeStartSec;
      if (Number.isFinite(expectedStart) && Math.abs(audio.currentTime - expectedStart) > 0.15) {
        return; // 舊 seek 先完成，留守等下一個 seeked
      }
      audio.removeEventListener("seeked", onLoopSeeked);
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          state.loopRestartFromTimer = false;
        });
      }
    });
  }, Math.max(0, delayMs));
}

function buildLoopCountDisplayValue() {
  if (state.loopCountTotal === null) {
    return "";
  }
  return String(state.loopCountTotal);
}

function handleAudioPlayEvent() {
  const fromTimer = !!state.loopRestartFromTimer;
  cancelLoopRestartTimer();
  if (!fromTimer) {
    const start = Number(state.audioRangeStartSec);
    const current = Number(el.sentenceAudio?.currentTime || 0);
    const nearStart = Number.isFinite(start)
      ? current <= start + AUDIO_RANGE_EPSILON_SEC
      : current <= AUDIO_RANGE_EPSILON_SEC;
    if (nearStart || state.loopRestartCount <= 0) {
      state.loopRestartCount = 1;
    }
  }
  state.loopRestartFromTimer = false;
  syncAudioToSentenceStart(false);
}

function canAutoLoopAfterManualEnd() {
  if (state.loopCountTotal === null) {
    return true;
  }
  return state.loopRestartCount < state.loopCountTotal;
}

function enforceAudioPlaybackRange() {
  const start = state.audioRangeStartSec;
  const end = state.audioRangeEndSec;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return;
  }

  const audio = el.sentenceAudio;
  const current = Number(audio.currentTime || 0);
  const epsilon = AUDIO_RANGE_EPSILON_SEC;

  if (current < start - epsilon) {
    startInternalSeek();
    try {
      audio.currentTime = start;
      addSeekClearHandler(audio);
    } catch {
      // safety timeout will clear flag
    }
    return;
  }

  if (current > end + epsilon) {
    if (state.presentationPlayAllActive) {
      advancePresentationPlayAll();
      return;
    }
    if (state.loopSentence) {
      if (!canScheduleNextLoopPlayback()) {
        pauseAudioAtRangeStart();
        return;
      }
      if (audio.paused && state.loopRestartTimerId === null) {
        return;
      }
      scheduleLoopRestart();
      return;
    }

    pauseAudioAtRangeStart();
  }
}
function normalizeAudioPath(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim();
}

function isLikelySentenceClipAudio(sentence) {
  const sentenceAudioPath = normalizeAudioPath(sentence?.audio_path);
  if (!sentenceAudioPath) {
    return false;
  }

  const sentences = Array.isArray(state.lesson?.sentences) ? state.lesson.sentences : [];
  const uniqueSentenceAudioPaths = new Set();
  for (const item of sentences) {
    const path = normalizeAudioPath(item?.audio_path);
    if (!path) {
      continue;
    }
    uniqueSentenceAudioPaths.add(path);
    if (uniqueSentenceAudioPaths.size > 1) {
      return true;
    }
  }

  const lessonAudioPath = normalizeAudioPath(state.lesson?.audio_path);
  if (!lessonAudioPath) {
    return false;
  }

  return sentenceAudioPath !== lessonAudioPath;
}

function parseSentenceAudioOffsets(raw) {
  if (!raw) {
    return {};
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const safe = {};
  Object.entries(parsed).forEach(([key, value]) => {
    if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    const start = clampAudioOffsetSec(value.start);
    const end = clampAudioOffsetSec(value.end);
    if (Math.abs(start) < 1e-9 && Math.abs(end) < 1e-9) {
      return;
    }
    safe[key] = { start, end };
  });
  return safe;
}
function buildSentenceAudioOffsetKey(sentence) {
  const sentenceId = sentence && sentence.sentence_id ? String(sentence.sentence_id) : "";
  if (!sentenceId) {
    return "";
  }
  const lessonScope = state.currentLessonKey
    || (state.lesson && state.lesson._meta && state.lesson._meta.lesson_path)
    || (state.lesson && state.lesson.lesson_id)
    || "lesson";
  return `${String(lessonScope)}::${sentenceId}`;
}

function loadOffsetsForSentence(sentence) {
  const key = buildSentenceAudioOffsetKey(sentence);
  if (!key || !state.sentenceAudioOffsets || typeof state.sentenceAudioOffsets !== "object") {
    return { start: 0, end: 0 };
  }
  const raw = state.sentenceAudioOffsets[key];
  if (!raw || typeof raw !== "object") {
    return { start: 0, end: 0 };
  }
  return {
    start: clampAudioOffsetSec(raw.start),
    end: clampAudioOffsetSec(raw.end),
  };
}

function saveOffsetsForSentence(sentence, startOffsetSec, endOffsetSec) {
  const key = buildSentenceAudioOffsetKey(sentence);
  if (!key) {
    return;
  }
  const start = clampAudioOffsetSec(startOffsetSec);
  const end = clampAudioOffsetSec(endOffsetSec);
  const isZero = Math.abs(start) < 1e-9 && Math.abs(end) < 1e-9;

  if (isZero) {
    if (state.sentenceAudioOffsets && Object.prototype.hasOwnProperty.call(state.sentenceAudioOffsets, key)) {
      delete state.sentenceAudioOffsets[key];
      persistSentenceAudioOffsets();
    }
    return;
  }

  if (!state.sentenceAudioOffsets || typeof state.sentenceAudioOffsets !== "object") {
    state.sentenceAudioOffsets = {};
  }
  state.sentenceAudioOffsets[key] = { start, end };
  persistSentenceAudioOffsets();
}

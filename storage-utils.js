function safeLocalStorageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorageRemoveItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function persistPreference(key, value) {
  safeLocalStorageSetItem(key, value);
}

function loadPreferences() {
  const savedLang = safeLocalStorageGetItem(STORAGE_KEYS.language);
  if (savedLang === "zh-TW" || savedLang === "en") {
    state.uiLanguage = savedLang;
  }

  const savedDisplay = safeLocalStorageGetItem(STORAGE_KEYS.displaySystem);
  if (savedDisplay === "ipa" || savedDisplay === "kk" || savedDisplay === "zhuyin_plus") {
    state.displaySystem = savedDisplay;
  }

  const savedProfile = safeLocalStorageGetItem(STORAGE_KEYS.profile);
  if (savedProfile) {
    state.activeProfileId = savedProfile;
  }

  const savedLoopSentence = safeLocalStorageGetItem(STORAGE_KEYS.loopSentence);
  if (savedLoopSentence === "1") {
    state.loopSentence = true;
  } else if (savedLoopSentence === "0") {
    state.loopSentence = false;
  }

  const savedLoopGap = safeLocalStorageGetItem(STORAGE_KEYS.loopGapSec);
  if (savedLoopGap !== null) {
    state.loopGapSec = clampLoopGapSec(savedLoopGap);
  }

  const savedLoopCount = safeLocalStorageGetItem(STORAGE_KEYS.loopCountTotal);
  state.loopCountTotal = parseLoopCountTotal(savedLoopCount);
  persistPreference(STORAGE_KEYS.loopCountTotal, buildLoopCountDisplayValue());

  const savedPlaybackRate = safeLocalStorageGetItem(STORAGE_KEYS.presentationPlaybackRate);
  if (savedPlaybackRate !== null) {
    state.presentationPlaybackRate = normalizePresentationPlaybackRate(savedPlaybackRate);
  }

  const savedShowPhonemes = safeLocalStorageGetItem(STORAGE_KEYS.presentationShowPhonemes);
  if (savedShowPhonemes === "0") {
    state.presentationShowPhonemes = false;
  } else if (savedShowPhonemes === "1") {
    state.presentationShowPhonemes = true;
  }

  state.sentenceAudioOffsets = parseSentenceAudioOffsets(safeLocalStorageGetItem(STORAGE_KEYS.sentenceAudioOffsets));
}

function persistSentenceAudioOffsets() {
  safeLocalStorageSetItem(
    STORAGE_KEYS.sentenceAudioOffsets,
    JSON.stringify(state.sentenceAudioOffsets || {}),
  );
}

function buildRemoteLessonEditsPayload(lesson) {
  const edits = {};
  (lesson.sentences || []).forEach((sentence, sIdx) => {
    (sentence.words || []).forEach((word, wIdx) => {
      if (!word) return;
      const entry = {};
      if (Array.isArray(word.gold_ipa) && word.gold_ipa.length) entry.gold_ipa = word.gold_ipa;
      if (word.gold_token_details) entry.gold_token_details = word.gold_token_details;
      if (word.gold_display_edits && Object.keys(word.gold_display_edits).length) {
        entry.gold_display_edits = word.gold_display_edits;
      }
      if (word.notes) entry.notes = word.notes;
      if (Object.keys(entry).length) edits[`${sIdx}:${wIdx}`] = entry;
    });
  });
  return {
    savedAt: new Date().toISOString(),
    edits,
  };
}

function applyRemoteLessonEditsPayload(lesson, payload) {
  const edits = payload?.edits;
  if (!edits || typeof edits !== "object") return false;
  let restored = false;
  (lesson.sentences || []).forEach((sentence, sIdx) => {
    (sentence.words || []).forEach((word, wIdx) => {
      const saved = edits[`${sIdx}:${wIdx}`];
      if (!saved || !word) return;
      if (saved.gold_ipa) word.gold_ipa = saved.gold_ipa;
      if (saved.gold_token_details) word.gold_token_details = saved.gold_token_details;
      if (saved.gold_display_edits) word.gold_display_edits = saved.gold_display_edits;
      if (saved.notes) word.notes = saved.notes;
      restored = true;
    });
  });
  return restored;
}

function saveRemoteLessonEdits(slug, lesson) {
  const payload = buildRemoteLessonEditsPayload(lesson);
  const saved = safeLocalStorageSetItem(
    STORAGE_KEYS.remoteEditsPrefix + slug,
    JSON.stringify(payload),
  );
  state.remoteSavedToLocalStorage = saved || state.remoteSavedToLocalStorage;
  if (!saved) {
    console.warn("Failed to save remote edits to localStorage.");
  }
}

function restoreRemoteLessonEdits(slug, lesson) {
  let stored;
  try {
    const raw = safeLocalStorageGetItem(STORAGE_KEYS.remoteEditsPrefix + slug);
    if (!raw) return false;
    stored = JSON.parse(raw);
  } catch {
    return false;
  }
  return applyRemoteLessonEditsPayload(lesson, stored);
}

function clearRemoteLessonEditsFromStorage(slug) {
  safeLocalStorageRemoveItem(STORAGE_KEYS.remoteEditsPrefix + slug);
  state.remoteSavedToLocalStorage = false;
}

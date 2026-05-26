function applyViewMode() {
  const compactMode = state.viewMode === "compact";
  const detailedMode = state.viewMode === "detailed";
  const presentationMode = state.viewMode === "presentation";
  const localMode = isLocalMode();

  document.body.classList.toggle("compact-mode", compactMode);
  document.body.classList.toggle("detailed-mode", detailedMode);
  document.body.classList.toggle("presentation-mode", presentationMode);

  el.wordTableSection.hidden = !detailedMode;
  el.wordCompactSection.hidden = !compactMode;
  if (el.presentationSection) {
    el.presentationSection.hidden = !presentationMode;
  }
  if (el.sentenceHeaderSection) {
    el.sentenceHeaderSection.hidden = presentationMode;
  }
  if (el.audioSection) {
    el.audioSection.hidden = presentationMode;
  }
  el.downloadLessonBtn.disabled = !state.lesson;
  if (el.downloadOfflineZipBtn) {
    el.downloadOfflineZipBtn.hidden = false;
    el.downloadOfflineZipBtn.disabled = !state.lesson || state.offlineZipDownloading;
  }
  el.sentenceMeta.hidden = compactMode || presentationMode;

  if (el.showDetailsGroup) {
    el.showDetailsGroup.hidden = compactMode || presentationMode;
  }
  if (el.phoneticProfileGroup) {
    el.phoneticProfileGroup.hidden = compactMode || presentationMode || !state.showDetails;
  }
  if (el.saveGoldGroup) {
    el.saveGoldGroup.hidden = compactMode || presentationMode;
  }
  if (el.transcriptGroup) {
    el.transcriptGroup.hidden = compactMode || presentationMode || localMode;
  }

  el.compactViewBtn.classList.toggle("active", compactMode);
  el.detailedViewBtn.classList.toggle("active", detailedMode);
  if (el.presentationViewBtn) {
    el.presentationViewBtn.classList.toggle("active", presentationMode);
    el.presentationViewBtn.setAttribute("aria-pressed", presentationMode ? "true" : "false");
  }
  el.compactViewBtn.setAttribute("aria-pressed", compactMode ? "true" : "false");
  el.detailedViewBtn.setAttribute("aria-pressed", detailedMode ? "true" : "false");

  el.saveBtn.disabled = compactMode || presentationMode || localMode;
  renderSaveStatus();
  renderCompactNotice();
  updatePresentationPlayPauseButton();
  updatePresentationLoopToggleButton();
  updatePresentationPlayAllButton();
  syncPresentationLoopGapInput();
  applyPresentationDisplayOptions();
  if (presentationMode) renderPresentationLessonMeta();
}

function setViewMode(mode) {
  let next = "compact";
  if (mode === "detailed") {
    next = "detailed";
  } else if (mode === "presentation") {
    next = "presentation";
  }
  if (state.viewMode === next) {
    return;
  }
  if (state.viewMode === "presentation" && next !== "presentation") {
    stopPresentationPlayAll();
  }
  state.viewMode = next;
  state.activeGoldInput = null;
  applyViewMode();
  renderKeyboard();
  renderSentence();
}

function applyAppScreen() {
  const isEntry = state.appScreen === "entry";
  document.body.classList.toggle("entry-screen", isEntry);
  // Use style.display directly to avoid CSS specificity issues with the hidden attribute.
  if (el.entrySection) el.entrySection.style.display = isEntry ? "" : "none";
  el.viewModeSection.hidden = isEntry;
  if (el.sentenceHeaderSection) el.sentenceHeaderSection.hidden = isEntry;
  if (el.audioSection) el.audioSection.hidden = isEntry;
  el.wordTableSection.hidden = isEntry;
  el.wordCompactSection.hidden = isEntry;
  if (el.presentationSection) el.presentationSection.hidden = isEntry;
  // Side-panel: course groups hidden always (entry page handles selection);
  // show 換課程 button in editor mode so the user can return to entry screen
  if (el.remoteLessonGroup) el.remoteLessonGroup.hidden = true;
  if (el.localLessonGroup) el.localLessonGroup.hidden = true;
  if (el.changeLessonGroup) el.changeLessonGroup.hidden = isEntry;
}

function goToEntryScreen() {
  stopPresentationPlayAll();
  if (state.viewMode !== "compact") {
    state.viewMode = "compact";
    applyViewMode();
  }
  state.appScreen = "entry";
  applyAppScreen();
}

function getCurrentSentence() {
  if (!state.lesson || !Array.isArray(state.lesson.sentences) || state.lesson.sentences.length === 0) {
    return null;
  }
  ensureSentenceIndexInBounds();
  return state.lesson.sentences[state.sentenceIndex] || null;
}

function applyShowDetailsMode() {
  const presentationMode = state.viewMode === "presentation";

  if (state.showDetails) {
    document.body.classList.remove("meta-hidden");
    document.body.classList.remove("phonetic-hidden");
  } else {
    document.body.classList.add("meta-hidden");
    document.body.classList.add("phonetic-hidden");
  }

  if (el.phoneticProfileGroup) {
    el.phoneticProfileGroup.hidden = state.viewMode === "compact" || presentationMode || !state.showDetails;
  }
}

function applyPresentationDisplayOptions() {
  applyPresentationPlaybackRate(state.presentationPlaybackRate, false);
  applyPresentationPhonemeVisibility(state.presentationShowPhonemes, false);
}

function ensureSentenceIndexInBounds() {
  if (!state.lesson || !Array.isArray(state.lesson.sentences) || state.lesson.sentences.length === 0) {
    state.sentenceIndex = 0;
    return;
  }
  if (state.sentenceIndex < 0) {
    state.sentenceIndex = 0;
  }
  if (state.sentenceIndex >= state.lesson.sentences.length) {
    state.sentenceIndex = state.lesson.sentences.length - 1;
  }
}

function getVisibleSentences() {
  if (!state.lesson) {
    return [];
  }
  return state.lesson.sentences;
}

function stripReviewMarkerForUi(rawText) {
  const text = String(rawText || "");
  const withoutMarker = text.replace(/\[\s*review\s*\]/gi, " ");
  return withoutMarker.replace(/\s+/g, " ").trim();
}

function rebuildSentenceSelect() {
  const visible = getVisibleSentences();
  el.sentenceSelect.innerHTML = "";

  if (visible.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noSentenceFilter");
    el.sentenceSelect.appendChild(option);
    return;
  }

  visible.forEach((sentence) => {
    const idx = state.lesson.sentences.findIndex((item) => item.sentence_id === sentence.sentence_id);
    const option = document.createElement("option");
    option.value = String(idx);
    const sentenceId = sentence?.sentence_id ? String(sentence.sentence_id) : "";
    const sentenceText = stripReviewMarkerForUi(sentence?.text);
    const labelId = formatSentenceLabel(sentenceId);
    option.textContent = sentenceText ? `${labelId} - ${sentenceText}` : labelId;
    el.sentenceSelect.appendChild(option);
  });

  const current = state.lesson.sentences[state.sentenceIndex];
  if (current && visible.some((item) => item.sentence_id === current.sentence_id)) {
    el.sentenceSelect.value = String(state.sentenceIndex);
  } else {
    const firstIdx = state.lesson.sentences.findIndex((item) => item.sentence_id === visible[0].sentence_id);
    state.sentenceIndex = firstIdx >= 0 ? firstIdx : 0;
    el.sentenceSelect.value = String(state.sentenceIndex);
  }
}

function renderProfileOptions() {
  el.phoneticProfileSelect.innerHTML = "";
  if (!state.profileConfig || !Array.isArray(state.profileConfig.profiles) || state.profileConfig.profiles.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("profileUnavailable");
    el.phoneticProfileSelect.appendChild(option);
    el.profileHelp.textContent = t("profileUnavailable");
    return;
  }

  const profiles = state.profileConfig.profiles;
  if (!state.activeProfileId) {
    state.activeProfileId = state.profileConfig.default_profile || profiles[0].profile_id;
  }

  profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.profile_id;
    option.textContent = profile.label || profile.profile_id;
    el.phoneticProfileSelect.appendChild(option);
  });

  el.phoneticProfileSelect.value = state.activeProfileId;
  const active = getActiveProfile();
  if (active) {
    el.profileHelp.textContent = `${t("profileHelpPrefix")} ${active.description || t("profileDefaultDesc")}`;
  } else {
    el.profileHelp.textContent = t("profileDefaultDesc");
  }
}

function renderSentence() {
  if (!state.lesson || !state.lesson.sentences || state.lesson.sentences.length === 0) {
    clearAudioRange();
    el.wordTableBody.innerHTML = "";
    el.compactWordGrid.innerHTML = "";
    renderPresentationSentence(null);
    return;
  }

  const visible = getVisibleSentences();
  updateDisplayHeaders();
  if (visible.length === 0) {
    clearAudioRange();
    el.sentenceTitle.textContent = t("noSentence");
    el.sentenceText.textContent = t("noSentenceMessage");
    el.sentenceRange.textContent = "";
    el.sentenceAlignment.textContent = "";
    el.sentenceAudio.removeAttribute("src");
    el.sentenceAudio.load();
    el.wordTableBody.innerHTML = "";
    el.compactWordGrid.innerHTML = "";
    renderPresentationSentence(null);
    return;
  }

  ensureSentenceIndexInBounds();
  const sentence = state.lesson.sentences[state.sentenceIndex];
  if (!sentence) {
    clearAudioRange();
    renderPresentationSentence(null);
    return;
  }

  el.sentenceTitle.textContent = formatSentenceLabel(sentence.sentence_id);
  el.sentenceText.textContent = sentence.text || "";
  if (state.viewMode === "compact") {
    el.sentenceRange.textContent = "";
    el.sentenceAlignment.textContent = "";
  } else {
    el.sentenceRange.textContent = t("rangeText", fmtTime(sentence.start_sec), fmtTime(sentence.end_sec));
    el.sentenceAlignment.textContent = t("alignmentText", (Number(sentence.alignment_score || 0) * 100).toFixed(1));
  }

  if (state.viewMode === "presentation") {
    renderPresentationSentence(sentence);
  } else {
    renderPresentationSentence(null);
  }

  const sentenceChanged = setAudioRangeForSentence(sentence);
  if (sentenceChanged) {
    cancelLoopRestartTimer();
    el.sentenceAudio.pause();
  }

  const nextAudioSrc = resolveAudioSrcForSentence(sentence);
  const currentAudioSrc = el.sentenceAudio.getAttribute("src") || "";

  if (!nextAudioSrc) {
    cancelLoopRestartTimer();
    el.sentenceAudio.pause();
    el.sentenceAudio.removeAttribute("src");
    el.sentenceAudio.load();
    renderWordRows(sentence);
    renderCompactRows(sentence);
    if (state.viewMode === "presentation") {
      renderPresentationSentence(sentence);
    } else {
      renderPresentationSentence(null);
    }
    rebuildSentenceSelect();
    return;
  }

  if (currentAudioSrc !== nextAudioSrc) {
    cancelLoopRestartTimer();
    el.sentenceAudio.src = nextAudioSrc;
    el.sentenceAudio.load();
  } else if (sentenceChanged) {
    syncAudioToSentenceStart(true);
  } else {
    enforceAudioPlaybackRange();
  }

  renderWordRows(sentence);
  renderCompactRows(sentence);
  rebuildSentenceSelect();
}

function jumpToSentence(delta, options = {}) {
  const preservePlayAll = !!options.preservePlayAll;
  const autoplayAfterJump = !!options.autoplayAfterJump;
  if (!preservePlayAll) {
    stopPresentationPlayAll();
  }
  const visible = getVisibleSentences();
  if (visible.length === 0) {
    return false;
  }

  const visibleIndices = visible.map((sentence) => state.lesson.sentences.findIndex((item) => item.sentence_id === sentence.sentence_id));
  const pos = visibleIndices.indexOf(state.sentenceIndex);
  let nextPos = pos + delta;
  if (nextPos < 0) {
    nextPos = 0;
  }
  if (nextPos >= visibleIndices.length) {
    nextPos = visibleIndices.length - 1;
  }
  const nextIndex = visibleIndices[nextPos];
  if (nextIndex < 0) {
    return false;
  }
  if (state.sentenceIndex === nextIndex) {
    return false;
  }
  if (preservePlayAll && autoplayAfterJump) {
    ignoreNextPauseForPlayAllOnce();
  }
  state.sentenceIndex = nextIndex;
  renderSentence();
  if (preservePlayAll && autoplayAfterJump) {
    requestPresentationPlayAllAutoplay();
  }
  return true;
}

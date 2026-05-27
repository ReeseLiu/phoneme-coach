function normalizeTokenSequence(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((token) => String(token || "").trim())
      .filter((token) => token);
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) {
      return [];
    }
    return text
      .split(/\s+/)
      .map((token) => String(token || "").trim())
      .filter((token) => token);
  }
  return [];
}

function getFallbackGoldIpaTokens(word) {
  const goldTokens = Array.isArray(word?.gold_ipa) ? word.gold_ipa.filter((token) => token) : [];
  const canonicalTokens = Array.isArray(word?.canonical_ipa) ? word.canonical_ipa.filter((token) => token) : [];
  const preferred = pickSClusterHintCandidate(word);
  const preferredSClusterTokens = Array.isArray(preferred?.ipa)
    ? preferred.ipa.filter((token) => token)
    : [];
  const goldLooksCanonical = goldTokens.length > 0
    && canonicalTokens.length > 0
    && tokensToText(goldTokens) === tokensToText(canonicalTokens);

  if (preferredSClusterTokens.length > 0 && (goldLooksCanonical || goldTokens.length === 0)) {
    return preferredSClusterTokens;
  }

  if (goldTokens.length > 0) {
    return goldTokens;
  }

  const bestTokens = Array.isArray(word?.best_surface_candidate?.ipa)
    ? word.best_surface_candidate.ipa.filter((token) => token)
    : [];
  return bestTokens;
}

function resolveQuickFillTokensBySystem(system, wordText, displayValue, ipaTokensRaw, tokenDetailsRaw) {
  const ipaTokens = normalizeTokenSequence(ipaTokensRaw);
  if (system === "ipa") {
    return ipaTokens;
  }

  const displayObj = (displayValue && typeof displayValue === "object" && !Array.isArray(displayValue))
    ? displayValue
    : {};

  if (ipaTokens.length > 0) {
    const details = Array.isArray(tokenDetailsRaw) ? tokenDetailsRaw : [];
    const mapped = displayTokensWithDetails(displayObj, ipaTokens, details, system, wordText)
      .map((token) => String(token || "").trim())
      .filter((token) => token);
    if (mapped.length > 0) {
      return mapped;
    }
  }

  const directDisplayTokens = normalizeTokenSequence(displayObj[system]);
  if (directDisplayTokens.length > 0) {
    return directDisplayTokens;
  }

  return [];
}

function getWordGoldDisplayEdits(word, create = false) {
  if (!word || typeof word !== "object") {
    return null;
  }
  const current = word.gold_display_edits;
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current;
  }
  if (!create) {
    return null;
  }
  word.gold_display_edits = {};
  return word.gold_display_edits;
}

function setWordGoldIpaTokens(word, tokens) {
  const nextTokens = Array.isArray(tokens)
    ? tokens.map((token) => String(token || "").trim()).filter((token) => token)
    : [];
  word.gold_ipa = nextTokens;
  updateGoldTokenDetailsForEditedTokens(word, nextTokens);
  word.gold_display = buildDisplayBundleFromTokens(nextTokens);
  return nextTokens;
}

function gatherGoldQuickFillOptions(word, system = "ipa") {
  const options = [];
  const seen = new Set();
  const safeSystem = (system === "ipa" || system === "kk" || system === "zhuyin_plus")
    ? system
    : "ipa";
  const wordText = String(word?.word || "");

  const addOption = (label, displayValue, ipaTokensRaw, tokenDetailsRaw) => {
    const normalized = resolveQuickFillTokensBySystem(
      safeSystem,
      wordText,
      displayValue,
      ipaTokensRaw,
      tokenDetailsRaw,
    );
    const key = tokensToText(normalized);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push({ label, tokens: normalized, key });
  };

  addOption(
    t("quickFillObserved"),
    word?.observed_display,
    word?.observed_ipa,
    word?.observed_token_details,
  );
  addOption(
    t("quickFillTeaching"),
    word?.teaching_phonetic_candidate?.display,
    word?.teaching_phonetic_candidate?.ipa,
    word?.teaching_phonetic_candidate?.token_details,
  );
  addOption(
    t("quickFillBestSurface"),
    word?.best_surface_candidate?.display,
    word?.best_surface_candidate?.ipa,
    word?.best_surface_candidate?.token_details,
  );
  addOption(
    t("quickFillCanonical"),
    word?.canonical_display,
    word?.canonical_ipa,
    word?.canonical_token_details,
  );

  const phonetic = Array.isArray(word?.phonetic_candidates) ? word.phonetic_candidates : [];
  phonetic.forEach((candidate, idx) => {
    addOption(
      t("quickFillPhonetic", idx + 1),
      candidate?.display,
      candidate?.ipa,
      candidate?.token_details,
    );
  });

  const surface = Array.isArray(word?.surface_candidates) ? word.surface_candidates : [];
  surface.forEach((candidate, idx) => {
    addOption(
      t("quickFillSurface", idx + 1),
      candidate?.display,
      candidate?.ipa,
      candidate?.token_details,
    );
  });

  return options;
}

function applyGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, nextTokens) {
  const appliedTokens = setWordGoldIpaTokens(word, nextTokens);
  goldInput.value = tokensToText(appliedTokens);
  renderGoldDisplayValue(appliedTokens);

  if (tokensToText(appliedTokens) !== initialGoldText) {
    goldInput.classList.add("changed");
  } else {
    goldInput.classList.remove("changed");
  }

  markServerDirty(true);
  markDirty(true);
  rerenderPresentationIfActive();
}

function applyDisplayGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, nextTokens) {
  const appliedTokens = normalizeTokenSequence(nextTokens);
  setCompactGoldTokens(word, state.displaySystem, appliedTokens);
  goldInput.value = tokensToText(appliedTokens);
  renderGoldDisplayValue(appliedTokens);

  if (tokensToText(appliedTokens) !== initialGoldText) {
    goldInput.classList.add("changed");
  } else {
    goldInput.classList.remove("changed");
  }

  markDirty(true);
  rerenderPresentationIfActive();
}

function applyCompactGoldInputValue(word, compactGoldInput, initialText, nextTokens) {
  const normalizedTokens = Array.isArray(nextTokens)
    ? nextTokens.map((token) => String(token || "").trim()).filter((token) => token)
    : [];
  setCompactGoldTokens(word, state.displaySystem, normalizedTokens);
  compactGoldInput.value = tokensToText(normalizedTokens);

  if (tokensToText(normalizedTokens) !== initialText) {
    compactGoldInput.classList.add("changed");
  } else {
    compactGoldInput.classList.remove("changed");
  }

  markCompactDirty(true);
  rerenderPresentationIfActive();
}

function getCompactGoldTokens(word, system) {
  const edits = getWordGoldDisplayEdits(word, false);
  if (edits && Array.isArray(edits[system])) {
    return edits[system].filter((token) => token);
  }
  const fallbackIpa = getFallbackGoldIpaTokens(word);
  const matchedDetails = pickTokenDetailsForWordTokens(word, fallbackIpa);
  const tokenDetails = matchedDetails.length > 0 ? matchedDetails : word?.gold_token_details;
  return displayTokensWithDetails(
    word?.gold_display,
    fallbackIpa,
    tokenDetails,
    system,
    word?.word,
  ).filter((token) => token);
}

function setCompactGoldTokens(word, system, tokens) {
  const edits = getWordGoldDisplayEdits(word, true);
  edits[system] = Array.isArray(tokens) ? [...tokens] : [];
}

function hasNonIpaGoldDisplayEditsInWord(word) {
  const edits = getWordGoldDisplayEdits(word, false);
  if (!edits || typeof edits !== "object") {
    return false;
  }
  return ["kk", "zhuyin_plus"].some((system) => Array.isArray(edits[system]) && edits[system].length > 0);
}

function hasNonIpaGoldDisplayEdits(lesson) {
  if (!lesson || !Array.isArray(lesson.sentences)) {
    return false;
  }
  return lesson.sentences.some((sentence) => {
    const words = Array.isArray(sentence.words) ? sentence.words : [];
    return words.some((word) => hasNonIpaGoldDisplayEditsInWord(word));
  });
}

function markServerDirty(isDirty = true) {
  state.serverDirty = !!isDirty;
  if (state.serverDirty) {
    state.dirty = true;
  }
  renderSaveStatus();
}

function renderSaveStatus() {
  if (state.dirty) {
    if (isLocalMode()) {
      el.saveStatus.textContent = t("localSavedByDownload");
      el.saveStatus.className = "status-unsaved";
      return;
    }
    if (isRemoteMode()) {
      if (state.remoteSavedToLocalStorage && !_remoteEditsSaveTimer) {
        el.saveStatus.textContent = t("remoteSavedInBrowser");
        el.saveStatus.className = "status-saved";
      } else {
        el.saveStatus.textContent = t("savingToBrowser");
        el.saveStatus.className = "status-unsaved";
      }
      return;
    }
    if (!state.serverDirty && hasNonIpaGoldDisplayEdits(state.lesson)) {
      el.saveStatus.textContent = t("nonIpaGoldEdited");
    } else {
      el.saveStatus.textContent = t("unsavedChanges");
    }
    el.saveStatus.className = "status-unsaved";
    return;
  }
  if (state.viewMode === "compact" || state.viewMode === "presentation") {
    el.saveStatus.textContent = t("compactSavedInBrowser");
    el.saveStatus.className = "";
    return;
  }
  el.saveStatus.textContent = t("noUnsaved");
  el.saveStatus.className = "";
}

function renderCompactNotice() {
  if (state.viewMode !== "compact") {
    el.viewModeNotice.textContent = "";
    el.viewModeNotice.className = "";
    return;
  }

  if (state.compactNoticeKind === "unsaved") {
    el.viewModeNotice.textContent = t("compactNoticeUnsaved");
    el.viewModeNotice.className = "status-unsaved";
    return;
  }

  if (state.compactNoticeKind === "downloaded") {
    el.viewModeNotice.textContent = t("compactNoticeDownloaded");
    el.viewModeNotice.className = "status-saved";
    return;
  }

  if (state.compactNoticeKind === "error") {
    el.viewModeNotice.textContent = t("compactDownloadFailed", state.compactNoticeErrorMessage || "unknown error");
    el.viewModeNotice.className = "status-error";
    return;
  }

  el.viewModeNotice.textContent = t("compactNoticeIdle");
  el.viewModeNotice.className = "";
}

function setCompactNotice(kind, errorMessage = "") {
  state.compactNoticeKind = kind;
  state.compactNoticeErrorMessage = errorMessage ? String(errorMessage) : "";
  renderCompactNotice();
}

function markCompactDirty(isDirty = true) {
  state.compactDirty = !!isDirty;
  if (state.compactDirty) {
    setCompactNotice("unsaved");
    return;
  }
  if (state.compactNoticeKind === "unsaved") {
    setCompactNotice("idle");
  } else {
    renderCompactNotice();
  }
}

function markDirty(isDirty = true) {
  state.dirty = isDirty;
  if (isDirty && isRemoteMode()) scheduleRemoteEditsSave();
  renderSaveStatus();
}

function setSavedStatus(message) {
  el.saveStatus.textContent = message;
  el.saveStatus.className = "status-saved";
}

function setErrorStatus(message) {
  el.saveStatus.textContent = message;
  el.saveStatus.className = "status-error";
}

function normalizeTextContent(raw) {
  const normalized = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function markTranscriptDirty(isDirty = true) {
  state.transcriptDirty = !!isDirty;
  if (state.transcriptDirty) {
    state.transcriptSavedInfo = null;
    el.transcriptEditor.classList.add("changed");
    if (state.rebuildCommand) {
      resetRebuildCommandUI();
    }
  } else {
    el.transcriptEditor.classList.remove("changed");
  }
  renderTranscriptPanel();
}

function applyTranscriptPayload(payload) {
  const safe = payload && typeof payload === "object" ? payload : { available: false };
  state.transcript = safe;

  if (!safe.available) {
    state.transcriptOriginal = "";
    state.transcriptDirty = false;
    state.transcriptSavedInfo = null;
    el.transcriptEditor.value = "";
    el.transcriptEditor.classList.remove("changed");
    renderTranscriptPanel();
    return;
  }

  const content = typeof safe.content === "string" ? safe.content : "";
  el.transcriptEditor.value = content;
  state.transcriptOriginal = normalizeTextContent(content);
  state.transcriptDirty = false;
  state.transcriptSavedInfo = null;
  state.transcriptErrorMessage = null;
  el.transcriptEditor.classList.remove("changed");
  renderTranscriptPanel();
}

function renderTranscriptPanel() {
  const info = state.transcript;
  if (!info || info.available === false) {
    el.transcriptEditor.disabled = true;
    el.saveTranscriptBtn.disabled = true;
    el.buildCommandBtn.disabled = true;
    el.transcriptStatus.className = "status-error";
    el.transcriptStatus.textContent = t("transcriptUnavailable");
    el.transcriptPath.textContent = info && info.message ? String(info.message) : "";
    return;
  }

  el.transcriptEditor.disabled = false;
  el.saveTranscriptBtn.disabled = false;
  el.buildCommandBtn.disabled = false;

  if (state.transcriptErrorMessage) {
    el.transcriptStatus.className = "status-error";
    el.transcriptStatus.textContent = t("transcriptSaveFailed", state.transcriptErrorMessage);
  } else if (state.transcriptDirty) {
    el.transcriptStatus.className = "status-unsaved";
    el.transcriptStatus.textContent = t("transcriptUnsaved");
  } else if (state.transcriptSavedInfo) {
    el.transcriptStatus.className = "status-saved";
    if (state.transcriptSavedInfo.backup) {
      el.transcriptStatus.textContent = `${t("transcriptSavedWithBackup", state.transcriptSavedInfo.saved, state.transcriptSavedInfo.backup)} ${t("transcriptNeedRebuild")}`;
    } else {
      el.transcriptStatus.textContent = `${t("transcriptSaved", state.transcriptSavedInfo.saved)} ${t("transcriptNeedRebuild")}`;
    }
  } else {
    el.transcriptStatus.className = "";
    const lineCount = Number(info.line_count || 0);
    el.transcriptStatus.textContent = t("transcriptReady", lineCount);
  }

  const pathParts = [];
  if (info.save_path) {
    pathParts.push(t("transcriptSavePath", info.save_path));
  }
  if (info.source_path) {
    pathParts.push(t("transcriptSourcePath", info.source_path));
  }
  if (info.content_source === "lesson_sentences") {
    pathParts.push(t("transcriptContentFromLesson"));
  } else {
    pathParts.push(t("transcriptContentFromSource"));
  }
  if (Array.isArray(info.notes) && info.notes.length > 0) {
    pathParts.push(info.notes.join(" "));
  }
  el.transcriptPath.textContent = pathParts.join(" | ");
}

async function saveTranscript() {
  if (isLocalMode()) {
    state.transcriptErrorMessage = t("transcriptLocalUnavailable");
    renderTranscriptPanel();
    return;
  }
  if (!state.transcript || state.transcript.available === false) {
    return;
  }

  const content = el.transcriptEditor.value;
  el.saveTranscriptBtn.disabled = true;
  try {
    const resp = await fetch("/api/save_transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `status=${resp.status}`);
    }

    state.transcriptErrorMessage = null;
    state.transcriptDirty = false;
    state.transcriptOriginal = normalizeTextContent(content);
    state.transcriptSavedInfo = {
      saved: data.saved || (state.transcript && state.transcript.save_path) || "",
      backup: data.backup || null,
    };
    el.transcriptEditor.classList.remove("changed");
    renderTranscriptPanel();
  } catch (err) {
    state.transcriptErrorMessage = String(err.message || err);
    renderTranscriptPanel();
  } finally {
    el.saveTranscriptBtn.disabled = false;
  }
}

function buildLessonPayloadForDownload() {
  if (!state.lesson) {
    return null;
  }
  const payload = JSON.parse(JSON.stringify(state.lesson));
  if (payload && typeof payload === "object") {
    delete payload._meta;
  }
  if (
    Array.isArray(payload.sentences) &&
    state.sentenceAudioOffsets &&
    typeof state.sentenceAudioOffsets === "object"
  ) {
    payload.sentences.forEach((sentence) => {
      if (!sentence || !sentence.sentence_id) {
        return;
      }
      const key = buildSentenceAudioOffsetKey(sentence);
      if (!key) {
        return;
      }
      const offsets = state.sentenceAudioOffsets[key];
      if (!offsets || typeof offsets !== "object") {
        return;
      }
      const ds = Number(offsets.start) || 0;
      const de = Number(offsets.end) || 0;
      if (Math.abs(ds) < 1e-9 && Math.abs(de) < 1e-9) {
        return;
      }
      if (typeof sentence.start_sec === "number") {
        sentence.start_sec = Math.round((sentence.start_sec + ds) * 10000) / 10000;
      }
      if (typeof sentence.end_sec === "number") {
        sentence.end_sec = Math.round((sentence.end_sec + de) * 10000) / 10000;
      }
    });
  }
  return payload;
}

function commitBakedAudioOffsetsToState() {
  if (!state.lesson || !Array.isArray(state.lesson.sentences)) {
    return;
  }
  if (!state.sentenceAudioOffsets || typeof state.sentenceAudioOffsets !== "object") {
    return;
  }
  const keysToDelete = [];
  state.lesson.sentences.forEach((sentence) => {
    if (!sentence || !sentence.sentence_id) {
      return;
    }
    const key = buildSentenceAudioOffsetKey(sentence);
    if (!key) {
      return;
    }
    const offsets = state.sentenceAudioOffsets[key];
    if (!offsets || typeof offsets !== "object") {
      return;
    }
    const ds = Number(offsets.start) || 0;
    const de = Number(offsets.end) || 0;
    if (Math.abs(ds) < 1e-9 && Math.abs(de) < 1e-9) {
      return;
    }
    if (typeof sentence.start_sec === "number") {
      sentence.start_sec = Math.round((sentence.start_sec + ds) * 10000) / 10000;
    }
    if (typeof sentence.end_sec === "number") {
      sentence.end_sec = Math.round((sentence.end_sec + de) * 10000) / 10000;
    }
    keysToDelete.push(key);
  });
  if (keysToDelete.length === 0) {
    return;
  }
  keysToDelete.forEach((key) => {
    delete state.sentenceAudioOffsets[key];
  });
  persistSentenceAudioOffsets();
  const currentSentence = getCurrentSentence();
  if (currentSentence) {
    setAudioRangeForSentence(currentSentence);
    renderAudioOffsetControls();
  }
}

function buildLessonPayloadForServerSave() {
  const payload = buildLessonPayloadForDownload();
  if (!payload || !Array.isArray(payload.sentences)) {
    return payload;
  }
  payload.sentences.forEach((sentence) => {
    const words = Array.isArray(sentence.words) ? sentence.words : [];
    words.forEach((word) => {
      if (word && typeof word === "object") {
        delete word.gold_display_edits;
      }
    });
  });
  return payload;
}

function downloadEditedLessonJson() {
  try {
    const payload = buildLessonPayloadForDownload();
    if (!payload) {
      return;
    }

    const lessonInfo = getCurrentLessonInfo();
    const lessonId = sanitizeFilePart(payload.lesson_id || (lessonInfo && lessonInfo.lesson_id) || "lesson");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${lessonId}_display_edits_${stamp}.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    triggerBlobDownload(blob, fileName);
    commitBakedAudioOffsetsToState();

    state.compactDirty = false;
    setCompactNotice("downloaded");
    if (isLocalMode()) {
      markServerDirty(false);
      markDirty(false);
      setSavedStatus(t("localSavedDownloaded"));
    }
  } catch (err) {
    setCompactNotice("error", String(err.message || err));
  }
}

function resolveOfflineZipAudioPath(sourcePath, sentenceId = "") {
  const normalized = normalizeLocalRelativePath(sourcePath);
  if (!normalized) {
    return "";
  }
  const lowered = normalized.toLowerCase();
  const markers = [
    { marker: "/sentences/", folder: "sentences" },
    { marker: "/audio/", folder: "audio" },
  ];
  for (const item of markers) {
    const markerIdx = lowered.lastIndexOf(item.marker);
    if (markerIdx < 0) {
      continue;
    }
    const suffix = normalized.slice(markerIdx + item.marker.length);
    return suffix ? `${item.folder}/${suffix}` : "";
  }
  if (lowered.startsWith("sentences/")) {
    return normalized;
  }
  if (lowered.startsWith("audio/")) {
    return normalized;
  }
  const fileName = normalized.split("/").pop();
  if (!fileName) {
    return "";
  }
  const fileLower = fileName.toLowerCase();
  const sentenceIdLower = String(sentenceId || "").trim().toLowerCase();
  if ((sentenceIdLower && fileLower.startsWith(`${sentenceIdLower}.`)) || /^s\d{4}\./i.test(fileName)) {
    return `sentences/${fileName}`;
  }
  return `audio/${fileName}`;
}

function collectAudioEntriesForOfflineZip() {
  if (!(state.localLessonFiles instanceof Map)) {
    return [];
  }
  const result = [];
  const seen = new Set();
  const sentences = Array.isArray(state.lesson?.sentences) ? state.lesson.sentences : [];

  const addBySentence = (sentence) => {
    const audioPath = String(sentence?.audio_path || state.lesson?.audio_path || "");
    const entry = resolveLocalAudioEntry(audioPath, sentence);
    if (!entry || !(entry.file instanceof File)) {
      return;
    }
    const normalized = normalizeLocalRelativePath(entry.path);
    const zipPath = resolveOfflineZipAudioPath(normalized, sentence?.sentence_id || "");
    if (!zipPath || seen.has(zipPath.toLowerCase())) {
      return;
    }
    seen.add(zipPath.toLowerCase());
    result.push({
      zipPath,
      file: entry.file,
    });
  };

  sentences.forEach(addBySentence);
  return result;
}

function collectServerAudioEntriesForOfflineZip() {
  const result = [];
  const seen = new Set();
  const sentences = Array.isArray(state.lesson?.sentences) ? state.lesson.sentences : [];

  const addBySentence = (sentence) => {
    const rawAudioPath = String(sentence?.audio_path || state.lesson?.audio_path || "").trim();
    if (!rawAudioPath) {
      return;
    }
    const normalized = normalizeLocalRelativePath(rawAudioPath);
    const zipPath = resolveOfflineZipAudioPath(normalized || rawAudioPath, sentence?.sentence_id || "");
    if (!zipPath || seen.has(zipPath.toLowerCase())) {
      return;
    }
    seen.add(zipPath.toLowerCase());
    result.push({
      zipPath,
      sourcePath: rawAudioPath,
    });
  };

  sentences.forEach(addBySentence);
  return result;
}

async function fetchServerAudioBytesForOfflineZip(item) {
  const response = await fetch(`/api/audio?path=${encodeURIComponent(item.sourcePath)}`);
  if (!response.ok) {
    throw new Error(`audio status=${response.status} path=${item.sourcePath}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function fetchRemoteAudioBytesForOfflineZip(item) {
  const url = `${state.remoteLessonBaseUrl}/${item.sourcePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`audio status=${response.status} url=${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadOfflineLessonZip() {
  if (state.offlineZipDownloading) {
    return;
  }
  state.offlineZipDownloading = true;
  applyViewMode();
  try {
    const payload = buildLessonPayloadForDownload();
    if (!payload) {
      return;
    }

    const lessonInfo = getCurrentLessonInfo();
    const lessonId = sanitizeFilePart(payload.lesson_id || (lessonInfo && lessonInfo.lesson_id) || "lesson");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${lessonId}_offline_package_${stamp}.zip`;

    const localMode = isLocalMode();
    const remoteMode = isRemoteMode();
    const localAudioEntries = localMode ? collectAudioEntriesForOfflineZip() : [];
    const remoteOrServerAudioEntries = (!localMode) ? collectServerAudioEntriesForOfflineZip() : [];
    const zipEntries = [];
    zipEntries.push({
      path: "lesson.json",
      bytes: UTF8_ENCODER.encode(JSON.stringify(payload, null, 2)),
      lastModified: Date.now(),
    });

    let addedAudioCount = 0;
    let failedAudioCount = 0;

    if (localMode) {
      for (const item of localAudioEntries) {
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        zipEntries.push({
          path: item.zipPath,
          bytes,
          lastModified: Number(item.file.lastModified || Date.now()),
        });
        addedAudioCount += 1;
      }
    } else {
      const fetchFn = remoteMode ? fetchRemoteAudioBytesForOfflineZip : fetchServerAudioBytesForOfflineZip;
      for (const item of remoteOrServerAudioEntries) {
        try {
          const bytes = await fetchFn(item);
          zipEntries.push({
            path: item.zipPath,
            bytes,
            lastModified: Date.now(),
          });
          addedAudioCount += 1;
        } catch {
          failedAudioCount += 1;
        }
      }
    }

    const zipBlob = buildZipBlob(zipEntries);
    triggerBlobDownload(zipBlob, fileName);
    commitBakedAudioOffsetsToState();

    state.compactDirty = false;
    setCompactNotice("downloaded");
    markServerDirty(false);
    markDirty(false);
    if (localMode) {
      setSavedStatus(t("localSavedDownloadedZip", addedAudioCount));
    } else if (failedAudioCount > 0) {
      setSavedStatus(t("savedDownloadedZipWithMissing", addedAudioCount, failedAudioCount));
    } else {
      setSavedStatus(t("savedDownloadedZip", addedAudioCount));
    }
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    setCompactNotice("error", message);
    setErrorStatus(t("compactDownloadFailed", message));
  } finally {
    state.offlineZipDownloading = false;
    applyViewMode();
  }
}

async function saveLesson() {
  if (!state.lesson) {
    return;
  }
  if (isLocalMode()) {
    markServerDirty(false);
    renderSaveStatus();
    return;
  }
  const hasNonIpaDisplayEdits = hasNonIpaGoldDisplayEdits(state.lesson);
  if (!state.serverDirty && hasNonIpaDisplayEdits) {
    state.dirty = true;
    el.saveStatus.textContent = t("nonIpaGoldSaveSkipped");
    el.saveStatus.className = "status-unsaved";
    return;
  }
  const payload = buildLessonPayloadForServerSave();
  try {
    const resp = await fetch("/api/save_gold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `status=${resp.status}`);
    }
    markServerDirty(false);
    commitBakedAudioOffsetsToState();
    if (hasNonIpaDisplayEdits) {
      state.dirty = true;
      el.saveStatus.textContent = t("nonIpaGoldSaveSkipped");
      el.saveStatus.className = "status-unsaved";
    } else {
      markDirty(false);
      setSavedStatus(t("savedWithBackup", data.backup));
    }
  } catch (err) {
    setErrorStatus(t("saveFailed", err.message));
  }
}

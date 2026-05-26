function isLocalMode() {
  return state.dataSourceMode === "local";
}

function isRemoteMode() {
  return state.dataSourceMode === "remote";
}

function setLocalLessonStatus(kind, text = "") {
  state.localLessonStatusKind = kind;
  state.localLessonStatusText = String(text || "");
  renderLocalLessonStatus();
}

function renderLocalLessonStatus() {
  if (!el.localLessonStatus) {
    return;
  }
  const fallback = t("localLessonIdle");
  const content = state.localLessonStatusText || fallback;
  el.localLessonStatus.textContent = content;
  if (state.localLessonStatusKind === "error") {
    el.localLessonStatus.className = "status-error";
    return;
  }
  if (state.localLessonStatusKind === "saved") {
    el.localLessonStatus.className = "status-saved";
    return;
  }
  if (state.localLessonStatusKind === "loading") {
    el.localLessonStatus.className = "status-unsaved";
    return;
  }
  el.localLessonStatus.className = "";
}

function normalizeLocalRelativePath(rawPath) {
  const raw = String(rawPath || "").replace(/\\/g, "/").trim();
  if (!raw) {
    return "";
  }
  const parts = raw.split("/");
  const safe = [];
  for (const part of parts) {
    const token = String(part || "").trim();
    if (!token || token === ".") {
      continue;
    }
    if (token === "..") {
      return "";
    }
    safe.push(token);
  }
  if (safe.length === 0) {
    return "";
  }
  return safe.join("/");
}

function releaseLocalAudioUrls() {
  if (!(state.localAudioUrls instanceof Map)) {
    state.localAudioUrls = new Map();
    return;
  }
  state.localAudioUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore revoke errors
    }
  });
  state.localAudioUrls.clear();
}

function setLocalLessonFiles(filesMap) {
  state.localLessonFiles = filesMap instanceof Map ? filesMap : new Map();
  state.localSentenceAudioCache = new Map();
  releaseLocalAudioUrls();
}

function buildLocalFileLookup(fileList) {
  const files = Array.from(fileList || []).filter((item) => item instanceof File);
  if (files.length === 0) {
    throw new Error(t("localLessonNoFiles"));
  }
  if (files.length > LOCAL_MAX_IMPORT_FILES) {
    throw new Error(t("localLessonTooManyFiles", LOCAL_MAX_IMPORT_FILES));
  }

  let totalBytes = 0;
  const lookup = new Map();
  const lessonCandidates = [];

  const addEntry = (aliasPath, file) => {
    const normalized = normalizeLocalRelativePath(aliasPath);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (!lookup.has(key)) {
      lookup.set(key, { path: normalized, file });
    }
  };

  files.forEach((file) => {
    totalBytes += Math.max(0, Number(file.size || 0));
    const rawRel = (typeof file.webkitRelativePath === "string" && file.webkitRelativePath)
      ? file.webkitRelativePath
      : file.name;
    const normalized = normalizeLocalRelativePath(rawRel);
    if (!normalized) {
      return;
    }

    const segments = normalized.split("/");
    const fileName = (segments[segments.length - 1] || "").toLowerCase();
    if (fileName === "lesson.json") {
      lessonCandidates.push({ path: normalized, file });
    }

    addEntry(normalized, file);
    if (segments.length > 1) {
      addEntry(segments.slice(1).join("/"), file);
    }
    addEntry(segments[segments.length - 1], file);
  });

  if (totalBytes > LOCAL_MAX_IMPORT_BYTES) {
    const gb = (LOCAL_MAX_IMPORT_BYTES / (1024 ** 3)).toFixed(1);
    throw new Error(t("localLessonTooLarge", gb));
  }

  if (lessonCandidates.length === 0) {
    throw new Error(t("localLessonNoLessonJson"));
  }
  if (lessonCandidates.length > 1) {
    throw new Error(t("localLessonMultipleLessonJson"));
  }

  const lessonEntry = lessonCandidates[0];
  const lessonSegments = lessonEntry.path.split("/");
  const rootName = lessonSegments.length > 1
    ? lessonSegments[0]
    : sanitizeFilePart(String(lessonEntry.file.name || "").replace(/\.json$/i, ""), "local_lesson");

  return {
    lookup,
    lessonEntry,
    rootName,
  };
}

function localFileEntryByPath(pathText) {
  if (!(state.localLessonFiles instanceof Map)) {
    return null;
  }
  const normalized = normalizeLocalRelativePath(pathText);
  if (!normalized) {
    return null;
  }
  return state.localLessonFiles.get(normalized.toLowerCase()) || null;
}

function localFileEntryBySuffix(rawPath) {
  const normalized = normalizeLocalRelativePath(rawPath);
  if (!normalized) {
    return null;
  }
  const lowered = normalized.toLowerCase();
  for (const marker of ["/sentences/", "/audio/"]) {
    const markerIdx = lowered.lastIndexOf(marker);
    if (markerIdx < 0) {
      continue;
    }
    const suffix = normalized.slice(markerIdx + 1);
    return localFileEntryByPath(suffix);
  }
  return null;
}

function localFileEntryBySentenceId(sentenceId) {
  if (!sentenceId || !(state.localLessonFiles instanceof Map)) {
    return null;
  }
  const sid = String(sentenceId || "").trim().toLowerCase();
  if (!sid) {
    return null;
  }
  for (const entry of state.localLessonFiles.values()) {
    const pathLower = String(entry?.path || "").toLowerCase();
    if (!pathLower) {
      continue;
    }
    if (pathLower.endsWith(`/sentences/${sid}.wav`) || pathLower.endsWith(`/${sid}.wav`)) {
      return entry;
    }
  }
  return null;
}

function resolveLocalAudioEntry(audioPath, sentence) {
  const sentenceId = String(sentence?.sentence_id || "").trim();
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = normalizeLocalRelativePath(value);
    if (!normalized) {
      return;
    }
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  addCandidate(audioPath);

  const bySuffix = localFileEntryBySuffix(audioPath);
  if (bySuffix) {
    return bySuffix;
  }

  const normalizedAudioPath = normalizeLocalRelativePath(audioPath);
  const fileName = normalizedAudioPath ? normalizedAudioPath.split("/").pop() : "";
  if (fileName) {
    addCandidate(fileName);
    addCandidate(`sentences/${fileName}`);
    addCandidate(`audio/${fileName}`);
  }
  if (sentenceId) {
    addCandidate(`${sentenceId}.wav`);
    addCandidate(`sentences/${sentenceId}.wav`);
  }

  for (const candidate of candidates) {
    const byPath = localFileEntryByPath(candidate);
    if (byPath) {
      return byPath;
    }
  }

  const bySentence = localFileEntryBySentenceId(sentenceId);
  if (bySentence) {
    return bySentence;
  }
  return null;
}

function getLocalAudioSrcForSentence(sentence) {
  if (!sentence) {
    return "";
  }
  const sentenceId = String(sentence?.sentence_id || "").trim();
  const audioPath = String(sentence?.audio_path || state.lesson?.audio_path || "");
  const cacheKey = `${sentenceId}|${audioPath}`;
  if (!(state.localSentenceAudioCache instanceof Map)) {
    state.localSentenceAudioCache = new Map();
  }
  if (state.localSentenceAudioCache.has(cacheKey)) {
    return state.localSentenceAudioCache.get(cacheKey) || "";
  }

  const entry = resolveLocalAudioEntry(audioPath, sentence);
  if (!entry || !(entry.file instanceof File)) {
    state.localSentenceAudioCache.set(cacheKey, "");
    return "";
  }

  const urlKey = String(entry.path || "").toLowerCase();
  let blobUrl = state.localAudioUrls.get(urlKey);
  if (!blobUrl) {
    blobUrl = URL.createObjectURL(entry.file);
    state.localAudioUrls.set(urlKey, blobUrl);
  }
  state.localSentenceAudioCache.set(cacheKey, blobUrl);
  return blobUrl;
}

function buildRemoteAudioSrc(audioPath) {
  // Absolute paths (e.g. /mnt/reesenas/.../file.mp3) are NAS artifacts —
  // extract just the filename and assume it lives under audio/ in the lesson dir.
  const normalized = audioPath.startsWith("/")
    ? `audio/${audioPath.split("/").pop()}`
    : audioPath;
  return `${state.remoteLessonBaseUrl}/${normalized}`;
}

function resolveAudioSrcForSentence(sentence) {
  const audioPath = sentence.audio_path || state.lesson.audio_path;
  if (isLocalMode()) {
    const localSrc = getLocalAudioSrcForSentence(sentence);
    if (localSrc) return localSrc;
    if (state.remoteLessonBaseUrl && audioPath) {
      return buildRemoteAudioSrc(audioPath);
    }
    return "";
  }
  if (isRemoteMode()) {
    return audioPath ? buildRemoteAudioSrc(audioPath) : "";
  }
  return audioPath ? `/api/audio?path=${encodeURIComponent(audioPath)}` : "";
}

function localLessonCatalogEntry(lessonPayload, key, rootName, lessonPath) {
  const sentenceCount = Array.isArray(lessonPayload?.sentences) ? lessonPayload.sentences.length : 0;
  const displayName = String(lessonPayload?.lesson_id || rootName || "local_lesson");
  return {
    key,
    lesson_id: String(lessonPayload?.lesson_id || rootName || "local_lesson"),
    run_name: String(rootName || "local_lesson"),
    run_kind: "local",
    display_name: displayName,
    lesson_path: lessonPath,
    sentence_count: sentenceCount,
    created_at_utc: null,
    modified_at_epoch: Math.round(Date.now() / 1000),
    transcript_source: String(lessonPayload?.transcript_source || "local"),
    timeline_source: String(lessonPayload?.timeline_source || "local"),
  };
}

function buildLocalDisplayTableFromLesson(lessonPayload) {
  const table = lessonPayload && typeof lessonPayload === "object"
    ? lessonPayload.display_table
    : null;
  if (table && typeof table === "object" && !Array.isArray(table)) {
    return table;
  }
  // Lesson has no embedded display_table. Old lessons store stale non-zhuyin notation
  // (e.g. 'eh', 'r', 'oo') in canonical_display, which would corrupt DEFAULT_DISPLAY_TABLE
  // when used as an overlay. DEFAULT_DISPLAY_TABLE covers all standard phonemes, so
  // return empty and let it stand as-is.
  return {};
}

function canSwitchLessonWithConfirm() {
  if (state.transcriptDirty && !window.confirm(t("switchLessonTranscriptConfirm"))) {
    return false;
  }

  if (state.compactDirty && !window.confirm(t("compactSwitchLessonConfirm"))) {
    return false;
  }

  if (state.dirty && !window.confirm(t("switchLessonConfirm"))) {
    return false;
  }

  return true;
}

async function importLocalLessonDirectory(fileList) {
  stopPresentationPlayAll();
  if (!canSwitchLessonWithConfirm()) {
    if (el.localLessonDirInput) {
      el.localLessonDirInput.value = "";
    }
    return;
  }

  setLocalLessonStatus("loading", t("loadingLesson"));

  try {
    const { lookup, lessonEntry, rootName } = buildLocalFileLookup(fileList);
    const lessonRaw = await lessonEntry.file.text();
    const parsedLesson = JSON.parse(lessonRaw);
    if (!parsedLesson || typeof parsedLesson !== "object" || Array.isArray(parsedLesson)) {
      throw new Error("lesson.json must be a JSON object.");
    }
    if (!Array.isArray(parsedLesson.sentences)) {
      throw new Error("lesson.json must include sentences array.");
    }

    const localKey = buildLocalLessonStableKey(rootName, parsedLesson);
    const lessonPath = `${rootName || "local_lesson"}/lesson.json`;

    setLocalLessonFiles(lookup);
    state.localLessonRootName = rootName || "local_lesson";
    state.dataSourceMode = "local";

    state.lesson = parsedLesson;
    if (!state.lesson._meta || typeof state.lesson._meta !== "object") {
      state.lesson._meta = {};
    }
    state.lesson._meta.lesson_path = lessonPath;

    state.lessons = [localLessonCatalogEntry(state.lesson, localKey, rootName, lessonPath)];
    state.currentLessonKey = localKey;

    state.profileConfig = null;
    applyDisplayMappingFromLesson(state.lesson);
    state.displayTable = mergeDisplayTables(state.displayTable, buildLocalDisplayTableFromLesson(state.lesson));

    applyTranscriptPayload({
      available: false,
      message: t("transcriptLocalUnavailable"),
    });

    state.rebuildCommand = "";
    state.rebuildCommandStatusKind = "error";
    state.rebuildCommandStatusText = t("rebuildCommandLocalUnavailable");
    renderRebuildCommandUI();

    resetLessonStateForImport();

    renderLessonOptions();
    rebuildSentenceSelect();
    applyLanguage();

    const sentenceCount = Array.isArray(state.lesson.sentences) ? state.lesson.sentences.length : 0;
    setLocalLessonStatus("saved", t("localLessonLoaded", state.localLessonRootName, sentenceCount));
    if (state.appScreen === "entry") {
      state.appScreen = "editor";
      applyAppScreen();
      setViewMode("presentation");
    }
  } catch (err) {
    const errMsg = t("localLessonLoadFailed", String(err.message || err));
    setLocalLessonStatus("error", errMsg);
    if (el.entryLocalStatus) el.entryLocalStatus.textContent = errMsg;
  } finally {
    if (el.localLessonDirInput) {
      el.localLessonDirInput.value = "";
    }
    if (el.entryLocalDirInput) {
      el.entryLocalDirInput.value = "";
    }
  }
}

function setRemoteLessonStatus(kind, text = "") {
  state.remoteLessonStatusKind = kind;
  state.remoteLessonStatusText = String(text || "");
  if (el.remoteLessonStatus) {
    el.remoteLessonStatus.textContent = state.remoteLessonStatusText;
    el.remoteLessonStatus.className =
      kind === "error" ? "status-error" : kind === "saved" ? "status-saved" : kind === "loading" ? "status-unsaved" : "";
  }
}

function clearRemoteLessonEdits(slug) {
  clearRemoteLessonEditsFromStorage(slug);
  renderSaveStatus();
  updateClearRemoteEditsBtn();
}

function updateClearRemoteEditsBtn() {
  if (!el.clearRemoteEditsBtn) return;
  el.clearRemoteEditsBtn.hidden = !(isRemoteMode() && state.remoteSavedToLocalStorage);
  if (!el.clearRemoteEditsBtn.hidden) {
    el.clearRemoteEditsBtn.textContent = t("clearRemoteEdits");
  }
}

let _remoteEditsSaveTimer = null;
function scheduleRemoteEditsSave() {
  if (_remoteEditsSaveTimer) clearTimeout(_remoteEditsSaveTimer);
  _remoteEditsSaveTimer = setTimeout(() => {
    _remoteEditsSaveTimer = null;
    if (!isRemoteMode() || !state.lesson) return;
    const slug = (state.currentLessonKey || "").replace("remote:", "");
    if (!slug) return;
    saveRemoteLessonEdits(slug, state.lesson);
    renderSaveStatus();
    updateClearRemoteEditsBtn();
  }, 1500);
}

function renderRemoteCatalogSelect() {
  if (!el.remoteCatalogSelect || !state.remoteCatalog) return;
  el.remoteCatalogSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("remoteLessonSelectPlaceholder");
  el.remoteCatalogSelect.appendChild(placeholder);
  const lessons = Array.isArray(state.remoteCatalog.lessons) ? state.remoteCatalog.lessons : [];
  lessons.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.slug;
    const countLabel = state.uiLanguage === "zh-TW" ? `${entry.sentence_count} 句` : `${entry.sentence_count} sentences`;
    option.textContent = `${entry.display_name} (${countLabel})`;
    el.remoteCatalogSelect.appendChild(option);
  });
  if (el.loadRemoteLessonBtn) {
    el.loadRemoteLessonBtn.disabled = lessons.length === 0;
  }
}

function renderEntryCatalogSelect() {
  if (!el.entryCatalogSelect || !state.remoteCatalog) return;
  el.entryCatalogSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("remoteLessonSelectPlaceholder");
  el.entryCatalogSelect.appendChild(placeholder);
  const lessons = Array.isArray(state.remoteCatalog.lessons) ? state.remoteCatalog.lessons : [];
  lessons.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.slug;
    const countLabel = state.uiLanguage === "zh-TW" ? `${entry.sentence_count} 句` : `${entry.sentence_count} sentences`;
    option.textContent = `${entry.display_name} (${countLabel})`;
    el.entryCatalogSelect.appendChild(option);
  });
  if (el.entryLoadRemoteBtn) {
    el.entryLoadRemoteBtn.disabled = lessons.length === 0;
  }
}

async function loadRemoteCatalog() {
  try {
    const resp = await fetch("./lessons/catalog.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const catalog = await resp.json();
    state.remoteCatalog = catalog;
    renderRemoteCatalogSelect();
    renderEntryCatalogSelect();
  } catch {
    if (el.remoteLessonGroup) {
      el.remoteLessonGroup.hidden = true;
    }
    if (el.entryRemoteGroup) {
      el.entryRemoteGroup.hidden = true;
    }
  }
}

async function loadRemoteLesson(slug) {
  if (!slug) return;
  if (!canSwitchLessonWithConfirm()) return;

  const baseUrl = `./lessons/${slug}`;
  setRemoteLessonStatus("loading", t("loadingLesson"));
  if (el.loadRemoteLessonBtn) el.loadRemoteLessonBtn.disabled = true;

  try {
    const resp = await fetch(`${baseUrl}/lesson.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const parsedLesson = await resp.json();
    if (!parsedLesson || typeof parsedLesson !== "object" || Array.isArray(parsedLesson)) {
      throw new Error("lesson.json must be a JSON object.");
    }
    if (!Array.isArray(parsedLesson.sentences)) {
      throw new Error("lesson.json must include sentences array.");
    }

    state.remoteLessonBaseUrl = baseUrl;
    state.dataSourceMode = "remote";
    state.remoteSavedToLocalStorage = false;
    state.lesson = parsedLesson;
    if (!state.lesson._meta || typeof state.lesson._meta !== "object") {
      state.lesson._meta = {};
    }
    state.lesson._meta.lesson_path = `${baseUrl}/lesson.json`;

    const hadSavedEdits = restoreRemoteLessonEdits(slug, state.lesson);
    state.remoteSavedToLocalStorage = hadSavedEdits;
    if (hadSavedEdits) state.dirty = true;

    const lessonId = parsedLesson.lesson_id || slug;
    const sentenceCount = parsedLesson.sentences.length;
    const catalogEntry = state.remoteCatalog
      ? (state.remoteCatalog.lessons || []).find((e) => e.slug === slug)
      : null;
    const displayName = parsedLesson.display_name || (catalogEntry && catalogEntry.display_name) || slug;

    state.lessons = [{
      key: `remote:${slug}`,
      lesson_id: lessonId,
      display_name: displayName,
      run_name: slug,
      run_kind: "remote",
      sentence_count: sentenceCount,
    }];
    state.currentLessonKey = `remote:${slug}`;

    state.profileConfig = null;
    applyDisplayMappingFromLesson(state.lesson);
    state.displayTable = mergeDisplayTables(state.displayTable, buildLocalDisplayTableFromLesson(state.lesson));

    applyTranscriptPayload({ available: false, message: t("transcriptLocalUnavailable") });

    state.rebuildCommand = "";
    state.rebuildCommandStatusKind = "error";
    state.rebuildCommandStatusText = t("rebuildCommandLocalUnavailable");
    renderRebuildCommandUI();

    resetLessonStateForImport();
    if (hadSavedEdits) state.dirty = true;
    renderLessonOptions();
    rebuildSentenceSelect();
    applyLanguage();
    updateClearRemoteEditsBtn();

    const loadedMsg = t("remoteLessonLoaded", displayName, sentenceCount);
    setRemoteLessonStatus("saved", hadSavedEdits ? loadedMsg + " " + t("remoteSavedRestored") : loadedMsg);
    if (state.appScreen === "entry") {
      state.appScreen = "editor";
      applyAppScreen();
      setViewMode("presentation");
    }
  } catch (err) {
    const errMsg = t("remoteLessonLoadFailed", String(err.message || err));
    setRemoteLessonStatus("error", errMsg);
    if (el.entryRemoteStatus) el.entryRemoteStatus.textContent = errMsg;
  } finally {
    if (el.loadRemoteLessonBtn) el.loadRemoteLessonBtn.disabled = false;
  }
}

async function loadData() {
  let lessonsResp;
  try {
    lessonsResp = await fetch("/api/lessons");
  } catch (err) {
    const message = t("localLessonServerUnavailable", String(err.message || err));
    state.dataSourceMode = "local";
    state.lessons = [];
    state.currentLessonKey = null;
    renderLessonOptions();
    setLocalLessonStatus("error", message);
    throw new Error(message);
  }

  if (!lessonsResp.ok) {
    const message = t("localLessonServerUnavailable", `status=${lessonsResp.status}`);
    state.dataSourceMode = "local";
    state.lessons = [];
    state.currentLessonKey = null;
    renderLessonOptions();
    setLocalLessonStatus("error", message);
    throw new Error(message);
  }

  state.dataSourceMode = "server";
  const lessonsPayload = await lessonsResp.json();
  state.lessons = Array.isArray(lessonsPayload.lessons) ? lessonsPayload.lessons : [];
  state.currentLessonKey = lessonsPayload.current_key || (state.lessons[0] ? state.lessons[0].key : null);
  renderLessonOptions();
  await loadCurrentLesson();
}

async function loadCurrentLesson() {
  state.dataSourceMode = "server";
  state.localLessonRootName = "";
  setLocalLessonFiles(new Map());
  setLocalLessonStatus("idle", "");

  const [lessonResp, profilesResp, transcriptResp, displayResp] = await Promise.all([
    fetch("/api/lesson"),
    fetch("/api/profiles"),
    fetch("/api/transcript"),
    fetch("/api/display_table"),
  ]);

  if (!lessonResp.ok) {
    throw new Error(`lesson status=${lessonResp.status}`);
  }

  state.lesson = await lessonResp.json();
  const lessonPath = state.lesson && state.lesson._meta ? state.lesson._meta.lesson_path : null;
  if (lessonPath) {
    state.currentLessonKey = String(lessonPath);
  }

  state.profileConfig = profilesResp.ok ? await profilesResp.json() : { available: false };
  const transcriptPayload = transcriptResp.ok
    ? await transcriptResp.json()
    : { available: false, message: `status=${transcriptResp.status}` };
  const displayPayload = displayResp.ok
    ? await displayResp.json()
    : { available: false, table: {} };

  applyDisplayMappingFromLesson(state.lesson);

  const serverTable = (displayPayload && displayPayload.available && displayPayload.table && typeof displayPayload.table === "object")
    ? displayPayload.table
    : null;
  state.displayTable = mergeDisplayTables(state.displayTable, serverTable);

  const payloadExceptions = displayPayload && displayPayload.available
    ? parseDisplayExceptions(displayPayload.exceptions)
    : {};
  state.displayExceptions = mergeDisplayExceptionsMaps(state.displayExceptions, payloadExceptions);
  applyTranscriptPayload(transcriptPayload);
  resetRebuildCommandUI();
  if (state.profileConfig && state.profileConfig.available === false) {
    state.profileConfig = null;
  }

  if (!state.activeProfileId && state.profileConfig && state.profileConfig.default_profile) {
    state.activeProfileId = state.profileConfig.default_profile;
  }

  resetLessonStateForImport();
  rebuildSentenceSelect();
  applyLanguage();
}

async function switchLessonByKey(nextKey) {
  stopPresentationPlayAll();
  if (isLocalMode()) {
    el.lessonSelect.value = state.currentLessonKey || "";
    return;
  }
  const wanted = String(nextKey || "").trim();
  if (!wanted || wanted === state.currentLessonKey) {
    el.lessonSelect.value = state.currentLessonKey || "";
    return;
  }

  if (!canSwitchLessonWithConfirm()) {
    el.lessonSelect.value = state.currentLessonKey || "";
    return;
  }

  el.lessonSelect.disabled = true;
  try {
    const resp = await fetch("/api/select_lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: wanted }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `status=${resp.status}`);
    }

    state.currentLessonKey = data.key || wanted;
    await loadData();
  } catch (err) {
    setErrorStatus(t("saveFailed", err.message));
    el.lessonSelect.value = state.currentLessonKey || "";
  } finally {
    el.lessonSelect.disabled = false;
  }
}

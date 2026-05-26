const STORAGE_KEYS = {
  language: "psl.ui.language",
  showDetails: "psl.ui.showDetails",
  displaySystem: "psl.ui.displaySystem",
  profile: "psl.ui.profile",
  loopSentence: "psl.ui.loopSentence",
  loopGapSec: "psl.ui.loopGapSec",
  loopCountTotal: "psl.ui.loopCountTotal",
  sentenceAudioOffsets: "psl.ui.sentenceAudioOffsets",
  presentationPlaybackRate: "psl.ui.presentationPlaybackRate",
  presentationShowPhonemes: "psl.ui.presentationShowPhonemes",
  remoteEditsPrefix: "psl.remote.edits.",
};

const AUDIO_OFFSET_LIMIT_SEC = 5;
const AUDIO_OFFSET_STEP_SEC = 0.05;
const AUDIO_OFFSET_QUICK_STEP_SEC = 0.1;
const AUDIO_RANGE_EPSILON_SEC = 0.05;
const AUDIO_CLIP_RANGE_TOLERANCE_SEC = 0.5;
const LOOP_GAP_MAX_SEC = 30;
const LOOP_GAP_STEP_SEC = 0.5;
const PRESENTATION_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5];
const LOCAL_MAX_IMPORT_FILES = 6000;
const LOCAL_MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;

let playToken = 0;

const state = {
  lesson: null,
  dataSourceMode: "server",
  lessons: [],
  currentLessonKey: null,
  localLessonRootName: "",
  localLessonFiles: new Map(),
  localAudioUrls: new Map(),
  localSentenceAudioCache: new Map(),
  localLessonStatusKind: "idle",
  localLessonStatusText: "",
  displayTable: {},
  displayExceptions: {},
  transcript: null,
  transcriptOriginal: "",
  transcriptDirty: false,
  activeGoldInput: null,
  rebuildCommand: "",
  rebuildCommandStatusKind: "idle",
  rebuildCommandStatusText: "",
  profileConfig: null,
  activeProfileId: null,
  sentenceIndex: 0,
  audioSentenceId: null,
  audioBaseStartSec: null,
  audioBaseEndSec: null,
  audioRangeStartSec: null,
  audioRangeEndSec: null,
  audioStartOffsetSec: 0,
  audioEndOffsetSec: 0,
  audioUseClipRangeHint: false,
  internalSeekActive: false,
  internalSeekGen: 0,
  seekSafetyTimerId: null,
  loopRestartTimerId: null,
  loopGapSec: 0,
  loopCountTotal: null,
  loopRestartCount: 0,
  loopRestartFromTimer: false,
  sentenceAudioOffsets: {},
  loopSentence: false,
  displaySystem: "zhuyin_plus",
  uiLanguage: "zh-TW",
  showDetails: false,
  viewMode: "compact",
  compactDirty: false,
  compactNoticeKind: "idle",
  compactNoticeErrorMessage: "",
  dirty: false,
  serverDirty: false,
  transcriptSavedInfo: null,
  transcriptErrorMessage: null,
  presentationPlayAllActive: false,
  presentationPlayAllPendingAutoplay: false,
  presentationPlayAllIgnoreNextPause: false,
  presentationPlayAllAdvancing: false,
  presentationPlayAllPauseGuardTimerId: null,
  presentationPlayAllGapTimerId: null,
  presentationPlayAllLastEndedAtMs: 0,
  presentationPlaybackRate: 1,
  presentationShowPhonemes: true,
  offlineZipDownloading: false,
  appScreen: "entry",
  remoteCatalog: null,
  remoteLessonBaseUrl: "",
  remoteLessonStatusKind: "idle",
  remoteLessonStatusText: "",
  remoteSavedToLocalStorage: false,
};

const el = {
  appTitle: document.getElementById("appTitle"),
  lessonMeta: document.getElementById("lessonMeta"),
  languageLabel: document.getElementById("languageLabel"),
  languageSelect: document.getElementById("languageSelect"),
  lessonSelectLabel: document.getElementById("lessonSelectLabel"),
  lessonSelect: document.getElementById("lessonSelect"),
  remoteLessonGroup: document.getElementById("remoteLessonGroup"),
  remoteLessonLabel: document.getElementById("remoteLessonLabel"),
  remoteCatalogSelect: document.getElementById("remoteCatalogSelect"),
  loadRemoteLessonBtn: document.getElementById("loadRemoteLessonBtn"),
  remoteLessonStatus: document.getElementById("remoteLessonStatus"),
  clearRemoteEditsBtn: document.getElementById("clearRemoteEditsBtn"),
  localLessonGroup: document.getElementById("localLessonGroup"),
  localLessonLabel: document.getElementById("localLessonLabel"),
  localLessonDirInput: document.getElementById("localLessonDirInput"),
  localLessonHint: document.getElementById("localLessonHint"),
  localLessonStatus: document.getElementById("localLessonStatus"),
  sentenceLabel: document.getElementById("sentenceLabel"),
  sentenceSelect: document.getElementById("sentenceSelect"),
  prevSentenceBtn: document.getElementById("prevSentenceBtn"),
  nextSentenceBtn: document.getElementById("nextSentenceBtn"),
  compactPrevSentenceBtn: document.getElementById("compactPrevSentenceBtn"),
  compactNextSentenceBtn: document.getElementById("compactNextSentenceBtn"),
  displaySystemLabel: document.getElementById("displaySystemLabel"),
  displaySystemSelect: document.getElementById("displaySystemSelect"),
  keyboardLabel: document.getElementById("keyboardLabel"),
  phonemeKeyboard: document.getElementById("phonemeKeyboard"),
  keyboardHelp: document.getElementById("keyboardHelp"),
  phoneticProfileLabel: document.getElementById("phoneticProfileLabel"),
  phoneticProfileSelect: document.getElementById("phoneticProfileSelect"),
  applyProfileSentenceBtn: document.getElementById("applyProfileSentenceBtn"),
  profileHelp: document.getElementById("profileHelp"),
  phoneticProfileGroup: document.getElementById("phoneticProfileGroup"),
  showDetailsGroup: document.getElementById("showDetailsGroup"),
  showDetailsLabel: document.getElementById("showDetailsLabel"),
  showDetailsCheckbox: document.getElementById("showDetailsCheckbox"),
  showDetailsText: document.getElementById("showDetailsText"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  saveGoldGroup: document.getElementById("saveGoldGroup"),
  transcriptGroup: document.getElementById("transcriptGroup"),
  transcriptLabel: document.getElementById("transcriptLabel"),
  transcriptEditor: document.getElementById("transcriptEditor"),
  saveTranscriptBtn: document.getElementById("saveTranscriptBtn"),
  transcriptStatus: document.getElementById("transcriptStatus"),
  transcriptPath: document.getElementById("transcriptPath"),
  buildCommandBtn: document.getElementById("buildCommandBtn"),
  rebuildCommand: document.getElementById("rebuildCommand"),
  rebuildCommandStatus: document.getElementById("rebuildCommandStatus"),
  sentenceTitle: document.getElementById("sentenceTitle"),
  sentenceText: document.getElementById("sentenceText"),
  sentenceMeta: document.getElementById("sentenceMeta"),
  sentenceRange: document.getElementById("sentenceRange"),
  sentenceAlignment: document.getElementById("sentenceAlignment"),
  sentenceAudio: document.getElementById("sentenceAudio"),
  loopSentenceLabel: document.getElementById("loopSentenceLabel"),
  loopSentenceCheckbox: document.getElementById("loopSentenceCheckbox"),
  loopSentenceText: document.getElementById("loopSentenceText"),
  loopGapLabel: document.getElementById("loopGapLabel"),
  loopGapInput: document.getElementById("loopGapInput"),
  loopCountLabel: document.getElementById("loopCountLabel"),
  loopCountInput: document.getElementById("loopCountInput"),
  audioOffsetLabel: document.getElementById("audioOffsetLabel"),
  audioOffsetHelp: document.getElementById("audioOffsetHelp"),
  audioStartOffsetLabel: document.getElementById("audioStartOffsetLabel"),
  audioStartOffsetMinusBtn: document.getElementById("audioStartOffsetMinusBtn"),
  audioStartOffsetInput: document.getElementById("audioStartOffsetInput"),
  audioStartOffsetPlusBtn: document.getElementById("audioStartOffsetPlusBtn"),
  audioEndOffsetLabel: document.getElementById("audioEndOffsetLabel"),
  audioEndOffsetMinusBtn: document.getElementById("audioEndOffsetMinusBtn"),
  audioEndOffsetInput: document.getElementById("audioEndOffsetInput"),
  audioEndOffsetPlusBtn: document.getElementById("audioEndOffsetPlusBtn"),
  resetAudioOffsetsBtn: document.getElementById("resetAudioOffsetsBtn"),
  audioEffectiveRange: document.getElementById("audioEffectiveRange"),
  viewModeSection: document.getElementById("viewModeSection"),
  viewModeLabel: document.getElementById("viewModeLabel"),
  compactViewBtn: document.getElementById("compactViewBtn"),
  detailedViewBtn: document.getElementById("detailedViewBtn"),
  presentationViewBtn: document.getElementById("presentationViewBtn"),
  downloadLessonBtn: document.getElementById("downloadLessonBtn"),
  downloadOfflineZipBtn: document.getElementById("downloadOfflineZipBtn"),
  viewModeNotice: document.getElementById("viewModeNotice"),
  sentenceHeaderSection: document.getElementById("sentenceHeaderSection"),
  audioSection: document.getElementById("audioSection"),
  presentationSection: document.getElementById("presentationSection"),
  presentationSentenceText: document.getElementById("presentationSentenceText"),
  presentationPhonemeLine: document.getElementById("presentationPhonemeLine"),
  presentationPrevSentenceBtn: document.getElementById("presentationPrevSentenceBtn"),
  presentationPlayPauseBtn: document.getElementById("presentationPlayPauseBtn"),
  presentationPlayAllBtn: document.getElementById("presentationPlayAllBtn"),
  presentationNextSentenceBtn: document.getElementById("presentationNextSentenceBtn"),
  presentationLoopToggleBtn: document.getElementById("presentationLoopToggleBtn"),
  presentationLoopGapInput: document.getElementById("presentationLoopGapInput"),
  presentationLoopCountInput: document.getElementById("presentationLoopCountInput"),
  presentationDisplaySystemSelect: document.getElementById("presentationDisplaySystemSelect"),
  presentationSpeedSelect: document.getElementById("presentationSpeedSelect"),
  presentationPhonemeToggleBtn: document.getElementById("presentationPhonemeToggleBtn"),
  presentationReturnBtn: document.getElementById("presentationReturnBtn"),
  presentationStartMinusBtn: document.getElementById("presentationStartMinusBtn"),
  presentationStartPlusBtn: document.getElementById("presentationStartPlusBtn"),
  presentationEndMinusBtn: document.getElementById("presentationEndMinusBtn"),
  presentationEndPlusBtn: document.getElementById("presentationEndPlusBtn"),
  presentationTranscript: document.getElementById("presentationTranscript"),
  wordTableSection: document.getElementById("wordTableSection"),
  wordCompactSection: document.getElementById("wordCompactSection"),
  compactWordGrid: document.getElementById("compactWordGrid"),
  changeLessonGroup: document.getElementById("changeLessonGroup"),
  changeLessonBtn: document.getElementById("changeLessonBtn"),
  entrySection: document.getElementById("entrySection"),
  entryHeading: document.getElementById("entryHeading"),
  entryRemoteGroup: document.getElementById("entryRemoteGroup"),
  entryRemoteLabel: document.getElementById("entryRemoteLabel"),
  entryCatalogSelect: document.getElementById("entryCatalogSelect"),
  entryLoadRemoteBtn: document.getElementById("entryLoadRemoteBtn"),
  entryRemoteStatus: document.getElementById("entryRemoteStatus"),
  entryLocalLabel: document.getElementById("entryLocalLabel"),
  entryLocalDirInput: document.getElementById("entryLocalDirInput"),
  entryLocalStatus: document.getElementById("entryLocalStatus"),
  entryOrDivider: document.getElementById("entryOrDivider"),
  presentationLessonMeta: document.getElementById("presentationLessonMeta"),
  wordHeader: document.getElementById("wordHeader"),
  canonicalHeader: document.getElementById("canonicalHeader"),
  candidatesHeader: document.getElementById("candidatesHeader"),
  phoneticHeader: document.getElementById("phoneticHeader"),
  observedHeader: document.getElementById("observedHeader"),
  goldHeader: document.getElementById("goldHeader"),
  notesHeader: document.getElementById("notesHeader"),
  wordTableBody: document.getElementById("wordTableBody"),
  wordRowTemplate: document.getElementById("wordRowTemplate"),
  compactWordTemplate: document.getElementById("compactWordTemplate"),
};

function t(key, ...args) {
  const lang = I18N[state.uiLanguage] ? state.uiLanguage : "zh-TW";
  const value = I18N[lang][key];
  if (typeof value === "function") {
    return value(...args);
  }
  if (typeof value === "string") {
    return value;
  }
  const fallback = I18N["zh-TW"][key];
  if (typeof fallback === "function") {
    return fallback(...args);
  }
  return typeof fallback === "string" ? fallback : key;
}

function localizeRule(ruleId) {
  const item = RULE_LABELS[ruleId];
  if (!item) {
    return ruleId;
  }
  return item[state.uiLanguage] || item["zh-TW"] || ruleId;
}

function localizeFeature(featureId) {
  const item = FEATURE_LABELS[featureId];
  if (!item) {
    return featureId;
  }
  return item[state.uiLanguage] || item["zh-TW"] || featureId;
}

function localizeTag(tagId) {
  const item = TAG_LABELS[tagId];
  if (!item) {
    return tagId;
  }
  return item[state.uiLanguage] || item["zh-TW"] || tagId;
}

function updatePresentationScrollState() {
  if (!el.presentationPhonemeLine) {
    return;
  }
  const row = el.presentationPhonemeLine.querySelector(".presentation-phoneme-row");
  if (!row) {
    el.presentationPhonemeLine.classList.remove("scrollable");
    return;
  }
  const hasOverflow = row.scrollWidth > row.clientWidth + 1;
  el.presentationPhonemeLine.classList.toggle("scrollable", hasOverflow);
}

function isTextEntryTarget(node) {
  if (!node || !(node instanceof Element)) {
    return false;
  }
  if (node.closest("input, textarea, select")) {
    return true;
  }
  const editableHost = node.closest("[contenteditable='true']");
  return !!editableHost;
}

function handleGlobalPresentationHotkeys(event) {
  if (!(event instanceof KeyboardEvent)) {
    return;
  }
  if (state.viewMode !== "presentation") {
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (event.repeat) {
    return;
  }
  if (isTextEntryTarget(event.target)) {
    return;
  }

  const key = String(event.key || "");
  const code = String(event.code || "");
  if (key === " " || key === "Space" || key === "Spacebar") {
    event.preventDefault();
    toggleSentencePlayback();
    return;
  }
  if (key.toLowerCase() === "p") {
    event.preventDefault();
    applyPresentationPhonemeVisibility(!state.presentationShowPhonemes, true);
    return;
  }
  if (key === "]" || key === "}" || code === "BracketRight") {
    event.preventDefault();
    adjustPresentationPlaybackRate(1);
    return;
  }
  if (key === "[" || key === "{" || code === "BracketLeft") {
    event.preventDefault();
    adjustPresentationPlaybackRate(-1);
    return;
  }
  if (key === "ArrowRight") {
    event.preventDefault();
    const keepPlayAll = state.presentationPlayAllActive;
    jumpToSentence(1, { preservePlayAll: keepPlayAll, autoplayAfterJump: keepPlayAll });
    return;
  }
  if (key === "ArrowLeft") {
    event.preventDefault();
    const keepPlayAll = state.presentationPlayAllActive;
    jumpToSentence(-1, { preservePlayAll: keepPlayAll, autoplayAfterJump: keepPlayAll });
  }
}

function buildLocalLessonStableKey(rootName, lessonPayload) {
  const safeLessonId = sanitizeFilePart(
    lessonPayload && lessonPayload.lesson_id ? lessonPayload.lesson_id : rootName,
    "local_lesson",
  );
  const sentences = Array.isArray(lessonPayload?.sentences) ? lessonPayload.sentences : [];
  const sentenceSignature = sentences
    .map((sentence, idx) => {
      const sentenceId = String(sentence?.sentence_id || "").trim();
      const stableSentenceId = sentenceId || `idx_${idx + 1}`;
      const start = Number(sentence?.start_sec);
      const end = Number(sentence?.end_sec);
      const startText = Number.isFinite(start) ? start.toFixed(3) : "na";
      const endText = Number.isFinite(end) ? end.toFixed(3) : "na";
      return `${stableSentenceId}@${startText}-${endText}`;
    })
    .join("|");
  const seed = `lesson=${safeLessonId};count=${sentences.length};sentences=${sentenceSignature}`;
  const digest = crc32OfBytes(UTF8_ENCODER.encode(seed)).toString(16).padStart(8, "0");
  return `local:${safeLessonId}_${digest}`;
}

function fmtTime(sec) {
  const s = Number(sec || 0);
  return `${s.toFixed(2)}s`;
}

function tokensToText(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return "";
  }
  return tokens.filter((token) => token).join(" ");
}

function normalizeStressLevel(raw) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed === 0 || parsed === 1 || parsed === 2) {
    return parsed;
  }
  return null;
}

function runKindLabel(runKind) {
  if (runKind === "test") {
    return t("runKindTest");
  }
  if (runKind === "production") {
    return t("runKindProduction");
  }
  if (runKind === "local") {
    return t("runKindLocal");
  }
  if (runKind === "remote") {
    return t("runKindRemote");
  }
  return t("runKindCustom");
}

function formatSentenceLabel(sentenceId) {
  if (!sentenceId) return "";
  const m = String(sentenceId).match(/^s(\d+)$/i);
  if (!m) return String(sentenceId);
  return state.uiLanguage === "en" ? `S${m[1]}` : `第${m[1]}句`;
}

function sentenceCountLabel(count) {
  if (typeof count !== "number" || Number.isNaN(count)) {
    return state.uiLanguage === "zh-TW" ? "- 句" : "- sentences";
  }
  return state.uiLanguage === "zh-TW" ? `${count} 句` : `${count} sentences`;
}

function lessonDisplayName(lessonInfo) {
  const preferred = lessonInfo && typeof lessonInfo === "object"
    ? lessonInfo.display_name || lessonInfo.youtube_title || lessonInfo.lesson_id
    : null;
  return String(preferred || "lesson");
}

function formatLessonOption(lessonInfo) {
  const runKind = runKindLabel(lessonInfo.run_kind);
  const lessonName = lessonDisplayName(lessonInfo);
  const runName = lessonInfo.run_name || "run";
  const countText = sentenceCountLabel(Number(lessonInfo.sentence_count));
  return `${runKind} | ${lessonName} | ${runName} | ${countText}`;
}

function getCurrentLessonInfo() {
  if (!Array.isArray(state.lessons) || !state.currentLessonKey) {
    return null;
  }
  return state.lessons.find((item) => item.key === state.currentLessonKey) || null;
}

function renderLessonOptions() {
  el.lessonSelect.innerHTML = "";

  if (!Array.isArray(state.lessons) || state.lessons.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noLessonAvailable");
    el.lessonSelect.appendChild(option);
    el.lessonSelect.disabled = true;
    return;
  }

  state.lessons.forEach((lessonInfo) => {
    const option = document.createElement("option");
    option.value = lessonInfo.key;
    option.textContent = formatLessonOption(lessonInfo);
    el.lessonSelect.appendChild(option);
  });

  if (!state.currentLessonKey) {
    state.currentLessonKey = state.lessons[0].key;
  }
  el.lessonSelect.disabled = false;
  el.lessonSelect.value = state.currentLessonKey;
}

function applyLanguageToStaticText() {
  el.appTitle.textContent = t("appTitle");
  el.languageLabel.textContent = t("languageLabel");
  el.lessonSelectLabel.textContent = t("lessonSelectLabel");
  if (el.localLessonLabel) {
    el.localLessonLabel.textContent = t("localLessonLabel");
  }
  if (el.localLessonHint) {
    el.localLessonHint.textContent = t("localLessonHint");
  }
  if (el.changeLessonBtn) el.changeLessonBtn.textContent = t("changeLessonBtn");
  if (el.entryHeading) el.entryHeading.textContent = t("entryHeading");
  if (el.entryRemoteLabel) el.entryRemoteLabel.textContent = t("remoteLessonLabel");
  if (el.entryLoadRemoteBtn) el.entryLoadRemoteBtn.textContent = t("entryLoadBtn");
  if (el.entryLocalLabel) el.entryLocalLabel.textContent = t("localLessonLabel");
  if (el.entryOrDivider) el.entryOrDivider.textContent = t("entryOrLabel");
  el.transcriptLabel.textContent = t("transcriptLabel");
  el.saveTranscriptBtn.textContent = t("saveTranscript");
  el.buildCommandBtn.textContent = t("buildCommand");
  el.sentenceLabel.textContent = t("sentenceLabel");
  el.prevSentenceBtn.textContent = t("prev");
  el.nextSentenceBtn.textContent = t("next");
  if (el.compactPrevSentenceBtn) {
    el.compactPrevSentenceBtn.textContent = t("prev");
  }
  if (el.compactNextSentenceBtn) {
    el.compactNextSentenceBtn.textContent = t("next");
  }
  el.displaySystemLabel.textContent = t("displaySystemLabel");
  el.loopSentenceText.textContent = t("loopSentence");
  el.loopGapLabel.textContent = t("loopGapLabel");
  el.loopCountLabel.textContent = t("loopCountLabel");
  el.audioOffsetLabel.textContent = t("audioOffsetLabel");
  el.audioOffsetHelp.textContent = t("audioOffsetHelp", AUDIO_OFFSET_LIMIT_SEC);
  el.audioStartOffsetLabel.textContent = t("audioStartOffset");
  el.audioEndOffsetLabel.textContent = t("audioEndOffset");
  el.audioStartOffsetMinusBtn.textContent = t("audioOffsetMinus", formatOffsetStepValue(AUDIO_OFFSET_QUICK_STEP_SEC));
  el.audioStartOffsetPlusBtn.textContent = t("audioOffsetPlus", formatOffsetStepValue(AUDIO_OFFSET_QUICK_STEP_SEC));
  el.audioEndOffsetMinusBtn.textContent = t("audioOffsetMinus", formatOffsetStepValue(AUDIO_OFFSET_QUICK_STEP_SEC));
  el.audioEndOffsetPlusBtn.textContent = t("audioOffsetPlus", formatOffsetStepValue(AUDIO_OFFSET_QUICK_STEP_SEC));
  el.resetAudioOffsetsBtn.textContent = t("audioOffsetReset");
  el.viewModeLabel.textContent = t("viewModeLabel");
  el.compactViewBtn.textContent = t("compactView");
  el.detailedViewBtn.textContent = t("detailedView");
  if (el.presentationViewBtn) {
    el.presentationViewBtn.textContent = t("presentationView");
  }
  el.downloadLessonBtn.textContent = t("downloadLessonJson");
  if (el.downloadOfflineZipBtn) {
    el.downloadOfflineZipBtn.textContent = t("downloadOfflineZip");
  }
  if (el.presentationReturnBtn) {
    el.presentationReturnBtn.setAttribute("aria-label", t("presentationReturn"));
    el.presentationReturnBtn.title = t("presentationReturn");
  }
  if (el.presentationDisplaySystemSelect) {
    const displayOptions = el.presentationDisplaySystemSelect.options;
    for (let i = 0; i < displayOptions.length; i += 1) {
      const option = displayOptions[i];
      const key = option.value;
      option.textContent = DISPLAY_LABEL[state.uiLanguage][key] || key;
    }
    el.presentationDisplaySystemSelect.setAttribute("aria-label", t("presentationDisplayHint"));
    el.presentationDisplaySystemSelect.title = t("presentationDisplayHint");
  }
  if (el.presentationLoopGapInput) {
    el.presentationLoopGapInput.setAttribute("aria-label", t("presentationGapHint"));
    el.presentationLoopGapInput.title = t("presentationGapHint");
  }
  if (el.presentationLoopCountInput) {
    el.presentationLoopCountInput.setAttribute("aria-label", t("presentationCountHint"));
    el.presentationLoopCountInput.title = t("presentationCountHint");
  }
  if (el.presentationSpeedSelect) {
    updatePresentationSpeedLabel();
  }
  if (el.presentationPrevSentenceBtn) {
    el.presentationPrevSentenceBtn.setAttribute("aria-label", t("presentationPrevHint"));
    el.presentationPrevSentenceBtn.title = t("presentationPrevHint");
  }
  if (el.presentationNextSentenceBtn) {
    el.presentationNextSentenceBtn.setAttribute("aria-label", t("presentationNextHint"));
    el.presentationNextSentenceBtn.title = t("presentationNextHint");
  }
  if (el.presentationPlayAllBtn) {
    el.presentationPlayAllBtn.title = state.presentationPlayAllActive
      ? t("presentationStopAllHint")
      : t("presentationPlayAllHint");
  }
  el.keyboardLabel.textContent = t("keyboardLabel");
  el.keyboardHelp.textContent = t("keyboardHelp");
  el.phoneticProfileLabel.textContent = t("phoneticProfileLabel");
  el.applyProfileSentenceBtn.textContent = t("applyProfileSentence");
  el.showDetailsText.textContent = t("showDetails");
  el.saveBtn.textContent = t("saveGoldEdits");
  el.sentenceTitle.textContent = t("sentenceTitle");
  el.wordHeader.textContent = t("wordHeader");
  el.goldHeader.textContent = t("goldHeader");
  el.notesHeader.textContent = t("notesHeader");

  document.querySelectorAll(".gold-quick-fill-label").forEach((label) => {
    label.textContent = t("quickFillLabel");
  });

  document.querySelectorAll(".gold-quick-fill-select").forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    const first = select.options[0];
    if (first && first.value === "") {
      first.textContent = t("quickFillPlaceholder");
    }
  });

  const displayOptions = el.displaySystemSelect.options;
  for (let i = 0; i < displayOptions.length; i += 1) {
    const option = displayOptions[i];
    const key = option.value;
    option.textContent = DISPLAY_LABEL[state.uiLanguage][key] || key;
  }

  updatePresentationPlayPauseButton();
  updatePresentationLoopToggleButton();
  updatePresentationPlayAllButton();
  updatePresentationSpeedLabel();
  updatePresentationPhonemeToggleButton();

  updateAudioEffectiveRangeText();
  renderLocalLessonStatus();
}

function resetRebuildCommandUI() {
  state.rebuildCommand = "";
  state.rebuildCommandStatusKind = "idle";
  state.rebuildCommandStatusText = t("rebuildCommandIdle");
  renderRebuildCommandUI();
}

function renderRebuildCommandUI() {
  el.rebuildCommand.value = state.rebuildCommand || "";
  el.rebuildCommandStatus.className = "";
  if (state.rebuildCommandStatusKind === "saved") {
    el.rebuildCommandStatus.className = "status-saved";
  } else if (state.rebuildCommandStatusKind === "error") {
    el.rebuildCommandStatus.className = "status-error";
  }
  el.rebuildCommandStatus.textContent = state.rebuildCommandStatusText || t("rebuildCommandIdle");
}

async function generateRebuildCommand() {
  if (isLocalMode()) {
    state.rebuildCommand = "";
    state.rebuildCommandStatusKind = "error";
    state.rebuildCommandStatusText = t("rebuildCommandLocalUnavailable");
    renderRebuildCommandUI();
    return;
  }
  if (state.transcriptDirty) {
    state.rebuildCommand = "";
    state.rebuildCommandStatusKind = "error";
    state.rebuildCommandStatusText = t("rebuildCommandNeedSaveTranscript");
    renderRebuildCommandUI();
    return;
  }

  el.buildCommandBtn.disabled = true;
  state.rebuildCommandStatusKind = "idle";
  state.rebuildCommandStatusText = t("rebuildCommandLoading");
  renderRebuildCommandUI();
  try {
    const resp = await fetch("/api/rebuild_command");
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `status=${resp.status}`);
    }
    state.rebuildCommand = String(data.command || "");
    state.rebuildCommandStatusKind = "saved";
    state.rebuildCommandStatusText = t("rebuildCommandReady", data.next_output_dir || "");
    renderRebuildCommandUI();
  } catch (err) {
    state.rebuildCommand = "";
    state.rebuildCommandStatusKind = "error";
    state.rebuildCommandStatusText = t("rebuildCommandFailed", String(err.message || err));
    renderRebuildCommandUI();
  } finally {
    el.buildCommandBtn.disabled = false;
  }
}

function applyLanguage() {
  applyLanguageToStaticText();
  renderLessonOptions();
  renderTranscriptPanel();
  renderRebuildCommandUI();
  renderProfileOptions();
  updateDisplayHeaders();
  applyViewMode();
  renderKeyboard();

  const sentenceCount = state.lesson && Array.isArray(state.lesson.sentences) ? state.lesson.sentences.length : 0;
  const lessonId = state.lesson && state.lesson.lesson_id ? state.lesson.lesson_id : "lesson";
  const lessonInfo = getCurrentLessonInfo();
  if (lessonInfo) {
    const runKind = runKindLabel(lessonInfo.run_kind);
    const lessonName = lessonDisplayName(lessonInfo);
    const runName = lessonInfo.run_name || "run";
    el.lessonMeta.textContent = `${runKind} | ${lessonName} | ${runName} | ${sentenceCountLabel(sentenceCount)}`;
  } else {
    el.lessonMeta.textContent = `${lessonId} | ${sentenceCountLabel(sentenceCount)}`;
  }

  renderSaveStatus();
  updateClearRemoteEditsBtn();
  renderCompactNotice();
  updatePresentationPlayPauseButton();
  updatePresentationLoopToggleButton();
  updatePresentationPhonemeToggleButton();
  updatePresentationSpeedLabel();

  renderSentence();
}

function resetLessonStateForImport() {
  state.sentenceIndex = 0;
  clearAudioRange();
state.compactDirty = false;
  state.compactNoticeKind = "idle";
  state.compactNoticeErrorMessage = "";
  state.serverDirty = false;
  markDirty(false);
}

async function init() {
  loadPreferences();
  initializeControlsFromState();
  bindEvents();
  loadRemoteCatalog().catch(() => {});

  try {
    await loadData();
    state.appScreen = "editor";
    applyAppScreen();
  } catch (err) {
    if (state.dataSourceMode === "local") {
      el.lessonMeta.textContent = t("localLessonAwaitImport");
      el.saveStatus.textContent = t("localLessonAwaitImport");
      el.saveStatus.className = "";
    } else {
      el.lessonMeta.textContent = `${t("loadingLesson")} (error)`;
      setErrorStatus(String(err.message || err));
    }
  }
}

init();

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
const AUDIO_OFFSET_QUICK_STEP_SEC = 0.5;
const AUDIO_RANGE_EPSILON_SEC = 0.05;
const AUDIO_CLIP_RANGE_TOLERANCE_SEC = 0.5;
const LOOP_GAP_MAX_SEC = 30;
const LOOP_GAP_STEP_SEC = 0.5;
const PRESENTATION_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5];
const LOCAL_MAX_IMPORT_FILES = 6000;
const LOCAL_MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let idx = 0; idx < 256; idx += 1) {
    let value = idx;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[idx] = value >>> 0;
  }
  return table;
})();

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

const DISPLAY_LABEL = {
  "zh-TW": {
    ipa: "IPA",
    kk: "KK",
    zhuyin_plus: "專利注音",
  },
  en: {
    ipa: "IPA",
    kk: "KK",
    zhuyin_plus: "Improved Zhuyin",
  },
};

const DEFAULT_DISPLAY_TABLE = {
  "p": { ipa: "p", symbol_id: "001", kk: "p", zhuyin_plus: "ㄆ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄆ\"" },
  "b": { ipa: "b", symbol_id: "002", kk: "b", zhuyin_plus: "ㄅ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄅ\"" },
  "t": { ipa: "t", symbol_id: "003", kk: "t", zhuyin_plus: "ㄊ(摩)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄊ\"" },
  "d": { ipa: "d", symbol_id: "004", kk: "d", zhuyin_plus: "ㄉ(摩)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄉ\"" },
  "k": { ipa: "k", symbol_id: "005", kk: "k", zhuyin_plus: "ㄎ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄎ\"" },
  "ɡ": { ipa: "ɡ", symbol_id: "006", kk: "ɡ", zhuyin_plus: "ㄍ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄍ\"" },
  "f": { ipa: "f", symbol_id: "007", kk: "f", zhuyin_plus: "ㄈ(f)", zhuyin_plus_C1: "ㄈ", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄈ(f)" },
  "v": { ipa: "v", symbol_id: "008", kk: "v", zhuyin_plus: "ㄈ(v)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "θ": { ipa: "θ", symbol_id: "009", kk: "θ", zhuyin_plus: "ㄙ(θ)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ð": { ipa: "ð", symbol_id: "010", kk: "ð", zhuyin_plus: "Z(θ)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "s": { ipa: "s", symbol_id: "011", kk: "s", zhuyin_plus: "ㄙ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "z": { ipa: "z", symbol_id: "012", kk: "z", zhuyin_plus: "z", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ʃ": { ipa: "ʃ", symbol_id: "013", kk: "ʃ", zhuyin_plus: "*ㄒ*", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄒㄩ" },
  "ʒ": { ipa: "ʒ", symbol_id: "014", kk: "ʒ", zhuyin_plus: "ʒ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "h": { ipa: "h", symbol_id: "015", kk: "h", zhuyin_plus: "ㄏ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "tʃ": { ipa: "tʃ", symbol_id: "016", kk: "tʃ", zhuyin_plus: "*ㄑ*", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄑㄩ" },
  "dʒ": { ipa: "dʒ", symbol_id: "017", kk: "dʒ", zhuyin_plus: "*ㄐ*", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄐㄩ" },
  "m": { ipa: "m", symbol_id: "018", kk: "m", zhuyin_plus: "ㄇ", zhuyin_plus_C1: "ㄇ", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄇ~" },
  "n": { ipa: "n", symbol_id: "019", kk: "n", zhuyin_plus: "ㄋ", zhuyin_plus_C1: "ㄋ", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄋ~" },
  "ŋ": { ipa: "ŋ", symbol_id: "020", kk: "ŋ", zhuyin_plus: "ㄥ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "l": { ipa: "l", symbol_id: "021", kk: "l", zhuyin_plus: "ㄌ(黏)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɹ": { ipa: "ɹ", symbol_id: "022", kk: "ɹ", zhuyin_plus: "ㄖㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "r": { ipa: "r", symbol_id: "023", kk: "r", zhuyin_plus: "ㄖㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "j": { ipa: "j", symbol_id: "024", kk: "j", zhuyin_plus: "ㄧ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "w": { ipa: "w", symbol_id: "025", kk: "w", zhuyin_plus: "ㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɾ": { ipa: "ɾ", symbol_id: "026", kk: "ɾ", zhuyin_plus: "ㄌ(彈)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ʔ": { ipa: "ʔ", symbol_id: "027", kk: "ʔ", zhuyin_plus: "ʔ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "i": { ipa: "i", symbol_id: "028", kk: "i", zhuyin_plus: "ㄧ(微)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "iː": { ipa: "iː", symbol_id: "029", kk: "iː", zhuyin_plus: "ㄧ(微)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɪ": { ipa: "ɪ", symbol_id: "030", kk: "ɪ", zhuyin_plus: "ㄧㄜ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "eɪ": { ipa: "eɪ", symbol_id: "031", kk: "eɪ", zhuyin_plus: "ㄝㄧ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɛ": { ipa: "ɛ", symbol_id: "032", kk: "ɛ", zhuyin_plus: "ㄝ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "æ": { ipa: "æ", symbol_id: "033", kk: "æ", zhuyin_plus: "ㄝㄚ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɑ": { ipa: "ɑ", symbol_id: "034", kk: "ɑ", zhuyin_plus: "ㄚ(喉)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɑː": { ipa: "ɑː", symbol_id: "035", kk: "ɑː", zhuyin_plus: "ㄚ(喉)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɔ": { ipa: "ɔ", symbol_id: "036", kk: "ɔ", zhuyin_plus: "ㄚ(喉)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɔː": { ipa: "ɔː", symbol_id: "037", kk: "ɔː", zhuyin_plus: "ㄚ(喉)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ʊ": { ipa: "ʊ", symbol_id: "038", kk: "ʊ", zhuyin_plus: "ㄨㄜ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "u": { ipa: "u", symbol_id: "039", kk: "u", zhuyin_plus: "ㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "uː": { ipa: "uː", symbol_id: "040", kk: "uː", zhuyin_plus: "ㄨ(丹)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ʌ": { ipa: "ʌ", symbol_id: "041", kk: "ʌ", zhuyin_plus: "ㄜ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ə": { ipa: "ə", symbol_id: "042", kk: "ə", zhuyin_plus: "ㄜ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɚ": { ipa: "ɚ", symbol_id: "043", kk: "ɚ", zhuyin_plus: "ㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɝ": { ipa: "ɝ", symbol_id: "044", kk: "ɝ", zhuyin_plus: "ㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɜː": { ipa: "ɜː", symbol_id: "045", kk: "ɜː", zhuyin_plus: "ㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "oʊ": { ipa: "oʊ", symbol_id: "046", kk: "oʊ", zhuyin_plus: "ㄜㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "aɪ": { ipa: "aɪ", symbol_id: "047", kk: "aɪ", zhuyin_plus: "ㄞ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "aʊ": { ipa: "aʊ", symbol_id: "048", kk: "aʊ", zhuyin_plus: "ㄝㄠ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɔɪ": { ipa: "ɔɪ", symbol_id: "049", kk: "ɔɪ", zhuyin_plus: "ㄛㄧ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɐ": { ipa: "ɐ", symbol_id: "050", kk: "ɐ", zhuyin_plus: "ㄜ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ᵻ": { ipa: "ᵻ", symbol_id: "051", kk: "ᵻ", zhuyin_plus: "ㄧ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ʉ": { ipa: "ʉ", symbol_id: "052", kk: "ʉ", zhuyin_plus: "ㄧㄨ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɑːɹ": { ipa: "ɑːɹ", symbol_id: "053", kk: "ɑːɹ", zhuyin_plus: "ㄚㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɔːɹ": { ipa: "ɔːɹ", symbol_id: "054", kk: "ɔːɹ", zhuyin_plus: "ㄛㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɪɹ": { ipa: "ɪɹ", symbol_id: "055", kk: "ɪɹ", zhuyin_plus: "ㄧㄦ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "əl": { ipa: "əl", symbol_id: "056", kk: "əl", zhuyin_plus: "ㄛ", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "a": { ipa: "a", symbol_id: "057", kk: "a", zhuyin_plus: "ㄚ(喉)", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "" },
  "ɲ": { ipa: "ɲ", symbol_id: "058", kk: "ɲ", zhuyin_plus: "ㄋ~", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄋ~" },
  "p̚": { ipa: "p̚", symbol_id: "059", kk: "p̚", zhuyin_plus: "ㄆ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄆ\"" },
  "t̚": { ipa: "t̚", symbol_id: "060", kk: "t̚", zhuyin_plus: "ㄊ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄊ\"" },
  "k̚": { ipa: "k̚", symbol_id: "061", kk: "k̚", zhuyin_plus: "ㄎ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄎ\"" },
  "b̚": { ipa: "b̚", symbol_id: "062", kk: "b̚", zhuyin_plus: "ㄅ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄅ\"" },
  "d̚": { ipa: "d̚", symbol_id: "063", kk: "d̚", zhuyin_plus: "ㄉ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄉ\"" },
  "ɡ̚": { ipa: "ɡ̚", symbol_id: "064", kk: "ɡ̚", zhuyin_plus: "ㄍ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄍ\"" },
  "b̥̚": { ipa: "b̥̚", symbol_id: "065", kk: "b̥̚", zhuyin_plus: "ㄅ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄅ\"" },
  "d̥̚": { ipa: "d̥̚", symbol_id: "066", kk: "d̥̚", zhuyin_plus: "ㄉ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄉ\"" },
  "ɡ̊̚": { ipa: "ɡ̊̚", symbol_id: "067", kk: "ɡ̊̚", zhuyin_plus: "ㄍ\"", zhuyin_plus_C1: "", zhuyin_plus_V: "", zhuyin_plus_C2: "ㄍ\"" },
};

const DEFAULT_DISPLAY_EXCEPTIONS_PAYLOAD = {
  version: "1.0",
  description: "Word+IPA specific overrides for improved zhuyin display.",
  word_ipa_overrides: [
    {
      word_norm: "he'll",
      ipa: ["h", "i", "l"],
      zhuyin_plus: ["ㄏ", "ㄧ(微)", "ㄛ"],
    },
    {
      word_norm: "hell",
      ipa: ["h", "ɛ", "l"],
      zhuyin_plus: ["ㄏ", "ㄝ", "ㄛ"],
    },
    {
      word_norm: "ear",
      ipa: ["i", "ɹ"],
      zhuyin_plus: ["ㄧㄦ", ""],
    },
  ],
};

const RULE_LABELS = {
  s_cluster_stop_voicing_hint: {
    "zh-TW": "s+清塞音教學近似濁化",
    en: "s-cluster stop voiced-like hint",
  },
  final_stop_unreleased: { "zh-TW": "尾塞音不爆破", en: "final stop unreleased" },
  final_voiced_stop_devoiced_unreleased: {
    "zh-TW": "尾濁塞音清化且不爆破",
    en: "final voiced stop devoiced unreleased",
  },
  final_t_glottalization: { "zh-TW": "尾 t 喉塞化", en: "final t glottalization" },
  base_surface: { "zh-TW": "基礎表層音", en: "base surface" },
};

const FEATURE_LABELS = {
  coda_stop: { "zh-TW": "尾塞音", en: "coda stop" },
  coda_nasal: { "zh-TW": "尾鼻音", en: "coda nasal" },
  coda_unreleased: { "zh-TW": "尾音不爆破", en: "coda unreleased" },
  unreleased: { "zh-TW": "不爆破", en: "unreleased" },
  devoiced: { "zh-TW": "清化", en: "devoiced" },
  glottal_stop: { "zh-TW": "喉塞音", en: "glottal stop" },
  position_onset: { "zh-TW": "字首/音節首", en: "onset" },
  position_nucleus: { "zh-TW": "母音核心", en: "nucleus" },
  position_intervocalic: { "zh-TW": "母音間", en: "intervocalic" },
  position_coda: { "zh-TW": "尾音", en: "coda" },
  syllable_C1: { "zh-TW": "音節頭 C1", en: "syllable onset C1" },
  syllable_V: { "zh-TW": "音節核 V", en: "syllable nucleus V" },
  syllable_C2: { "zh-TW": "音節尾 C2", en: "syllable coda C2" },
};

const TAG_LABELS = {
  profile_recommended: { "zh-TW": "此風格推薦", en: "profile recommended" },
  saved_default: { "zh-TW": "目前預設", en: "saved default" },
};

const I18N = {
  "zh-TW": {
    appTitle: "跟讀小助手",
    loadingLesson: "載入課程中...",
    languageLabel: "介面語言",
    lessonSelectLabel: "課程",
    localLessonLabel: "本機課程（離線）",
    localLessonHint: "選取包含 lesson.json 與 sentences/ 的資料夾。",
    localLessonIdle: "可在此載入本機 lesson 資料夾，不需帳號或上傳。",
    localLessonAwaitImport: "請先載入本機 lesson 資料夾。",
    localLessonLoaded: (name, count) => `已載入本機課程：${name}（${count} 句）`,
    localLessonLoadFailed: (msg) => `本機課程載入失敗：${msg}`,
    localLessonNoFiles: "未選取任何檔案。",
    localLessonNoLessonJson: "找不到 lesson.json，請選取單一 run 資料夾。",
    localLessonMultipleLessonJson: "找到多個 lesson.json，請只選取單一 run 資料夾。",
    localLessonTooManyFiles: (n) => `檔案數過多（>${n}），請縮小資料夾範圍。`,
    localLessonTooLarge: (gb) => `資料夾總大小超過 ${gb} GB，請縮小資料夾範圍。`,
    localLessonServerUnavailable: (msg) => `伺服器模式不可用（${msg}），可改用本機課程載入。`,
    sentenceLabel: "句子",
    prev: "上一句",
    next: "下一句",
    displaySystemLabel: "顯示系統",
    loopSentence: "句子自動循環播放",
    loopGapLabel: "循環間隔（秒）",
    loopCountLabel: "循環次數（總播放，留白=無限）",
    audioOffsetLabel: "句子播放區間微調",
    audioOffsetHelp: (limit) => `每句可調整起訖偏移（秒），範圍 ±${limit} 秒。`,
    audioStartOffset: "起點偏移",
    audioEndOffset: "終點偏移",
    audioOffsetMinus: (step) => `-${step} 秒`,
    audioOffsetPlus: (step) => `+${step} 秒`,
    audioOffsetReset: "重設偏移",
    audioEffectiveRange: (start, end) => `實際播放範圍：${start} - ${end}`,
    viewModeLabel: "句子顯示模式",
    compactView: "精簡",
    detailedView: "詳細",
    presentationView: "展示",
    presentationReturn: "返回精簡",
    presentationPlay: "播放",
    presentationPause: "暫停",
    presentationPlayAll: "播放全部",
    presentationStopAll: "停止全部",
    presentationPlayAllHint: "連續播放全部句子",
    presentationStopAllHint: "停止連續播放",
    presentationPhonemeLabel: (label) => `音標（${label}）`,
    presentationDisplayHint: "顯示模式：切換音標系統",
    presentationLoopHintOn: "循環播放：開啟",
    presentationLoopHintOff: "循環播放：關閉",
    presentationGapHint: "播放間隔（秒）",
    presentationCountHint: "播放次數（留白=無限）",
    presentationSpeedHint: (rateText) => `播放速度：${rateText}（快捷鍵 [ / ]）`,
    presentationPhonemeToggleOn: "音標開",
    presentationPhonemeToggleOff: "音標關",
    presentationPhonemeToggleOnHint: "隱藏音標（快捷鍵 P）",
    presentationPhonemeToggleOffHint: "顯示音標（快捷鍵 P）",
    presentationPrevHint: "上一句",
    presentationNextHint: "下一句",
    downloadLessonJson: "下載 lesson JSON",
    downloadOfflineZip: "下載離線包（ZIP）",
    compactNoticeIdle: "精簡版可編輯顯示內容；請下載課程檔保存，未下載前關閉頁面會遺失。",
    compactNoticeUnsaved: "精簡版修改尚未下載；請先下載課程檔，否則關閉頁面後會遺失。",
    compactNoticeDownloaded: "精簡版修改已下載。",
    compactSavedInBrowser: "精簡版修改僅保存在瀏覽器，目前不會寫回伺服器 lesson。",
    compactDownloadFailed: (msg) => `下載失敗：${msg}`,
    compactSwitchLessonConfirm: "精簡版修改尚未下載，切換課程會遺失。確定切換？",
    keyboardLabel: "音標小鍵盤",
    keyboardHelp: "點選符號插入目前 Gold 欄位。",
    keyboardNoFocus: "請先點選一個 Gold 欄位。",
    phoneticProfileLabel: "發音細節風格",
    applyProfileSentence: "套用風格到本句",
    transcriptLabel: "文字稿（每行一句）",
    saveTranscript: "儲存文字稿",
    buildCommand: "產生重建指令",
    rebuildCommandIdle: "重建指令尚未產生。",
    rebuildCommandLoading: "重建指令產生中...",
    rebuildCommandReady: (outDir) => `重建指令已產生，將輸出到：${outDir}`,
    rebuildCommandFailed: (msg) => `重建指令產生失敗：${msg}`,
    rebuildCommandNeedSaveTranscript: "請先儲存文字稿，再產生重建指令。",
    rebuildCommandLocalUnavailable: "本機模式不提供重建指令。",
    transcriptLoading: "文字稿載入中...",
    transcriptUnavailable: "文字稿不可用。",
    transcriptReady: (n) => `文字稿已載入，共 ${n} 行。`,
    transcriptSaved: (path) => `文字稿已儲存：${path}`,
    transcriptSavedWithBackup: (path, backup) => `文字稿已儲存：${path}（備份：${backup}）`,
    transcriptNeedRebuild: "提示：文字稿已更新，但目前 lesson 尚未重建。",
    transcriptSaveFailed: (msg) => `文字稿儲存失敗：${msg}`,
    transcriptLocalUnavailable: "本機模式不提供文字稿寫回；請下載離線包保存編輯。",
    transcriptSourcePath: (path) => `來源：${path}`,
    transcriptSavePath: (path) => `儲存：${path}`,
    transcriptContentFromLesson: "目前內容來源：lesson 句子文字（首次建立）。",
    transcriptContentFromSource: "目前內容來源：原始/既有文字稿檔案。",
    transcriptUnsaved: "文字稿有未儲存變更。",
    switchLessonTranscriptConfirm: "文字稿有未儲存變更，切換課程會遺失。確定切換？",
    showDetails: "顯示詳細說明",
    nonIpaGoldEdited: "非 IPA 顯示模式的 Gold 修改僅保留於本機，可下載 lesson 保存。",
    nonIpaGoldSaveSkipped: "已儲存 IPA Gold；非 IPA 顯示模式修改僅保留在下載檔。",
    saveGoldEdits: "儲存 Gold 編輯",
    noUnsaved: "目前沒有未儲存變更。",
    quickFillLabel: "快速帶入",
    quickFillPlaceholder: "選擇帶入來源...",
    quickFillObserved: "辨識音標",
    quickFillTeaching: "教學候選",
    quickFillBestSurface: "最佳表層候選",
    quickFillCanonical: "Canonical",
    quickFillPhonetic: (n) => `發音細節候選 ${n}`,
    quickFillSurface: (n) => `表層候選 ${n}`,
    sentenceTitle: "句子",
    wordHeader: "單字",
    goldHeader: "Gold IPA（可編輯）",
    compactGoldHeader: (label) => `Gold（${label}，可編輯）`,
    notesHeader: "註記",
    noSentenceFilter: "目前篩選下沒有句子",
    noSentence: "沒有句子",
    noSentenceMessage: "目前篩選條件下沒有可顯示的句子。",
    rangeText: (start, end) => `範圍：${start} - ${end}`,
    alignmentText: (pct) => `對齊分數：${pct}%`,
    displayText: (label, text) => `${label}：${text}`,
    unsavedChanges: "有未儲存變更。",
    profileAppliedChanged: (n, sid) => `已套用風格：${sid} 更新 ${n} 個單字（尚未儲存）`,
    profileAppliedNoChange: (sid) => `已套用風格：${sid} 無需更新`,
    savedWithBackup: (backup) => `已儲存。備份：${backup}`,
    localSavedByDownload: "本機模式：請下載離線包保存編輯。",
    localSavedDownloaded: "本機模式：已下載 lesson JSON。",
    localSavedDownloadedZip: (n) => `本機模式：已下載離線包（含 ${n} 個音檔）。`,
    savedDownloadedZip: (n) => `已下載離線包（含 ${n} 個音檔）。`,
    savedDownloadedZipWithMissing: (n, missing) => `已下載離線包（含 ${n} 個音檔；${missing} 個音檔下載失敗）。`,
    saveFailed: (msg) => `儲存失敗：${msg}`,
    profileUnavailable: "風格設定檔不可用。",
    profileRules: "規則",
    profileFeatures: "特徵",
    profileSyllable: "音節槽位",
    profileSyllableCount: "音節數",
    profileCost: "成本",
    profileTags: "標籤",
    canonicalHeader: (label) => `Canonical（${label}）`,
    candidatesHeader: (label) => `表層音候選（${label}）`,
    phoneticHeader: (label) => `發音細節（${label}）`,
    observedHeader: (label) => `音訊辨識（${label}）`,
    profileHelpPrefix: "說明：",
    profileDefaultDesc: "使用風格設定來排序發音細節候選。",
    profileRecommendedTag: "此風格推薦",
    savedDefaultTag: "目前預設",
    noLessonAvailable: "沒有可用課程",
    switchLessonConfirm: "目前有未儲存變更，切換課程會遺失。確定切換？",
    runKindTest: "測試",
    runKindProduction: "正式",
    runKindLocal: "本機",
    runKindRemote: "線上",
    runKindCustom: "自訂",
    remoteLessonLabel: "線上課程",
    remoteLessonSelectPlaceholder: "請選擇課程…",
    remoteLessonLoaded: (name, count) => `已載入線上課程：${name}（${count} 句）`,
    remoteLessonLoadFailed: (msg) => `線上課程載入失敗：${msg}`,
    remoteLessonCatalogUnavailable: "無法取得線上課程目錄（離線或尚未上架）。",
    remoteSavedInBrowser: "已存到瀏覽器",
    savingToBrowser: "儲存中…",
    remoteSavedRestored: "（含本機編輯）",
    clearRemoteEdits: "清除本機編輯",
    entryHeading: "選擇課程",
    entryLoadBtn: "載入",
    entryOrLabel: "或",
    changeLessonBtn: "換課程",
  },
  en: {
    appTitle: "跟讀小助手",
    loadingLesson: "Loading lesson...",
    languageLabel: "UI Language",
    lessonSelectLabel: "Lesson",
    localLessonLabel: "Local Lesson (Offline)",
    localLessonHint: "Select a folder containing lesson.json and sentences/.",
    localLessonIdle: "Load a local lesson folder here. No account and no upload required.",
    localLessonAwaitImport: "Please load a local lesson folder first.",
    localLessonLoaded: (name, count) => `Local lesson loaded: ${name} (${count} sentences)`,
    localLessonLoadFailed: (msg) => `Failed to load local lesson: ${msg}`,
    localLessonNoFiles: "No files selected.",
    localLessonNoLessonJson: "lesson.json not found. Please select a single run folder.",
    localLessonMultipleLessonJson: "Multiple lesson.json files found. Please select a single run folder.",
    localLessonTooManyFiles: (n) => `Too many files (>${n}). Please select a smaller folder.`,
    localLessonTooLarge: (gb) => `Folder size exceeds ${gb} GB. Please select a smaller folder.`,
    localLessonServerUnavailable: (msg) => `Server mode unavailable (${msg}). You can load a local lesson folder instead.`,
    sentenceLabel: "Sentence",
    prev: "Prev",
    next: "Next",
    displaySystemLabel: "Display System",
    loopSentence: "Loop Current Sentence",
    loopGapLabel: "Loop Gap (sec)",
    loopCountLabel: "Loop Count (total plays, blank = infinite)",
    audioOffsetLabel: "Sentence Playback Range Offset",
    audioOffsetHelp: (limit) => `Adjust per-sentence start/end offsets (seconds), range ±${limit}s.`,
    audioStartOffset: "Start Offset",
    audioEndOffset: "End Offset",
    audioOffsetMinus: (step) => `-${step}s`,
    audioOffsetPlus: (step) => `+${step}s`,
    audioOffsetReset: "Reset Offsets",
    audioEffectiveRange: (start, end) => `Effective Playback Range: ${start} - ${end}`,
    viewModeLabel: "Sentence View Mode",
    compactView: "Compact",
    detailedView: "Detailed",
    presentationView: "Presentation",
    presentationReturn: "Back to Compact",
    presentationPlay: "Play",
    presentationPause: "Pause",
    presentationPlayAll: "Play All",
    presentationStopAll: "Stop All",
    presentationPlayAllHint: "Play all sentences in sequence",
    presentationStopAllHint: "Stop sequence playback",
    presentationPhonemeLabel: (label) => `Phonemes (${label})`,
    presentationDisplayHint: "Display system",
    presentationLoopHintOn: "Loop: on",
    presentationLoopHintOff: "Loop: off",
    presentationGapHint: "Gap seconds",
    presentationCountHint: "Play count (blank=infinite)",
    presentationSpeedHint: (rateText) => `Playback speed: ${rateText} (Shortcut: [ / ])`,
    presentationPhonemeToggleOn: "Phoneme On",
    presentationPhonemeToggleOff: "Phoneme Off",
    presentationPhonemeToggleOnHint: "Hide phonemes (Shortcut: P)",
    presentationPhonemeToggleOffHint: "Show phonemes (Shortcut: P)",
    presentationPrevHint: "Previous sentence",
    presentationNextHint: "Next sentence",
    downloadLessonJson: "Download lesson JSON",
    downloadOfflineZip: "Download Offline Package (ZIP)",
    compactNoticeIdle: "Compact edits are local-only. Download a lesson package to keep changes; closing the page will lose them.",
    compactNoticeUnsaved: "Compact edits are not downloaded yet. Download a lesson package before leaving this page.",
    compactNoticeDownloaded: "Compact edits downloaded.",
    compactSavedInBrowser: "Compact edits are local-only and are not saved to server lesson.",
    compactDownloadFailed: (msg) => `Download failed: ${msg}`,
    compactSwitchLessonConfirm: "Compact edits are not downloaded. Switching lessons will discard them. Continue?",
    keyboardLabel: "Phoneme Keyboard",
    keyboardHelp: "Click a symbol to insert into the active Gold field.",
    keyboardNoFocus: "Click a Gold field first.",
    phoneticProfileLabel: "Phonetic Profile",
    applyProfileSentence: "Apply Profile to Sentence",
    transcriptLabel: "Transcript (one sentence per line)",
    saveTranscript: "Save Transcript",
    buildCommand: "Generate Rebuild Command",
    rebuildCommandIdle: "Rebuild command is not generated yet.",
    rebuildCommandLoading: "Generating rebuild command...",
    rebuildCommandReady: (outDir) => `Rebuild command ready. Output will be: ${outDir}`,
    rebuildCommandFailed: (msg) => `Failed to generate rebuild command: ${msg}`,
    rebuildCommandNeedSaveTranscript: "Please save transcript edits before generating rebuild command.",
    rebuildCommandLocalUnavailable: "Local mode does not provide rebuild commands.",
    transcriptLoading: "Loading transcript...",
    transcriptUnavailable: "Transcript unavailable.",
    transcriptReady: (n) => `Transcript loaded, ${n} lines.`,
    transcriptSaved: (path) => `Transcript saved: ${path}`,
    transcriptSavedWithBackup: (path, backup) => `Transcript saved: ${path} (backup: ${backup})`,
    transcriptNeedRebuild: "Note: transcript is updated, but current lesson is not rebuilt yet.",
    transcriptSaveFailed: (msg) => `Transcript save failed: ${msg}`,
    transcriptLocalUnavailable: "Local mode cannot write transcript back. Download offline package to keep edits.",
    transcriptSourcePath: (path) => `Source: ${path}`,
    transcriptSavePath: (path) => `Save: ${path}`,
    transcriptContentFromLesson: "Current content source: lesson sentence text (first-time seed).",
    transcriptContentFromSource: "Current content source: original/existing transcript file.",
    transcriptUnsaved: "Transcript has unsaved changes.",
    switchLessonTranscriptConfirm: "Transcript has unsaved changes. Switching lessons will discard them. Continue?",
    showDetails: "Show Details",
    nonIpaGoldEdited: "Gold edits in non-IPA display are local-only and can be kept via lesson download.",
    nonIpaGoldSaveSkipped: "IPA Gold saved; non-IPA display edits are kept in downloadable lesson only.",
    saveGoldEdits: "Save Gold Edits",
    noUnsaved: "No unsaved changes.",
    quickFillLabel: "Quick Fill",
    quickFillPlaceholder: "Select source...",
    quickFillObserved: "Observed IPA",
    quickFillTeaching: "Teaching candidate",
    quickFillBestSurface: "Best surface candidate",
    quickFillCanonical: "Canonical",
    quickFillPhonetic: (n) => `Phonetic candidate ${n}`,
    quickFillSurface: (n) => `Surface candidate ${n}`,
    sentenceTitle: "Sentence",
    wordHeader: "Word",
    goldHeader: "Gold IPA (editable)",
    compactGoldHeader: (label) => `Gold (${label}, editable)`,
    notesHeader: "Notes",
    noSentenceFilter: "No sentences in current filter",
    noSentence: "No sentence",
    noSentenceMessage: "No sentence in current filter.",
    rangeText: (start, end) => `Range: ${start} - ${end}`,
    alignmentText: (pct) => `Alignment: ${pct}%`,
    displayText: (label, text) => `${label}: ${text}`,
    unsavedChanges: "Unsaved changes.",
    profileAppliedChanged: (n, sid) => `Profile applied: ${n} words updated in ${sid} (unsaved)`,
    profileAppliedNoChange: (sid) => `Profile applied: no changes in ${sid}`,
    savedWithBackup: (backup) => `Saved. Backup: ${backup}`,
    localSavedByDownload: "Local mode: download offline package to keep edits.",
    localSavedDownloaded: "Local mode: lesson JSON downloaded.",
    localSavedDownloadedZip: (n) => `Local mode: offline package downloaded (${n} audio files).`,
    savedDownloadedZip: (n) => `Offline package downloaded (${n} audio files).`,
    savedDownloadedZipWithMissing: (n, missing) => `Offline package downloaded (${n} audio files; ${missing} failed to download).`,
    saveFailed: (msg) => `Save failed: ${msg}`,
    profileUnavailable: "Profile config unavailable.",
    profileRules: "rules",
    profileFeatures: "features",
    profileSyllable: "syllable slots",
    profileSyllableCount: "syllables",
    profileCost: "cost",
    profileTags: "tags",
    canonicalHeader: (label) => `Canonical (${label})`,
    candidatesHeader: (label) => `Surface Candidates (${label})`,
    phoneticHeader: (label) => `Phonetic Detail (${label})`,
    observedHeader: (label) => `Observed (${label})`,
    profileHelpPrefix: "Description:",
    profileDefaultDesc: "Use profile to prioritize phonetic detail candidates.",
    profileRecommendedTag: "profile recommended",
    savedDefaultTag: "saved default",
    noLessonAvailable: "No lesson available",
    switchLessonConfirm: "You have unsaved changes. Switching lessons will discard them. Continue?",
    runKindTest: "test",
    runKindProduction: "production",
    runKindLocal: "local",
    runKindRemote: "online",
    runKindCustom: "custom",
    remoteLessonLabel: "Online Lessons",
    remoteLessonSelectPlaceholder: "Select a lesson…",
    remoteLessonLoaded: (name, count) => `Online lesson loaded: ${name} (${count} sentences)`,
    remoteLessonLoadFailed: (msg) => `Failed to load online lesson: ${msg}`,
    remoteLessonCatalogUnavailable: "Online lesson catalog unavailable (offline or not yet published).",
    remoteSavedInBrowser: "Saved in browser",
    savingToBrowser: "Saving…",
    remoteSavedRestored: "(with local edits)",
    clearRemoteEdits: "Clear local edits",
    entryHeading: "Select a Lesson",
    entryLoadBtn: "Load",
    entryOrLabel: "or",
    changeLessonBtn: "Change Lesson",
  },
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

function cloneDisplayTable(table) {
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    return {};
  }
  const output = {};
  Object.entries(table).forEach(([ipa, raw]) => {
    const key = String(ipa || "").trim();
    if (!key) {
      return;
    }
    const row = raw && typeof raw === "object" ? raw : {};
    output[key] = {
      ipa: key,
      symbol_id: String(row.symbol_id || "").trim(),
      kk: String(row.kk || "").trim(),
      zhuyin_plus: String(row.zhuyin_plus || "").trim(),
      zhuyin_plus_C1: String(row.zhuyin_plus_C1 || "").trim(),
      zhuyin_plus_V: String(row.zhuyin_plus_V || "").trim(),
      zhuyin_plus_C2: String(row.zhuyin_plus_C2 || "").trim(),
    };
  });
  return output;
}

function mergeDisplayTables(baseTable, overlayTable) {
  const merged = cloneDisplayTable(baseTable);
  if (!overlayTable || typeof overlayTable !== "object" || Array.isArray(overlayTable)) {
    return merged;
  }
  Object.entries(overlayTable).forEach(([ipa, raw]) => {
    const key = String(ipa || "").trim();
    if (!key) {
      return;
    }
    const row = raw && typeof raw === "object" ? raw : {};
    const current = merged[key] || {
      ipa: key,
      symbol_id: "",
      kk: key,
      zhuyin_plus: key,
      zhuyin_plus_C1: "",
      zhuyin_plus_V: "",
      zhuyin_plus_C2: "",
    };
    merged[key] = {
      ipa: key,
      symbol_id: String(row.symbol_id || current.symbol_id || "").trim(),
      kk: String(row.kk || current.kk || key).trim(),
      zhuyin_plus: String(row.zhuyin_plus || current.zhuyin_plus || key).trim(),
      zhuyin_plus_C1: String(row.zhuyin_plus_C1 || current.zhuyin_plus_C1 || "").trim(),
      zhuyin_plus_V: String(row.zhuyin_plus_V || current.zhuyin_plus_V || "").trim(),
      zhuyin_plus_C2: String(row.zhuyin_plus_C2 || current.zhuyin_plus_C2 || "").trim(),
    };
  });
  return merged;
}

function mergeDisplayTablesFillMissing(baseTable, overlayTable) {
  const merged = cloneDisplayTable(baseTable);
  if (!overlayTable || typeof overlayTable !== "object" || Array.isArray(overlayTable)) {
    return merged;
  }
  Object.entries(overlayTable).forEach(([ipa, raw]) => {
    const key = String(ipa || "").trim();
    if (!key) {
      return;
    }
    const row = raw && typeof raw === "object" ? raw : {};
    const current = merged[key] || {
      ipa: key,
      symbol_id: "",
      kk: "",
      zhuyin_plus: "",
      zhuyin_plus_C1: "",
      zhuyin_plus_V: "",
      zhuyin_plus_C2: "",
    };
    const next = {
      ipa: key,
      symbol_id: String(current.symbol_id || "").trim() || String(row.symbol_id || "").trim(),
      kk: String(current.kk || "").trim() || String(row.kk || "").trim() || key,
      zhuyin_plus: String(current.zhuyin_plus || "").trim() || String(row.zhuyin_plus || "").trim() || key,
      zhuyin_plus_C1: String(current.zhuyin_plus_C1 || "").trim() || String(row.zhuyin_plus_C1 || "").trim(),
      zhuyin_plus_V: String(current.zhuyin_plus_V || "").trim() || String(row.zhuyin_plus_V || "").trim(),
      zhuyin_plus_C2: String(current.zhuyin_plus_C2 || "").trim() || String(row.zhuyin_plus_C2 || "").trim(),
    };
    merged[key] = next;
  });
  return merged;
}

function cloneDisplayExceptionsMap(map) {
  const output = {};
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return output;
  }
  Object.entries(map).forEach(([wordNorm, byIpa]) => {
    if (!byIpa || typeof byIpa !== "object" || Array.isArray(byIpa)) {
      return;
    }
    output[wordNorm] = {};
    Object.entries(byIpa).forEach(([ipaText, zhuyinRaw]) => {
      if (!Array.isArray(zhuyinRaw)) {
        return;
      }
      output[wordNorm][ipaText] = zhuyinRaw.map((token) => String(token || ""));
    });
  });
  return output;
}

function mergeDisplayExceptionsMaps(baseMap, overlayMap) {
  const merged = cloneDisplayExceptionsMap(baseMap);
  if (!overlayMap || typeof overlayMap !== "object" || Array.isArray(overlayMap)) {
    return merged;
  }
  Object.entries(overlayMap).forEach(([wordNorm, byIpa]) => {
    if (!byIpa || typeof byIpa !== "object" || Array.isArray(byIpa)) {
      return;
    }
    if (!merged[wordNorm]) {
      merged[wordNorm] = {};
    }
    Object.entries(byIpa).forEach(([ipaText, zhuyinRaw]) => {
      if (!Array.isArray(zhuyinRaw)) {
        return;
      }
      merged[wordNorm][ipaText] = zhuyinRaw.map((token) => String(token || ""));
    });
  });
  return merged;
}

function applyDisplayMappingFromLesson(lessonPayload) {
  const lessonTable = lessonPayload && typeof lessonPayload === "object"
    ? lessonPayload.display_table
    : null;
  state.displayTable = mergeDisplayTablesFillMissing(DEFAULT_DISPLAY_TABLE, lessonTable);
  state.displayExceptions = parseDisplayExceptions(DEFAULT_DISPLAY_EXCEPTIONS_PAYLOAD);
  const lessonExceptions = lessonPayload && typeof lessonPayload === "object"
    ? parseDisplayExceptions(lessonPayload.display_exceptions)
    : {};
  state.displayExceptions = mergeDisplayExceptionsMaps(state.displayExceptions, lessonExceptions);
}

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
  syncAudioToSentenceStart(true);
  const playPromise = el.sentenceAudio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      if (state.presentationPlayAllActive) {
        stopPresentationPlayAll();
      }
    });
  }
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

function persistSentenceAudioOffsets() {
  try {
    localStorage.setItem(STORAGE_KEYS.sentenceAudioOffsets, JSON.stringify(state.sentenceAudioOffsets || {}));
  } catch {
    // Ignore storage failures.
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

function loadPreferences() {
  const savedLang = localStorage.getItem(STORAGE_KEYS.language);
  if (savedLang === "zh-TW" || savedLang === "en") {
    state.uiLanguage = savedLang;
  }

  const savedDisplay = localStorage.getItem(STORAGE_KEYS.displaySystem);
  if (savedDisplay === "ipa" || savedDisplay === "kk" || savedDisplay === "zhuyin_plus") {
    state.displaySystem = savedDisplay;
  }

  const savedProfile = localStorage.getItem(STORAGE_KEYS.profile);
  if (savedProfile) {
    state.activeProfileId = savedProfile;
  }

  const savedLoopSentence = localStorage.getItem(STORAGE_KEYS.loopSentence);
  if (savedLoopSentence === "1") {
    state.loopSentence = true;
  } else if (savedLoopSentence === "0") {
    state.loopSentence = false;
  }

  const savedLoopGap = localStorage.getItem(STORAGE_KEYS.loopGapSec);
  if (savedLoopGap !== null) {
    state.loopGapSec = clampLoopGapSec(savedLoopGap);
  }

  const savedLoopCount = localStorage.getItem(STORAGE_KEYS.loopCountTotal);
  state.loopCountTotal = parseLoopCountTotal(savedLoopCount);
  persistPreference(STORAGE_KEYS.loopCountTotal, buildLoopCountDisplayValue());

  const savedPlaybackRate = localStorage.getItem(STORAGE_KEYS.presentationPlaybackRate);
  if (savedPlaybackRate !== null) {
    state.presentationPlaybackRate = normalizePresentationPlaybackRate(savedPlaybackRate);
  }

  const savedShowPhonemes = localStorage.getItem(STORAGE_KEYS.presentationShowPhonemes);
  if (savedShowPhonemes === "0") {
    state.presentationShowPhonemes = false;
  } else if (savedShowPhonemes === "1") {
    state.presentationShowPhonemes = true;
  }

  state.sentenceAudioOffsets = parseSentenceAudioOffsets(localStorage.getItem(STORAGE_KEYS.sentenceAudioOffsets));
}

function persistPreference(key, value) {
  localStorage.setItem(key, value);
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

function buildTokenFragment(tokens, tokenDetails) {
  const fragment = document.createDocumentFragment();
  const list = Array.isArray(tokens) ? tokens : [];
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  let renderedCount = 0;

  list.forEach((token, idx) => {
    if (!token) {
      return;
    }
    if (renderedCount > 0) {
      fragment.appendChild(document.createTextNode(" "));
    }
    const span = document.createElement("span");
    span.className = "display-token";
    span.textContent = token;

    const detail = details[idx] || {};
    const stressLevel = normalizeStressLevel(detail.stress_level);
    if (stressLevel === 1) {
      span.classList.add("stress-primary");
    } else if (stressLevel === 2) {
      span.classList.add("stress-secondary");
    }

    fragment.appendChild(span);
    renderedCount += 1;
  });

  return fragment;
}

function renderTokenSequence(target, tokens, tokenDetails) {
  target.innerHTML = "";
  target.appendChild(buildTokenFragment(tokens, tokenDetails));
}

function renderLabeledTokenSequence(target, label, tokens, tokenDetails) {
  target.innerHTML = "";
  const prefix = document.createElement("span");
  prefix.className = "display-prefix";
  prefix.textContent = `${label}: `;
  target.appendChild(prefix);
  target.appendChild(buildTokenFragment(tokens, tokenDetails));
}

const PRESENTATION_SLOT_ORDER = ["C1", "V", "C2"];

function appendPresentationTokenAtIndex(tokens, idx, text) {
  if (!Array.isArray(tokens)) {
    return;
  }
  const safeIdx = Math.max(0, Math.min(tokens.length - 1, Number(idx) || 0));
  const piece = String(text || "").trim();
  if (!piece) {
    return;
  }
  tokens[safeIdx] = `${String(tokens[safeIdx] || "")}${piece}`;
}

const ZHUYIN_IPA_VOWELS = new Set([
  "i", "ɪ", "eɪ", "ɛ", "æ", "ə", "ʌ", "ɑ", "ɔ", "ʊ", "u",
  "aɪ", "aʊ", "oʊ", "ɔɪ", "iː", "uː", "ɑː", "ɔː", "ɜː",
  "ɐ", "ɚ", "ɝ", "ɔːɹ", "ɑːɹ", "ɪɹ", "əl",
]);

function buildPresentationZhuyinSlotLexicon() {
  const table = getDisplayTable();
  if (!table || typeof table !== "object" || Object.keys(table).length === 0) {
    return [];
  }

  const slotMap = new Map();
  const addToken = (raw, slot = "") => {
    const token = String(raw || "").trim();
    if (!token) {
      return;
    }
    if (!slotMap.has(token)) {
      slotMap.set(token, new Set());
    }
    if (slot) {
      slotMap.get(token).add(slot);
    }
  };

  Object.values(table).forEach((rawRow) => {
    const row = rawRow && typeof rawRow === "object" ? rawRow : {};
    const c1 = String(row.zhuyin_plus_C1 || "").trim();
    const v = String(row.zhuyin_plus_V || "").trim();
    const c2 = String(row.zhuyin_plus_C2 || "").trim();
    const base = String(row.zhuyin_plus || "").trim();
    const ipa = String(row.ipa || "").trim();

    addToken(c1, "C1");
    addToken(v, "V");
    addToken(c2, "C2");

    if (base) {
      const inferred = [];
      if (base === c1) {
        inferred.push("C1");
      }
      if (base === v) {
        inferred.push("V");
      }
      if (base === c2) {
        inferred.push("C2");
      }
      if (inferred.length === 0) {
        addToken(base, ZHUYIN_IPA_VOWELS.has(ipa) ? "V" : "");
      } else {
        inferred.forEach((slot) => addToken(base, slot));
      }
    }
  });

  addToken("ㄓㄨ", "C1");
  addToken("ㄔㄨ", "C1");
  addToken("ㄖㄨ", "C1");
  addToken("ㄗ", "C2");
  addToken("ㄘ", "C2");
  addToken("ㄊ\"", "C2");

  return Array.from(slotMap.entries())
    .map(([text, slots]) => ({ text, slots: Array.from(slots) }))
    .sort((a, b) => b.text.length - a.text.length);
}

function splitPresentationZhuyinTokenByLexicon(rawToken, lexicon) {
  const token = String(rawToken || "").trim();
  if (!token) {
    return [];
  }
  const entries = Array.isArray(lexicon) ? lexicon : [];
  if (entries.length === 0) {
    return [{ text: token, slots: [] }];
  }

  const pieces = [];
  let cursor = 0;
  while (cursor < token.length) {
    let matched = null;
    for (const entry of entries) {
      if (!entry || !entry.text) {
        continue;
      }
      if (token.startsWith(entry.text, cursor)) {
        matched = entry;
        break;
      }
    }

    if (matched) {
      pieces.push({ text: matched.text, slots: Array.isArray(matched.slots) ? matched.slots : [] });
      cursor += matched.text.length;
      continue;
    }

    pieces.push({ text: token[cursor], slots: [] });
    cursor += 1;
  }

  if (pieces.length <= 1) {
    return pieces;
  }

  const merged = [];
  pieces.forEach((piece) => {
    const slots = Array.isArray(piece?.slots) ? piece.slots : [];
    const text = String(piece?.text || "");
    if (!text) {
      return;
    }
    const prev = merged.length > 0 ? merged[merged.length - 1] : null;
    if (prev && prev.slots.length === 0 && slots.length === 0) {
      prev.text += text;
      return;
    }
    merged.push({ text, slots });
  });

  return merged;
}

function alignPresentationEditedTokensByExpected(editedTokens, expectedTokens, tokenDetails) {
  const edited = normalizeTokenSequence(editedTokens);
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  if (edited.length === 0 || details.length === 0) {
    return null;
  }

  const expected = Array.isArray(expectedTokens)
    ? expectedTokens.map((token) => String(token || "").trim())
    : [];
  let candidateIndices = [];
  for (let idx = 0; idx < Math.min(expected.length, details.length); idx += 1) {
    if (expected[idx]) {
      candidateIndices.push(idx);
    }
  }
  if (candidateIndices.length === 0) {
    candidateIndices = Array.from({ length: details.length }, (_, idx) => idx);
  }

  const adjusted = new Array(details.length).fill("");
  const used = new Set();

  const findNearestUnused = (basePos) => {
    for (let delta = 0; delta < candidateIndices.length; delta += 1) {
      const leftIdx = basePos - delta;
      if (leftIdx >= 0) {
        const target = candidateIndices[leftIdx];
        if (!used.has(target)) {
          return target;
        }
      }
      if (delta === 0) {
        continue;
      }
      const rightIdx = basePos + delta;
      if (rightIdx < candidateIndices.length) {
        const target = candidateIndices[rightIdx];
        if (!used.has(target)) {
          return target;
        }
      }
    }
    return null;
  };

  edited.forEach((token, idx) => {
    const ratio = edited.length <= 1 ? 0 : idx / (edited.length - 1);
    const mappedPos = Math.round(ratio * Math.max(0, candidateIndices.length - 1));
    let targetIdx = findNearestUnused(mappedPos);
    if (targetIdx === null) {
      targetIdx = Math.min(details.length - 1, Math.max(0, Math.round(ratio * Math.max(0, details.length - 1))));
    }
    if (targetIdx === null || targetIdx < 0) {
      return;
    }
    appendPresentationTokenAtIndex(adjusted, targetIdx, token);
    used.add(targetIdx);
  });

  return adjusted.some((token) => String(token || "").trim()) ? adjusted : null;
}

function assignPresentationZhuyinPiecesToDetails(editedTokens, tokenDetails, expectedTokens = []) {
  const edited = normalizeTokenSequence(editedTokens);
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  if (edited.length === 0 || details.length === 0) {
    return null;
  }

  const expected = Array.isArray(expectedTokens)
    ? expectedTokens.map((token) => String(token || "").trim())
    : [];

  const lexicon = buildPresentationZhuyinSlotLexicon();
  const pieces = [];
  edited.forEach((token, sourceIdx) => {
    const split = splitPresentationZhuyinTokenByLexicon(token, lexicon);
    split.forEach((piece) => {
      pieces.push({
        text: String(piece?.text || "").trim(),
        slots: Array.isArray(piece?.slots) ? piece.slots : [],
        sourceIdx,
      });
    });
  });

  const normalizedPieces = pieces.filter((piece) => piece.text);
  if (normalizedPieces.length === 0) {
    return null;
  }

  const slotIndices = { C1: [], V: [], C2: [] };
  details.forEach((detail, idx) => {
    const slot = String(detail?.syllable_slot || "");
    if (slotIndices[slot]) {
      slotIndices[slot].push(idx);
    }
  });

  const adjusted = new Array(details.length).fill("");
  const used = new Set();
  let lastIdx = -1;

  const pickIndex = (candidates = []) => {
    for (const idx of candidates) {
      if (!used.has(idx) && idx >= lastIdx) {
        return idx;
      }
    }
    for (const idx of candidates) {
      if (!used.has(idx)) {
        return idx;
      }
    }
    return null;
  };

  const allIndices = Array.from({ length: details.length }, (_, idx) => idx);
  normalizedPieces.forEach((piece) => {
    const preferredSlots = piece.slots.filter((slot) => PRESENTATION_SLOT_ORDER.includes(slot));
    let targetIdx = null;

    if (preferredSlots.length === 0 && expected.length > 0) {
      const exactMatches = [];
      expected.forEach((token, idx) => {
        if (token && token === piece.text) {
          exactMatches.push(idx);
        }
      });
      if (exactMatches.length > 0) {
        targetIdx = pickIndex(exactMatches);
      }
    }

    for (const slot of preferredSlots) {
      targetIdx = pickIndex(slotIndices[slot]);
      if (targetIdx !== null) {
        break;
      }
    }
    if (targetIdx === null) {
      targetIdx = pickIndex(allIndices);
    }
    if (targetIdx === null) {
      targetIdx = details.length - 1;
    }
    appendPresentationTokenAtIndex(adjusted, targetIdx, piece.text);
    used.add(targetIdx);
    lastIdx = Math.max(lastIdx, targetIdx);
  });

  return adjusted.some((token) => String(token || "").trim()) ? adjusted : null;
}

function recoverPresentationDisplayEditsWithDetails(word, editedDisplayTokens, system) {
  const edited = normalizeTokenSequence(editedDisplayTokens);
  if (edited.length === 0) {
    return null;
  }

  const ipaTokens = getFallbackGoldIpaTokens(word);
  if (ipaTokens.length === 0) {
    return null;
  }

  const baseDetails = pickTokenDetailsForWordTokens(word, ipaTokens);
  if (!Array.isArray(baseDetails) || baseDetails.length === 0) {
    return null;
  }

  if (edited.length === baseDetails.length) {
    return { tokens: edited, tokenDetails: cloneTokenDetails(baseDetails) };
  }

  const expected = displayTokensWithDetails(
    word?.gold_display,
    ipaTokens,
    baseDetails,
    system,
    word?.word,
  );

  if (system === "zhuyin_plus") {
    const rebuiltBySlot = assignPresentationZhuyinPiecesToDetails(edited, baseDetails, expected);
    if (Array.isArray(rebuiltBySlot) && rebuiltBySlot.length === baseDetails.length) {
      return { tokens: rebuiltBySlot, tokenDetails: cloneTokenDetails(baseDetails) };
    }
  }

  const rebuiltByExpected = alignPresentationEditedTokensByExpected(edited, expected, baseDetails);
  if (Array.isArray(rebuiltByExpected) && rebuiltByExpected.length === baseDetails.length) {
    return { tokens: rebuiltByExpected, tokenDetails: cloneTokenDetails(baseDetails) };
  }

  const fallback = new Array(baseDetails.length).fill("");
  edited.forEach((token, idx) => {
    const ratio = edited.length <= 1 ? 0 : idx / (edited.length - 1);
    const targetIdx = Math.min(baseDetails.length - 1, Math.max(0, Math.round(ratio * (baseDetails.length - 1))));
    appendPresentationTokenAtIndex(fallback, targetIdx, token);
  });
  if (fallback.some((token) => String(token || "").trim())) {
    return { tokens: fallback, tokenDetails: cloneTokenDetails(baseDetails) };
  }

  return null;
}

function getPresentationTokensAndDetails(word) {
  const displayEdits = getWordGoldDisplayEdits(word, false);
  const editedDisplayTokens = displayEdits && Array.isArray(displayEdits[state.displaySystem])
    ? normalizeTokenSequence(displayEdits[state.displaySystem])
    : [];

  if (state.displaySystem === "zhuyin_plus" && hasUserSyllableBoundary(editedDisplayTokens)) {
    return { tokens: editedDisplayTokens, tokenDetails: [], userSyllableBoundary: true };
  }

  if (state.displaySystem !== "ipa" && editedDisplayTokens.length > 0) {
    const recovered = recoverPresentationDisplayEditsWithDetails(word, editedDisplayTokens, state.displaySystem);
    if (recovered && Array.isArray(recovered.tokens)) {
      return recovered;
    }
    return { tokens: editedDisplayTokens, tokenDetails: [] };
  }

  const ipaTokens = getFallbackGoldIpaTokens(word);
  if (ipaTokens.length === 0) {
    return {
      tokens: getCompactGoldTokens(word, state.displaySystem),
      tokenDetails: [],
    };
  }

  const tokenDetails = pickTokenDetailsForWordTokens(word, ipaTokens);
  const mapped = displayTokensWithDetails(
    word?.gold_display,
    ipaTokens,
    tokenDetails,
    state.displaySystem,
    word?.word,
  );
  const mappedTokens = Array.isArray(mapped)
    ? mapped.map((token) => String(token || ""))
    : [];
  if (mappedTokens.some((token) => token.trim())) {
    return { tokens: mappedTokens, tokenDetails };
  }

  return {
    tokens: getCompactGoldTokens(word, state.displaySystem),
    tokenDetails: [],
  };
}

function buildPresentationSyllableColumns(tokens, tokenDetails) {
  const safeTokens = Array.isArray(tokens)
    ? tokens.map((token) => String(token || ""))
    : [];
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  if (safeTokens.length === 0 || safeTokens.length !== details.length) {
    return null;
  }

  const bySyllable = new Map();
  let validDetailCount = 0;
  let visibleAssignedCount = 0;
  let invalidFound = false;

  safeTokens.forEach((token, idx) => {
    const detail = details[idx] && typeof details[idx] === "object" ? details[idx] : {};
    const slot = String(detail.syllable_slot || "");
    const rawSyllable = Number(detail.syllable_index);
    if (!PRESENTATION_SLOT_ORDER.includes(slot) || !Number.isFinite(rawSyllable)) {
      invalidFound = true;
      return;
    }
    validDetailCount += 1;

    const syllableIndex = Math.max(0, Math.trunc(rawSyllable));
    if (!bySyllable.has(syllableIndex)) {
      bySyllable.set(syllableIndex, { C1: [], V: [], C2: [] });
    }

    const shown = token.trim();
    if (!shown) {
      return;
    }

    bySyllable.get(syllableIndex)[slot].push(shown);
    visibleAssignedCount += 1;
  });

  if (invalidFound || validDetailCount <= 0 || visibleAssignedCount <= 0 || bySyllable.size === 0) {
    return null;
  }

  const indices = Array.from(bySyllable.keys()).sort((a, b) => a - b);
  return indices.map((index) => ({
    index,
    slots: bySyllable.get(index),
  }));
}

function buildPresentationFallbackColumns(tokens) {
  const safeTokens = Array.isArray(tokens)
    ? tokens.map((token) => String(token || "").trim()).filter((token) => token)
    : [];
  return safeTokens.map((token) => ({
    slots: {
      C1: [],
      V: [token],
      C2: [],
    },
  }));
}

function normalizePresentationColumnSlots(column) {
  const safeColumn = column && typeof column === "object" ? column : {};
  const slots = {};
  PRESENTATION_SLOT_ORDER.forEach((slot) => {
    const raw = Array.isArray(safeColumn?.slots?.[slot]) ? safeColumn.slots[slot] : [];
    slots[slot] = raw
      .map((token) => String(token || "").trim())
      .filter((token) => token);
  });
  return { slots };
}

function hasUserSyllableBoundary(editedTokens) {
  return Array.isArray(editedTokens) && editedTokens.some((t) => String(t || "").includes("|"));
}

function buildPresentationUserDefinedColumns(editedTokens, lexicon) {
  const joined = editedTokens.map((t) => String(t || "")).join(" ");
  const segments = joined.split("|").map((seg) => seg.trim()).filter((seg) => seg);
  if (segments.length === 0) return [];

  return segments.map((seg) => {
    const segTokens = normalizeTokenSequence(seg);
    const pieces = [];
    segTokens.forEach((token) => {
      splitPresentationZhuyinTokenByLexicon(token, lexicon).forEach((piece) => {
        if (String(piece?.text || "").trim()) pieces.push(piece);
      });
    });

    const slots = { C1: [], V: [], C2: [] };
    let foundVowel = false;
    pieces.forEach((piece) => {
      const text = String(piece?.text || "").trim();
      if (!text) return;
      const isV = Array.isArray(piece?.slots) && piece.slots.includes("V");
      if (isV) {
        foundVowel = true;
        slots.V.push(text);
      } else if (!foundVowel) {
        slots.C1.push(text);
      } else {
        slots.C2.push(text);
      }
    });
    if (slots.V.length === 0 && slots.C1.length >= 2) {
      slots.V.push(slots.C1.pop());
    }
    return { slots };
  });
}

function buildPresentationWordLayout(word) {
  const wordText = String(word?.word || "").trim();
  const { tokens, tokenDetails, userSyllableBoundary } = getPresentationTokensAndDetails(word);

  if (userSyllableBoundary) {
    const lexicon = buildPresentationZhuyinSlotLexicon();
    const userColumns = buildPresentationUserDefinedColumns(tokens, lexicon);
    if (Array.isArray(userColumns) && userColumns.length > 0) {
      const columns = userColumns.map((col) => normalizePresentationColumnSlots(col));
      const tokenCount = columns.reduce((count, column) => {
        return count + PRESENTATION_SLOT_ORDER.reduce((inner, slot) => inner + (column.slots[slot] || []).length, 0);
      }, 0);
      return { wordText, columns, tokenCount };
    }
  }

  const bySyllable = buildPresentationSyllableColumns(tokens, tokenDetails);
  const fallback = buildPresentationFallbackColumns(tokens);
  const rawColumns = Array.isArray(bySyllable) && bySyllable.length > 0
    ? bySyllable
    : fallback;

  if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
    return {
      wordText,
      columns: [],
      tokenCount: 0,
    };
  }

  const columns = rawColumns.map((column) => normalizePresentationColumnSlots(column));
  const tokenCount = columns.reduce((count, column) => {
    return count + PRESENTATION_SLOT_ORDER.reduce((inner, slot) => inner + (column.slots[slot] || []).length, 0);
  }, 0);

  return {
    wordText,
    columns,
    tokenCount,
  };
}

function getPresentationLayoutMetrics(scale = 1) {
  const safeScale = Number.isFinite(scale) ? Math.max(0.62, Math.min(1, scale)) : 1;
  return {
    safeScale,
    syllableMinWidth: Math.max(48, Math.round(84 * safeScale)),
    syllableGap: Math.max(8, Math.round(16 * safeScale)),
    groupPaddingX: Math.max(8, Math.round(13 * safeScale)),
    groupGap: Math.max(10, Math.round(22 * safeScale)),
    lineEdgeInset: Math.max(6, Math.round(10 * safeScale)),
  };
}

function estimatePresentationTokenTextWidth(tokenText, scale = 1) {
  const text = String(tokenText || "").trim();
  const safeScale = Number.isFinite(scale) ? Math.max(0.62, Math.min(1, scale)) : 1;
  if (!text) {
    return Math.max(12, Math.round(16 * safeScale));
  }

  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      units += 0.42;
    } else if (/[\u3040-\u30ff\u4e00-\u9fff\u3100-\u312f]/.test(ch)) {
      units += 1.02;
    } else if (/[()\[\]{}]/.test(ch)) {
      units += 0.46;
    } else if (/[0-9]/.test(ch)) {
      units += 0.58;
    } else {
      units += 0.64;
    }
  }

  const unitWidth = Math.max(8, Math.round(24 * safeScale));
  return Math.max(Math.round(18 * safeScale), Math.round(units * unitWidth));
}

function estimatePresentationWordTextWidth(wordText, scale = 1) {
  const text = String(wordText || "").trim();
  const safeScale = Number.isFinite(scale) ? Math.max(0.62, Math.min(1, scale)) : 1;
  if (!text) {
    return Math.max(64, Math.round(72 * safeScale));
  }

  let unitCount = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      unitCount += 0.34;
    } else if (/[MWmw]/.test(ch)) {
      unitCount += 0.95;
    } else if (/[A-Z]/.test(ch)) {
      unitCount += 0.78;
    } else if (/[a-z]/.test(ch)) {
      unitCount += 0.66;
    } else if (/[0-9]/.test(ch)) {
      unitCount += 0.62;
    } else {
      unitCount += 1.02;
    }
  }

  const unitWidth = Math.max(12, Math.round(30 * safeScale));
  const estimated = Math.round(unitCount * unitWidth);
  return Math.max(Math.round(72 * safeScale), estimated);
}

function estimatePresentationColumnWidth(column, scale = 1, metrics = null) {
  const cfg = metrics || getPresentationLayoutMetrics(scale);
  const safeColumn = column && typeof column === "object" ? column : {};
  const slotTexts = PRESENTATION_SLOT_ORDER.map((slot) => {
    const tokens = Array.isArray(safeColumn?.slots?.[slot]) ? safeColumn.slots[slot] : [];
    if (tokens.length === 0) {
      return "-";
    }
    return tokens.map((token) => String(token || "")).join(" ");
  });

  const widest = slotTexts.reduce((maxWidth, text) => {
    return Math.max(maxWidth, estimatePresentationTokenTextWidth(text, cfg.safeScale));
  }, 0);

  const slotPad = Math.max(10, Math.round(16 * cfg.safeScale));
  return Math.max(cfg.syllableMinWidth, widest + slotPad);
}

function estimatePresentationWordGroupMetrics(layout, scale = 1, metrics = null) {
  const cfg = metrics || getPresentationLayoutMetrics(scale);
  const columns = Array.isArray(layout?.columns) ? layout.columns : [];
  const syllableCount = Math.max(1, columns.length);
  const columnMinWidths = (columns.length > 0 ? columns : [{}]).map((column) => {
    return estimatePresentationColumnWidth(column, cfg.safeScale, cfg);
  });
  const syllableWidth = columnMinWidths.reduce((sum, width) => sum + width, 0)
    + (Math.max(0, syllableCount - 1) * cfg.syllableGap);
  const textWidth = estimatePresentationWordTextWidth(layout?.wordText, cfg.safeScale);
  const contentWidth = Math.max(textWidth, syllableWidth);
  const fullWidth = contentWidth + (cfg.groupPaddingX * 2);
  const columnTemplate = columnMinWidths
    .map((width) => `minmax(${Math.max(24, Math.round(width))}px, 1fr)`)
    .join(" ");

  return {
    syllableCount,
    contentWidth,
    fullWidth,
    columnMinWidths,
    columnTemplate,
  };
}

function estimatePresentationAvailableLineWidth(scale = 1, metrics = null) {
  const cfg = metrics || getPresentationLayoutMetrics(scale);
  const widthHint = Number(el.presentationPhonemeLine?.clientWidth || el.presentationSection?.clientWidth || 940);
  const safeWidth = Math.max(320, widthHint - (cfg.lineEdgeInset * 2));
  return Math.max(260, safeWidth);
}

function estimatePresentationLineWidth(prefixWidths, startIdx, endIdx, gap) {
  if (endIdx < startIdx) {
    return 0;
  }
  const wordWidth = prefixWidths[endIdx + 1] - prefixWidths[startIdx];
  const gaps = Math.max(0, endIdx - startIdx) * gap;
  return wordWidth + gaps;
}

function computePresentationMinimalLineCount(widths, availableWidth, gap) {
  if (!Array.isArray(widths) || widths.length === 0) {
    return 0;
  }

  let lines = 1;
  let currentWidth = 0;

  widths.forEach((width) => {
    const safeWidth = Math.max(0, Number(width) || 0);
    if (currentWidth <= 0) {
      currentWidth = safeWidth;
      return;
    }

    const combined = currentWidth + gap + safeWidth;
    if (combined <= availableWidth) {
      currentWidth = combined;
      return;
    }

    lines += 1;
    currentWidth = safeWidth;
  });

  return lines;
}

function solvePresentationBalancedBreaks(widths, availableWidth, gap, lineCount) {
  const n = Array.isArray(widths) ? widths.length : 0;
  if (n === 0 || lineCount <= 0 || lineCount > n) {
    return null;
  }

  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    prefix[i + 1] = prefix[i] + Math.max(0, Number(widths[i]) || 0);
  }

  const totalWidth = estimatePresentationLineWidth(prefix, 0, n - 1, gap);
  const target = totalWidth / Math.max(1, lineCount);
  const INF = Number.POSITIVE_INFINITY;

  const dp = Array.from({ length: lineCount + 1 }, () => new Array(n + 1).fill(INF));
  const prev = Array.from({ length: lineCount + 1 }, () => new Array(n + 1).fill(-1));
  const pickedWidths = Array.from({ length: lineCount + 1 }, () => new Array(n + 1).fill(0));
  dp[0][0] = 0;

  for (let lines = 1; lines <= lineCount; lines += 1) {
    for (let end = lines; end <= n; end += 1) {
      for (let start = lines - 1; start < end; start += 1) {
        if (!Number.isFinite(dp[lines - 1][start])) {
          continue;
        }

        const lineWidth = estimatePresentationLineWidth(prefix, start, end - 1, gap);
        const singleWord = start === end - 1;
        if (lineWidth > availableWidth && !singleWord) {
          continue;
        }

        const diff = lineWidth - target;
        const cost = dp[lines - 1][start] + (diff * diff);
        if (cost < dp[lines][end]) {
          dp[lines][end] = cost;
          prev[lines][end] = start;
          pickedWidths[lines][end] = lineWidth;
        }
      }
    }
  }

  if (!Number.isFinite(dp[lineCount][n])) {
    return null;
  }

  const ranges = [];
  const lineWidths = [];
  let end = n;
  for (let lines = lineCount; lines >= 1; lines -= 1) {
    const start = prev[lines][end];
    if (start < 0) {
      return null;
    }
    ranges.unshift([start, end - 1]);
    lineWidths.unshift(pickedWidths[lines][end]);
    end = start;
  }

  return {
    ranges,
    lineWidths,
    cost: dp[lineCount][n],
  };
}

function splitPresentationWordLayouts(wordLayouts, scale = 1) {
  const metrics = getPresentationLayoutMetrics(scale);
  const availableWidth = estimatePresentationAvailableLineWidth(scale, metrics);

  const prepared = [];
  wordLayouts.forEach((layout) => {
    const cols = Array.isArray(layout?.columns) ? layout.columns : [];
    if (cols.length <= 0) {
      return;
    }
    const groupMetrics = estimatePresentationWordGroupMetrics(layout, metrics.safeScale, metrics);
    prepared.push({
      ...layout,
      __groupMetrics: groupMetrics,
      __groupWidth: groupMetrics.fullWidth,
    });
  });

  if (prepared.length === 0) {
    return {
      lines: [],
      availableWidth,
      maxLineWidth: 0,
      metrics,
    };
  }

  const widths = prepared.map((layout) => Number(layout.__groupWidth || 0));
  const minLines = Math.max(1, computePresentationMinimalLineCount(widths, availableWidth, metrics.groupGap));
  const maxLines = Math.min(prepared.length, minLines + 4);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
    + (Math.max(0, prepared.length - 1) * metrics.groupGap);

  let best = null;
  for (let lineCount = minLines; lineCount <= maxLines; lineCount += 1) {
    const solved = solvePresentationBalancedBreaks(widths, availableWidth, metrics.groupGap, lineCount);
    if (!solved) {
      continue;
    }
    const target = totalWidth / Math.max(1, lineCount);
    const linePenalty = (lineCount - minLines) * target * target * 0.16;
    const score = solved.cost + linePenalty;
    if (!best || score < best.score) {
      best = { score, solved };
    }
  }

  let lines = [];
  let maxLineWidth = 0;

  if (best && Array.isArray(best.solved?.ranges) && best.solved.ranges.length > 0) {
    lines = best.solved.ranges.map(([startIdx, endIdx], idx) => {
      const safeStart = Math.max(0, startIdx);
      const safeEnd = Math.max(safeStart, endIdx);
      const widthAt = Array.isArray(best.solved.lineWidths) ? Number(best.solved.lineWidths[idx] || 0) : 0;
      maxLineWidth = Math.max(maxLineWidth, widthAt);
      return prepared.slice(safeStart, safeEnd + 1);
    });
  } else {
    let current = [];
    let currentWidth = 0;
    prepared.forEach((layout) => {
      const width = Number(layout.__groupWidth || 0);
      const addedWidth = current.length > 0 ? currentWidth + metrics.groupGap + width : width;
      if (current.length > 0 && addedWidth > availableWidth) {
        lines.push(current);
        maxLineWidth = Math.max(maxLineWidth, currentWidth);
        current = [layout];
        currentWidth = width;
        return;
      }
      current.push(layout);
      currentWidth = addedWidth;
    });
    if (current.length > 0) {
      lines.push(current);
      maxLineWidth = Math.max(maxLineWidth, currentWidth);
    }
  }

  return {
    lines,
    availableWidth,
    maxLineWidth,
    metrics,
  };
}

function buildPresentationLineMatrix(wordLayouts, lineIndex = 0, scale = 1, layoutMetrics = null) {
  const metrics = layoutMetrics || getPresentationLayoutMetrics(scale);
  const groups = [];
  let columnCount = 0;
  wordLayouts.forEach((layout) => {
    const cols = Array.isArray(layout?.columns) ? layout.columns : [];
    if (cols.length <= 0) {
      return;
    }
    groups.push({
      wordText: String(layout?.wordText || "").trim() || "...",
      columns: cols,
    });
    columnCount += cols.length;
  });

  if (groups.length === 0 || columnCount === 0) {
    return { lineNode: null, columnCount: 0 };
  }

  const lineNode = document.createElement("div");
  lineNode.className = "presentation-line-matrix";
  lineNode.setAttribute("data-line-index", String(lineIndex + 1));
  lineNode.style.setProperty("--presentation-row-gap", `${Math.max(10, Math.round(14 * metrics.safeScale))}px`);
  lineNode.style.setProperty("--presentation-group-gap", `${metrics.groupGap}px`);

  const groupsWrap = document.createElement("div");
  groupsWrap.className = "presentation-line-groups";

  groups.forEach((group) => {
    const groupMetrics = group.__groupMetrics
      || estimatePresentationWordGroupMetrics(group, metrics.safeScale, metrics);
    const syllableCount = Math.max(1, groupMetrics.syllableCount || group.columns.length || 1);
    const wordMinWidth = Math.max(56, Math.round(groupMetrics.contentWidth));

    const wordGroup = document.createElement("div");
    wordGroup.className = "presentation-word-group";
    wordGroup.style.setProperty("--presentation-word-syllables", String(syllableCount));
    wordGroup.style.setProperty("--presentation-word-gap", `${metrics.syllableGap}px`);
    wordGroup.style.setProperty("--presentation-word-min-width", `${wordMinWidth}px`);
    if (groupMetrics.columnTemplate) {
      wordGroup.style.setProperty("--presentation-word-columns-template", groupMetrics.columnTemplate);
    }

    const wordCell = document.createElement("span");
    wordCell.className = "presentation-word-cell presentation-word-span";
    wordCell.textContent = group.wordText;
    wordGroup.appendChild(wordCell);

    PRESENTATION_SLOT_ORDER.forEach((slot) => {
      const slotRow = document.createElement("div");
      slotRow.className = `presentation-word-slot-row presentation-word-slot-row-${slot}`;
      slotRow.dataset.slot = slot;

      const slotCells = document.createElement("div");
      slotCells.className = `presentation-word-slot-cells presentation-word-slot-cells-${slot}`;

      group.columns.forEach((column) => {
        const cell = document.createElement("span");
        cell.className = `presentation-slot-cell presentation-slot-cell-${slot}`;
        cell.dataset.slot = slot;
        const slotTokens = Array.isArray(column?.slots?.[slot]) ? column.slots[slot] : [];
        if (slotTokens.length === 0) {
          cell.classList.add("empty");
          cell.textContent = "-";
        } else {
          cell.appendChild(buildTokenFragment(slotTokens, []));
        }
        slotCells.appendChild(cell);
      });

      slotRow.appendChild(slotCells);
      wordGroup.appendChild(slotRow);
    });

    groupsWrap.appendChild(wordGroup);
  });

  lineNode.appendChild(groupsWrap);
  return { lineNode, columnCount };
}

function buildPresentationSentenceMatrix(wordLayouts, scale = 1) {
  if (!Array.isArray(wordLayouts) || wordLayouts.length === 0) {
    return { matrix: null, columnCount: 0, lineCount: 0 };
  }

  const split = splitPresentationWordLayouts(wordLayouts, scale);
  const lines = Array.isArray(split.lines) ? split.lines : [];
  if (lines.length === 0) {
    return { matrix: null, columnCount: 0, lineCount: 0 };
  }

  const matrix = document.createElement("div");
  matrix.className = "presentation-sentence-matrix";

  let maxLineColumns = 0;
  lines.forEach((lineLayouts, lineIdx) => {
    const built = buildPresentationLineMatrix(lineLayouts, lineIdx, scale, split.metrics);
    if (!built.lineNode) {
      return;
    }
    matrix.appendChild(built.lineNode);
    maxLineColumns = Math.max(maxLineColumns, built.columnCount);
  });

  return {
    matrix,
    columnCount: maxLineColumns,
    lineCount: lines.length,
    maxLineWidth: Number(split.maxLineWidth || 0),
    availableWidth: Number(split.availableWidth || 0),
  };
}

function countPresentationRowLines(row) {
  const lineBlocks = row ? Array.from(row.querySelectorAll(".presentation-line-matrix")) : [];
  if (lineBlocks.length > 0) {
    return lineBlocks.length;
  }

  const blocks = row ? Array.from(row.querySelectorAll(".presentation-word-span")) : [];
  if (blocks.length === 0) {
    return 1;
  }

  let lineCount = 0;
  let previousTop = null;
  blocks.forEach((block) => {
    const top = Math.round(Number(block.offsetTop || 0));
    if (previousTop === null || Math.abs(top - previousTop) > 2) {
      lineCount += 1;
      previousTop = top;
    }
  });

  return Math.max(1, lineCount);
}

function computePresentationScale(sentenceText, wordCount, tokenCount, columnCount) {
  let scale = 1;
  const textLen = String(sentenceText || "").trim().length;

  if (wordCount >= 8) {
    scale -= 0.08;
  }
  if (wordCount >= 11) {
    scale -= 0.08;
  }
  if (tokenCount >= 24) {
    scale -= 0.08;
  }
  if (tokenCount >= 32) {
    scale -= 0.06;
  }
  if (columnCount >= 14) {
    scale -= 0.08;
  }
  if (columnCount >= 20) {
    scale -= 0.08;
  }
  if (textLen >= 38) {
    scale -= 0.06;
  }
  if (textLen >= 60) {
    scale -= 0.06;
  }

  return Math.max(0.62, Math.min(1, scale));
}

function applyPresentationContentScale(sentenceText, row, wordCount, tokenCount, columnCount) {
  if (!el.presentationSection) {
    return 1;
  }

  const lines = countPresentationRowLines(row);
  let scale = computePresentationScale(sentenceText, wordCount, tokenCount, columnCount);
  if (lines > 2) {
    scale = Math.max(0.62, scale - Math.min(0.2, (lines - 2) * 0.06));
  }
  el.presentationSection.style.setProperty("--presentation-scale", scale.toFixed(3));
  return scale;
}

function renderPresentationSentence(sentence) {
  if (!el.presentationSection || !el.presentationSentenceText || !el.presentationPhonemeLine) {
    return;
  }

  if (!sentence || !Array.isArray(sentence.words) || sentence.words.length === 0) {
    el.presentationSentenceText.hidden = false;
    el.presentationSentenceText.textContent = t("noSentenceMessage");
    el.presentationPhonemeLine.textContent = "";
    el.presentationSection.style.setProperty("--presentation-scale", "1");
    if (el.presentationTranscript) el.presentationTranscript.hidden = true;
    return;
  }

  el.presentationSentenceText.hidden = true;
  el.presentationSentenceText.textContent = sentence.text || "";
  el.presentationPhonemeLine.innerHTML = "";

  const displayLabel = DISPLAY_LABEL[state.uiLanguage][state.displaySystem] || state.displaySystem;
  const label = document.createElement("div");
  label.className = "presentation-phoneme-label";
  label.textContent = t("presentationPhonemeLabel", displayLabel);
  el.presentationPhonemeLine.appendChild(label);

  const row = document.createElement("div");
  row.className = "presentation-phoneme-row";
  const words = Array.isArray(sentence.words) ? sentence.words : [];
  const wordLayouts = [];
  let totalTokenCount = 0;
  words.forEach((word) => {
    const layout = buildPresentationWordLayout(word);
    if (!Array.isArray(layout.columns) || layout.columns.length === 0) {
      return;
    }
    wordLayouts.push(layout);
    totalTokenCount += Number(layout.tokenCount || 0);
  });

  const totalColumnCount = wordLayouts.reduce((sum, layout) => {
    const cols = Array.isArray(layout?.columns) ? layout.columns.length : 0;
    return sum + cols;
  }, 0);

  let preferredScale = computePresentationScale(sentence.text || "", words.length, totalTokenCount, totalColumnCount);
  let built = buildPresentationSentenceMatrix(wordLayouts, preferredScale);

  if (built.matrix) {
    row.appendChild(built.matrix);
  }

  if (built.matrix) {
    const adjusted = applyPresentationContentScale(
      sentence.text || "",
      row,
      words.length,
      totalTokenCount,
      built.columnCount,
    );
    if (Math.abs(adjusted - preferredScale) > 0.04) {
      preferredScale = adjusted;
      built = buildPresentationSentenceMatrix(wordLayouts, preferredScale);
      row.innerHTML = "";
      if (built.matrix) {
        row.appendChild(built.matrix);
      }
      applyPresentationContentScale(
        sentence.text || "",
        row,
        words.length,
        totalTokenCount,
        built.columnCount,
      );
    }
  } else {
    el.presentationSection.style.setProperty("--presentation-scale", preferredScale.toFixed(3));
  }

  el.presentationPhonemeLine.appendChild(row);
  updatePresentationScrollState();
  updatePresentationPlayPauseButton();
  renderPresentationTranscript();
}

function renderPresentationTranscript() {
  if (!el.presentationTranscript) return;
  const sentences = state.lesson && Array.isArray(state.lesson.sentences) ? state.lesson.sentences : [];
  if (sentences.length === 0) {
    el.presentationTranscript.hidden = true;
    return;
  }
  el.presentationTranscript.hidden = false;
  el.presentationTranscript.innerHTML = "";
  sentences.forEach((sentence, idx) => {
    const row = document.createElement("div");
    row.className = "presentation-transcript-row" + (idx === state.sentenceIndex ? " active" : "");
    row.textContent = sentence.text || "";
    row.addEventListener("click", () => {
      stopPresentationPlayAll();
      state.sentenceIndex = idx;
      renderSentence();
    });
    el.presentationTranscript.appendChild(row);
  });
  requestAnimationFrame(() => {
    const activeRow = el.presentationTranscript.querySelector(".presentation-transcript-row.active");
    if (activeRow) {
      const container = el.presentationTranscript;
      const rowRect = activeRow.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop += rowRect.top - containerRect.top
        - container.clientHeight / 2
        + activeRow.offsetHeight / 2;
    }
  });
}

function getDisplayTable() {
  if (state.displayTable && typeof state.displayTable === "object" && Object.keys(state.displayTable).length > 0) {
    return state.displayTable;
  }

  if (state.lesson && typeof state.lesson === "object") {
    const lessonTable = state.lesson.display_table;
    if (lessonTable && typeof lessonTable === "object" && Object.keys(lessonTable).length > 0) {
      return lessonTable;
    }
  }

  return {};
}

function normalizeExceptionWord(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9']+/g, "")
    .trim();
}

function ipaKey(tokens) {
  if (!Array.isArray(tokens)) {
    return "";
  }
  return tokens
    .map((token) => String(token || "").trim())
    .filter((token) => token)
    .join(" ");
}

function normalizeOverrideTokens(tokens, targetLen) {
  const normalized = Array.isArray(tokens)
    ? tokens.map((token) => String(token || ""))
    : [];
  const safeLen = Math.max(0, Number(targetLen) || 0);
  if (normalized.length < safeLen) {
    normalized.push(...new Array(safeLen - normalized.length).fill(""));
  }
  if (normalized.length > safeLen) {
    return normalized.slice(0, safeLen);
  }
  return normalized;
}

function parseDisplayExceptions(payload) {
  const output = {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return output;
  }

  const addRule = (wordNormRaw, ipaTokensRaw, zhuyinRaw) => {
    const wordNorm = normalizeExceptionWord(String(wordNormRaw || ""));
    if (!wordNorm || !Array.isArray(ipaTokensRaw) || !Array.isArray(zhuyinRaw)) {
      return;
    }
    const ipaTokens = ipaTokensRaw
      .map((token) => String(token || "").trim())
      .filter((token) => token);
    if (ipaTokens.length === 0) {
      return;
    }
    const key = ipaKey(ipaTokens);
    const zhuyin = normalizeOverrideTokens(zhuyinRaw, ipaTokens.length);
    if (!output[wordNorm]) {
      output[wordNorm] = {};
    }
    output[wordNorm][key] = zhuyin;
  };

  if (Array.isArray(payload.word_ipa_overrides)) {
    payload.word_ipa_overrides.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      addRule(item.word_norm, item.ipa, item.zhuyin_plus);
    });
    return output;
  }

  Object.entries(payload).forEach(([wordRaw, mapping]) => {
    const wordNorm = normalizeExceptionWord(wordRaw);
    if (!wordNorm || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return;
    }
    Object.entries(mapping).forEach(([ipaTextRaw, zhuyinRaw]) => {
      if (!Array.isArray(zhuyinRaw)) {
        return;
      }
      const ipaTokens = String(ipaTextRaw || "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token);
      if (ipaTokens.length === 0) {
        return;
      }
      const key = ipaKey(ipaTokens);
      const zhuyin = normalizeOverrideTokens(zhuyinRaw, ipaTokens.length);
      if (!output[wordNorm]) {
        output[wordNorm] = {};
      }
      output[wordNorm][key] = zhuyin;
    });
  });

  return output;
}

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

function saveRemoteLessonEdits(slug, lesson) {
  const edits = {};
  (lesson.sentences || []).forEach((sentence, sIdx) => {
    (sentence.words || []).forEach((word, wIdx) => {
      if (!word) return;
      const entry = {};
      if (Array.isArray(word.gold_ipa) && word.gold_ipa.length) entry.gold_ipa = word.gold_ipa;
      if (word.gold_token_details) entry.gold_token_details = word.gold_token_details;
      if (word.gold_display_edits && Object.keys(word.gold_display_edits).length) entry.gold_display_edits = word.gold_display_edits;
      if (word.notes) entry.notes = word.notes;
      if (Object.keys(entry).length) edits[`${sIdx}:${wIdx}`] = entry;
    });
  });
  try {
    localStorage.setItem(
      STORAGE_KEYS.remoteEditsPrefix + slug,
      JSON.stringify({ savedAt: new Date().toISOString(), edits })
    );
    state.remoteSavedToLocalStorage = true;
  } catch (e) {
    console.warn("Failed to save remote edits to localStorage:", e);
  }
}

function restoreRemoteLessonEdits(slug, lesson) {
  let stored;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.remoteEditsPrefix + slug);
    if (!raw) return false;
    stored = JSON.parse(raw);
  } catch (e) { return false; }
  const edits = stored?.edits;
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

function clearRemoteLessonEdits(slug) {
  localStorage.removeItem(STORAGE_KEYS.remoteEditsPrefix + slug);
  state.remoteSavedToLocalStorage = false;
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

function resolveDisplayExceptionZhuyin(wordText, ipaTokens) {
  if (!state.displayExceptions || typeof state.displayExceptions !== "object") {
    return null;
  }
  const wordNorm = normalizeExceptionWord(String(wordText || ""));
  if (!wordNorm) {
    return null;
  }
  const byWord = state.displayExceptions[wordNorm];
  if (!byWord || typeof byWord !== "object") {
    return null;
  }
  const key = ipaKey(ipaTokens);
  const candidate = byWord[key];
  if (!Array.isArray(candidate)) {
    return null;
  }
  return normalizeOverrideTokens(candidate, Array.isArray(ipaTokens) ? ipaTokens.length : 0);
}

function keyboardEntries() {
  const table = getDisplayTable();
  const compactMode = state.viewMode === "compact";
  const rows = Object.entries(table)
    .filter(([ipa]) => ipa)
    .map(([ipa, row]) => {
      const safeRow = row && typeof row === "object" ? row : {};
      const label = safeRow[state.displaySystem] || safeRow.ipa || ipa;
      const sortId = Number(safeRow.symbol_id || 0);
      return {
        ipa,
        label,
        insertToken: compactMode ? label : ipa,
        sortId,
      };
    });
  rows.sort((a, b) => {
    if (a.sortId !== b.sortId) {
      return a.sortId - b.sortId;
    }
    return a.ipa.localeCompare(b.ipa);
  });
  return rows;
}

function resetKeyboardHelp() {
  el.keyboardHelp.className = "";
  el.keyboardHelp.textContent = t("keyboardHelp");
}

function insertTokenToActiveGold(insertToken) {
  const target = state.activeGoldInput;
  if (!target || !document.body.contains(target)) {
    el.keyboardHelp.className = "status-error";
    el.keyboardHelp.textContent = t("keyboardNoFocus");
    return;
  }
  resetKeyboardHelp();
  target.focus();
  const currentValue = target.value || "";
  const start = typeof target.selectionStart === "number" ? target.selectionStart : currentValue.length;
  const end = typeof target.selectionEnd === "number" ? target.selectionEnd : currentValue.length;

  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const needsLeading = before.length > 0 && !/\s$/.test(before);
  const needsTrailing = after.length > 0 && !/^\s/.test(after);
  const insertText = `${needsLeading ? " " : ""}${insertToken}${needsTrailing ? " " : ""}`;

  target.value = `${before}${insertText}${after}`;
  const cursor = before.length + insertText.length;
  if (typeof target.setSelectionRange === "function") {
    target.setSelectionRange(cursor, cursor);
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderKeyboard() {
  const container = el.phonemeKeyboard;
  container.innerHTML = "";
  resetKeyboardHelp();
  const entries = keyboardEntries();
  entries.forEach((entry) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key-chip";
    btn.textContent = entry.label;
    btn.title = `IPA: ${entry.ipa}`;
    btn.addEventListener("click", () => insertTokenToActiveGold(entry.insertToken));
    container.appendChild(btn);
  });
}

function summarizeSyllableSlots(candidate, wordText = "") {
  const details = Array.isArray(candidate?.token_details) ? candidate.token_details : [];
  if (details.length === 0) {
    return "";
  }

  const shownTokens = displayTokensWithDetails(
    candidate?.display,
    candidate?.ipa,
    details,
    state.displaySystem,
    wordText,
  );
  const syllables = new Map();

  details.forEach((detail, idx) => {
    const syllableIndex = Number(detail.syllable_index || 0);
    const slot = String(detail.syllable_slot || "");
    if (!slot) {
      return;
    }
    if (!syllables.has(syllableIndex)) {
      syllables.set(syllableIndex, { C1: [], V: [], C2: [] });
    }

    const item = syllables.get(syllableIndex);
    const token = shownTokens[idx] || detail.phonetic_ipa || "";
    if (slot === "C1" || slot === "V" || slot === "C2") {
      item[slot].push(token);
    }
  });

  const keys = Array.from(syllables.keys()).sort((a, b) => a - b);
  const parts = [];
  keys.forEach((sylIdx) => {
    const item = syllables.get(sylIdx);
    const slotParts = [];
    if (item.C1.length > 0) {
      slotParts.push(`C1=${item.C1.join("+")}`);
    }
    if (item.V.length > 0) {
      slotParts.push(`V=${item.V.join("+")}`);
    }
    if (item.C2.length > 0) {
      slotParts.push(`C2=${item.C2.join("+")}`);
    }
    if (slotParts.length > 0) {
      parts.push(`S${sylIdx + 1}[${slotParts.join(" ")}]`);
    }
  });

  return parts.join(" | ");
}

function buildDisplayBundleFromTokens(ipaTokens) {
  const safeTokens = Array.isArray(ipaTokens) ? ipaTokens.filter((token) => token) : [];
  const table = getDisplayTable();
  const kk = [];
  const zhuyin = [];
  const symbolIds = [];

  safeTokens.forEach((token) => {
    const row = table[token] || {};
    kk.push(row.kk || token);
    zhuyin.push(row.zhuyin_plus || token);
    symbolIds.push(row.symbol_id || "");
  });

  return {
    ipa: [...safeTokens],
    kk,
    zhuyin_plus: zhuyin,
    symbol_ids: symbolIds,
  };
}

function getActiveProfile() {
  if (!state.profileConfig || !Array.isArray(state.profileConfig.profiles)) {
    return null;
  }
  const wanted = state.activeProfileId || state.profileConfig.default_profile;
  return state.profileConfig.profiles.find((profile) => profile.profile_id === wanted) || state.profileConfig.profiles[0] || null;
}

function ruleOrderMap(profile) {
  const order = new Map();
  const rulePriority = Array.isArray(profile?.rule_priority) ? profile.rule_priority : [];
  rulePriority.forEach((ruleId, idx) => {
    order.set(ruleId, idx);
  });
  return order;
}

function featureOrderMap(profile) {
  const order = new Map();
  const featurePriority = Array.isArray(profile?.feature_priority) ? profile.feature_priority : [];
  featurePriority.forEach((featureId, idx) => {
    order.set(featureId, idx);
  });
  return order;
}

function candidateRuleIds(candidate) {
  const allRuleIds = Array.isArray(candidate?.all_rule_ids) ? candidate.all_rule_ids : [];
  if (allRuleIds.length > 0) {
    return allRuleIds;
  }

  const surfaceRuleIds = Array.isArray(candidate?.surface_rule_ids) ? candidate.surface_rule_ids : [];
  const ruleIds = Array.isArray(candidate?.rule_ids) ? candidate.rule_ids : [];
  if (surfaceRuleIds.length === 0) {
    return ruleIds;
  }

  if (ruleIds.length === 0) {
    return surfaceRuleIds;
  }

  const merged = [...surfaceRuleIds];
  for (const id of ruleIds) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

function candidateHasRuleId(candidate, ruleId) {
  const wanted = String(ruleId || "").trim();
  if (!candidate || typeof candidate !== "object" || !wanted) {
    return false;
  }
  return candidateRuleIds(candidate).includes(wanted);
}

function pickSClusterHintCandidate(word) {
  const hasTokens = (candidate) => {
    return Array.isArray(candidate?.ipa) && candidate.ipa.some((token) => String(token || "").trim());
  };

  const pool = Array.isArray(word?.phonetic_candidates)
    ? word.phonetic_candidates.filter((candidate) => hasTokens(candidate))
    : [];

  if (pool.length > 0) {
    const profile = getActiveProfile();
    const sorted = [...pool].sort((a, b) => compareCandidatePriority(a, b, profile));
    const matched = sorted.find((candidate) => candidateHasRuleId(candidate, "s_cluster_stop_voicing_hint"));
    if (matched) {
      return matched;
    }
  }

  const teaching = word?.teaching_phonetic_candidate;
  if (hasTokens(teaching) && candidateHasRuleId(teaching, "s_cluster_stop_voicing_hint")) {
    return teaching;
  }

  return null;
}

function penaltyForRule(candidate, profile) {
  const penaltyMap = (profile && profile.rule_penalty) || {};
  const ruleIds = candidateRuleIds(candidate);
  let penalty = 0;
  for (const ruleId of ruleIds) {
    penalty += Number(penaltyMap[ruleId] || 0);
  }
  return penalty;
}

function penaltyForFeature(candidate, profile) {
  const penaltyMap = (profile && profile.feature_penalty) || {};
  const featureIds = Array.isArray(candidate.feature_ids) ? candidate.feature_ids : [];
  let penalty = 0;
  for (const featureId of featureIds) {
    penalty += Number(penaltyMap[featureId] || 0);
  }
  return penalty;
}

function candidatePriorityScore(candidate, profile) {
  const ruleOrder = ruleOrderMap(profile);
  const featureOrder = featureOrderMap(profile);

  const ruleIds = candidateRuleIds(candidate);
  const featureIds = Array.isArray(candidate.feature_ids) ? candidate.feature_ids : [];

  let bestRuleRank = 999;
  for (const ruleId of ruleIds) {
    if (ruleOrder.has(ruleId)) {
      bestRuleRank = Math.min(bestRuleRank, ruleOrder.get(ruleId));
    }
  }
  if (ruleIds.length === 0) {
    bestRuleRank = Math.min(bestRuleRank, 50);
  }

  let bestFeatureRank = 999;
  for (const featureId of featureIds) {
    if (featureOrder.has(featureId)) {
      bestFeatureRank = Math.min(bestFeatureRank, featureOrder.get(featureId));
    }
  }

  const baseCost = Number(candidate.cost || 0);
  const adjustedCost = baseCost + penaltyForRule(candidate, profile) + penaltyForFeature(candidate, profile);

  return {
    bestRuleRank,
    bestFeatureRank,
    adjustedCost,
    tokenLen: Array.isArray(candidate.ipa) ? candidate.ipa.length : 0,
  };
}

function compareCandidatePriority(a, b, profile) {
  const scoreA = candidatePriorityScore(a, profile);
  const scoreB = candidatePriorityScore(b, profile);
  if (scoreA.bestRuleRank !== scoreB.bestRuleRank) {
    return scoreA.bestRuleRank - scoreB.bestRuleRank;
  }
  if (scoreA.bestFeatureRank !== scoreB.bestFeatureRank) {
    return scoreA.bestFeatureRank - scoreB.bestFeatureRank;
  }
  if (scoreA.adjustedCost !== scoreB.adjustedCost) {
    return scoreA.adjustedCost - scoreB.adjustedCost;
  }
  if (scoreA.tokenLen !== scoreB.tokenLen) {
    return scoreA.tokenLen - scoreB.tokenLen;
  }
  return tokensToText(a.ipa || []).localeCompare(tokensToText(b.ipa || []));
}

function pickTeachingCandidateByProfile(word) {
  const candidates = Array.isArray(word.phonetic_candidates) ? word.phonetic_candidates : [];
  if (candidates.length === 0) {
    return null;
  }
  const profile = getActiveProfile();
  const sorted = [...candidates].sort((a, b) => compareCandidatePriority(a, b, profile));
  return sorted[0];
}

function applyProfileToSentence(sentence) {
  const words = Array.isArray(sentence.words) ? sentence.words : [];
  let changed = 0;
  for (const word of words) {
    const selected = pickTeachingCandidateByProfile(word);
    if (!selected) {
      continue;
    }
    const current = word.teaching_phonetic_candidate || {};
    const before = `${tokensToText(current.ipa || [])}|${Number(current.cost || 0)}`;
    const after = `${tokensToText(selected.ipa || [])}|${Number(selected.cost || 0)}`;
    if (before !== after) {
      word.teaching_phonetic_candidate = selected;
      changed += 1;
    }
  }
  return changed;
}

function displayTokens(displayValue, ipaTokens, system) {
  const ipaList = Array.isArray(ipaTokens) ? ipaTokens : [];
  if (system === "ipa") {
    return ipaList;
  }

  if (ipaList.length > 0) {
    const table = getDisplayTable();
    if (table && typeof table === "object" && Object.keys(table).length > 0) {
      return ipaList.map((token) => {
        const row = table[token] || {};
        const mapped = row[system];
        return mapped || token;
      });
    }
  }

  if (Array.isArray(displayValue)) {
    return displayValue;
  }

  if (displayValue && typeof displayValue === "object") {
    const direct = displayValue[system];
    if (Array.isArray(direct)) {
      return direct;
    }
    const fallback = displayValue.ipa;
    if (Array.isArray(fallback)) {
      return fallback;
    }
  }

  return ipaList;
}

function detailAt(tokenDetails, idx) {
  if (!Array.isArray(tokenDetails)) {
    return {};
  }
  const detail = tokenDetails[idx];
  return detail && typeof detail === "object" ? detail : {};
}

function detailSlot(tokenDetails, idx) {
  return String(detailAt(tokenDetails, idx).syllable_slot || "");
}

function detailPosition(tokenDetails, idx) {
  return String(detailAt(tokenDetails, idx).position || "");
}

function detailSyllableIndex(tokenDetails, idx) {
  const raw = detailAt(tokenDetails, idx).syllable_index;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function detailSlotIndex(tokenDetails, idx) {
  const raw = detailAt(tokenDetails, idx).slot_index;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function sameSyllable(tokenDetails, leftIdx, rightIdx) {
  const left = detailSyllableIndex(tokenDetails, leftIdx);
  const right = detailSyllableIndex(tokenDetails, rightIdx);
  if (left === null || right === null) {
    return true;
  }
  return left === right;
}

function adjacentOnsetSlots(tokenDetails, leftIdx, rightIdx) {
  if (detailSlot(tokenDetails, leftIdx) !== "C1") {
    return false;
  }
  if (detailSlot(tokenDetails, rightIdx) !== "C1") {
    return false;
  }
  if (!sameSyllable(tokenDetails, leftIdx, rightIdx)) {
    return false;
  }
  const leftSlot = detailSlotIndex(tokenDetails, leftIdx);
  const rightSlot = detailSlotIndex(tokenDetails, rightIdx);
  if (leftSlot === null || rightSlot === null) {
    return false;
  }
  return rightSlot === leftSlot + 1;
}

function slotAwareZhuyin(row, token, slot) {
  if (slot === "C1") {
    return row.zhuyin_plus_C1 || row.zhuyin_plus || token;
  }
  if (slot === "V") {
    return row.zhuyin_plus_V || row.zhuyin_plus || token;
  }
  if (slot === "C2") {
    return row.zhuyin_plus_C2 || row.zhuyin_plus || token;
  }
  return row.zhuyin_plus || token;
}

function contextualZhuyinOverride(ipaList, details, idx, reducedSchwaL) {
  const token = ipaList[idx] || "";
  const slot = detailSlot(details, idx);
  const hasNext = idx + 1 < ipaList.length;
  const nextToken = hasNext ? (ipaList[idx + 1] || "") : "";
  const nextSlot = detailSlot(details, idx + 1);
  const sameSyl = hasNext ? sameSyllable(details, idx, idx + 1) : false;

  const stressLevel = normalizeStressLevel(detailAt(details, idx).stress_level);
  if (
    token === "ə"
    && nextToken === "l"
    && idx + 1 === ipaList.length - 1
    && stressLevel === 0
    && nextSlot === "C2"
    && sameSyl
  ) {
    return { text: reducedSchwaL, mergeNext: true };
  }

  if (hasNext) {
    if (token === "ɔ" && nextToken === "ɹ" && nextSlot === "C2" && sameSyl) {
      return { text: "ㄛㄦ", mergeNext: true };
    }
    if (token === "ɛ" && nextToken === "ɹ" && nextSlot === "C2" && sameSyl) {
      return { text: "ㄝㄦ", mergeNext: true };
    }
    if ((token === "ɪ" || token === "i") && nextToken === "ɹ" && nextSlot === "C2" && sameSyl) {
      return { text: "ㄧㄦ", mergeNext: true };
    }
    if ((token === "ɑ" || token === "ɑː" || token === "a") && nextToken === "ɹ" && nextSlot === "C2" && sameSyl) {
      return { text: "ㄚ(喉)ㄦ", mergeNext: true };
    }
    if (token === "ɔ" && nextToken === "l" && nextSlot === "C2" && sameSyl) {
      return { text: "ㄛ", mergeNext: true };
    }

    if (
      token === "d"
      && nextToken === "z"
      && slot === "C2"
      && nextSlot === "C2"
      && idx + 1 === ipaList.length - 1
      && sameSyl
    ) {
      return { text: "ㄗ", mergeNext: true };
    }

    if (
      token === "t"
      && nextToken === "s"
      && slot === "C2"
      && nextSlot === "C2"
      && idx + 1 === ipaList.length - 1
      && sameSyl
    ) {
      return { text: "ㄘ", mergeNext: true };
    }

    if (token === "t" && nextToken === "ɹ" && adjacentOnsetSlots(details, idx, idx + 1)) {
      return { text: "ㄔㄨ", mergeNext: true };
    }
    if (token === "d" && nextToken === "ɹ" && adjacentOnsetSlots(details, idx, idx + 1)) {
      return { text: "ㄓㄨ", mergeNext: true };
    }
  }

  if (token === "k" && idx > 0 && ipaList[idx - 1] === "s" && adjacentOnsetSlots(details, idx - 1, idx)) {
    return { text: "ㄍ", mergeNext: false };
  }

  if (token === "p" && slot === "C1" && detailPosition(details, idx) === "intervocalic") {
    return { text: "ㄅ", mergeNext: false };
  }

  if (token === "l" && slot === "C2") {
    return { text: "ㄛ", mergeNext: false };
  }

  // Word-final unstressed /i/ (happy vowel: "ready", "sorry", "only") → ㄧ
  // Monosyllables (len ≤ 2: "he", "we", "be", "see") and stressed /i/ stay ㄧ(微).
  if (
    token === "i"
    && idx === ipaList.length - 1
    && ipaList.length > 2
    && normalizeStressLevel(detailAt(details, idx).stress_level) === 0
  ) {
    return { text: "ㄧ", mergeNext: false };
  }

  return null;
}

function displayTokensWithDetails(displayValue, ipaTokens, tokenDetails, system, wordText = "") {
  const baseTokens = displayTokens(displayValue, ipaTokens, system);
  if (system !== "zhuyin_plus") {
    return baseTokens;
  }

  const ipaList = Array.isArray(ipaTokens) ? ipaTokens : [];
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  if (ipaList.length === 0 || details.length === 0) {
    return baseTokens;
  }

  const table = getDisplayTable();
  if (!table || typeof table !== "object" || Object.keys(table).length === 0) {
    return baseTokens;
  }

  const lexicalOverride = resolveDisplayExceptionZhuyin(wordText, ipaList);
  if (lexicalOverride) {
    return lexicalOverride;
  }

  const mergedNextIndices = new Set();
  const reducedSchwaL = (table["əl"] && table["əl"].zhuyin_plus) || "ㄛ";

  return ipaList.map((token, idx) => {
    if (mergedNextIndices.has(idx)) {
      return "";
    }

    const row = table[token] || {};
    const override = contextualZhuyinOverride(ipaList, details, idx, reducedSchwaL);
    if (override) {
      if (override.mergeNext && idx + 1 < ipaList.length) {
        mergedNextIndices.add(idx + 1);
      }
      return override.text;
    }

    return slotAwareZhuyin(row, token, detailSlot(details, idx));
  });
}

function cloneTokenDetails(details) {
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .filter((item) => item && typeof item === "object")
    .map((item) => ({ ...item }));
}

function pickTokenDetailsForWordTokens(word, ipaTokens) {
  const wanted = tokensToText(ipaTokens || []);
  if (!wanted || !word || typeof word !== "object") {
    return [];
  }

  const sources = [];
  if (word.teaching_phonetic_candidate && typeof word.teaching_phonetic_candidate === "object") {
    sources.push(word.teaching_phonetic_candidate);
  }
  if (Array.isArray(word.phonetic_candidates)) {
    sources.push(...word.phonetic_candidates);
  }
  if (word.best_surface_candidate && typeof word.best_surface_candidate === "object") {
    sources.push(word.best_surface_candidate);
  }
  if (Array.isArray(word.surface_candidates)) {
    sources.push(...word.surface_candidates);
  }

  sources.push({ ipa: word.canonical_ipa, token_details: word.canonical_token_details });
  sources.push({ ipa: word.observed_ipa, token_details: word.observed_token_details });
  sources.push({ ipa: word.gold_ipa, token_details: word.gold_token_details });

  for (const source of sources) {
    const ipa = Array.isArray(source?.ipa) ? source.ipa : [];
    if (tokensToText(ipa) !== wanted) {
      continue;
    }
    const details = cloneTokenDetails(source?.token_details);
    if (details.length > 0) {
      return details;
    }
  }

  return [];
}

function updateGoldTokenDetailsForEditedTokens(word, newTokens) {
  const matched = pickTokenDetailsForWordTokens(word, newTokens);
  if (matched.length > 0) {
    word.gold_token_details = matched;
    return;
  }

  const previous = cloneTokenDetails(word.gold_token_details);
  if (previous.length > 0 && previous.length === newTokens.length) {
    word.gold_token_details = newTokens.map((token, idx) => {
      const prev = previous[idx] || {};
      return {
        ...prev,
        index: idx,
        base_ipa: token,
        phonetic_ipa: token,
      };
    });
    return;
  }

  word.gold_token_details = [];
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

function updateDisplayHeaders() {
  const label = DISPLAY_LABEL[state.uiLanguage][state.displaySystem] || state.displaySystem;
  el.canonicalHeader.textContent = t("canonicalHeader", label);
  el.candidatesHeader.textContent = t("candidatesHeader", label);
  el.phoneticHeader.textContent = t("phoneticHeader", label);
  el.observedHeader.textContent = t("observedHeader", label);
}

function sanitizeFilePart(raw, fallback = "lesson") {
  const value = String(raw || "").trim();
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || fallback;
}

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

function uint16le(value) {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, Number(value) >>> 0, true);
  return buffer;
}

function uint32le(value) {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, Number(value) >>> 0, true);
  return buffer;
}

function concatUint8Arrays(parts) {
  const safeParts = Array.isArray(parts) ? parts.filter((part) => part instanceof Uint8Array) : [];
  const total = safeParts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  safeParts.forEach((part) => {
    merged.set(part, offset);
    offset += part.byteLength;
  });
  return merged;
}

function crc32OfBytes(bytes) {
  let crc = 0xFFFFFFFF;
  for (let idx = 0; idx < bytes.length; idx += 1) {
    const code = bytes[idx];
    crc = CRC32_TABLE[(crc ^ code) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = Math.max(1, Math.min(12, date.getMonth() + 1));
  const day = Math.max(1, Math.min(31, date.getDate()));
  const hour = Math.max(0, Math.min(23, date.getHours()));
  const minute = Math.max(0, Math.min(59, date.getMinutes()));
  const second = Math.max(0, Math.min(59, date.getSeconds()));

  const dosTime = ((hour & 0x1F) << 11) | ((minute & 0x3F) << 5) | ((Math.floor(second / 2)) & 0x1F);
  const dosDate = (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F);
  return { dosTime, dosDate };
}

function sanitizeZipPath(pathText) {
  const normalized = normalizeLocalRelativePath(pathText);
  return normalized.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

function normalizeZipEntryInput(entries) {
  const output = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const path = sanitizeZipPath(entry.path);
    if (!path || seen.has(path)) {
      return;
    }
    const bytesRaw = entry.bytes;
    if (!(bytesRaw instanceof Uint8Array)) {
      return;
    }
    seen.add(path);
    output.push({
      path,
      bytes: bytesRaw,
      lastModified: Number(entry.lastModified || Date.now()),
    });
  });
  return output;
}

function buildZipBlob(entries) {
  const safeEntries = normalizeZipEntryInput(entries);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  safeEntries.forEach((entry) => {
    const pathBytes = UTF8_ENCODER.encode(entry.path);
    const contentBytes = entry.bytes;
    const crc = crc32OfBytes(contentBytes);
    const { dosTime, dosDate } = dosDateTime(new Date(entry.lastModified));

    const localHeader = concatUint8Arrays([
      uint32le(0x04034B50),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(contentBytes.byteLength),
      uint32le(contentBytes.byteLength),
      uint16le(pathBytes.byteLength),
      uint16le(0),
      pathBytes,
      contentBytes,
    ]);

    const centralHeader = concatUint8Arrays([
      uint32le(0x02014B50),
      uint16le(0x0314),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(contentBytes.byteLength),
      uint32le(contentBytes.byteLength),
      uint16le(pathBytes.byteLength),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint32le(0),
      uint32le(offset),
      pathBytes,
    ]);

    localParts.push(localHeader);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const localSection = concatUint8Arrays(localParts);
  const eocd = concatUint8Arrays([
    uint32le(0x06054B50),
    uint16le(0),
    uint16le(0),
    uint16le(safeEntries.length),
    uint16le(safeEntries.length),
    uint32le(centralDirectory.byteLength),
    uint32le(localSection.byteLength),
    uint16le(0),
  ]);

  return new Blob([localSection, centralDirectory, eocd], { type: "application/zip" });
}

function triggerBlobDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
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
  // Use style.display directly — avoids CSS specificity issues with the hidden attribute
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

function renderPresentationLessonMeta() {
  if (!el.presentationLessonMeta || !state.lesson) return;
  const name = state.lesson.display_name || state.currentLessonKey || "";
  const count = Array.isArray(state.lesson.sentences) ? state.lesson.sentences.length : 0;
  el.presentationLessonMeta.textContent = state.uiLanguage === "zh-TW"
    ? `${name}　${count} 句`
    : `${name} · ${count} sentences`;
}

function getCurrentSentence() {
  if (!state.lesson || !Array.isArray(state.lesson.sentences) || state.lesson.sentences.length === 0) {
    return null;
  }
  ensureSentenceIndexInBounds();
  return state.lesson.sentences[state.sentenceIndex] || null;
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

  const duration = getAudioDurationSec();
  let start = Number(baseRange.start) + Number(state.audioStartOffsetSec || 0);
  let end = Number(baseRange.end) + Number(state.audioEndOffsetSec || 0);

  start = Math.max(0, start);
  end = Math.max(0, end);

  if (Number.isFinite(duration)) {
    start = Math.min(start, duration);
    end = Math.min(end, duration);
  }

  if (end < start) {
    end = start;
  }

  state.audioRangeStartSec = start;
  state.audioRangeEndSec = end;
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

  try {
    audio.currentTime = start;
  } catch {
    // Ignore seek errors before metadata is ready.
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
  try {
    audio.currentTime = start;
  } catch {
    // Ignore seek errors before metadata is ready.
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

    try {
      audio.currentTime = restartStart;
    } catch {
      // Ignore seek errors before metadata is ready.
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        state.loopRestartFromTimer = false;
        // Ignore autoplay/play interruption errors.
      });
    }
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
    try {
      audio.currentTime = start;
    } catch {
      // Ignore seek errors before metadata is ready.
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

function buildQuickFillOptionElement(value, labelText) {
  const option = document.createElement("option");
  option.value = String(value || "");
  option.textContent = String(labelText || "");
  return option;
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

function renderWordRows(sentence) {
  state.activeGoldInput = null;
  el.wordTableBody.innerHTML = "";
  const words = Array.isArray(sentence.words) ? sentence.words : [];

  words.forEach((word) => {
    const node = el.wordRowTemplate.content.firstElementChild.cloneNode(true);

    node.querySelector(".word-text").textContent = word.word || "";
    node.querySelector(".word-time").textContent = `${fmtTime(word.start_sec)} - ${fmtTime(word.end_sec)}`;

    const canonicalTokens = displayTokensWithDetails(
      word.canonical_display,
      word.canonical_ipa,
      word.canonical_token_details,
      state.displaySystem,
      word.word,
    );
    const observedTokens = displayTokensWithDetails(
      word.observed_display,
      word.observed_ipa,
      word.observed_token_details,
      state.displaySystem,
      word.word,
    );
    renderTokenSequence(node.querySelector(".canonical"), canonicalTokens, word.canonical_token_details);
    renderTokenSequence(node.querySelector(".observed"), observedTokens, word.observed_token_details);

    const candidatesCell = node.querySelector(".candidates");
    const candidates = Array.isArray(word.surface_candidates) ? word.surface_candidates : [];
    candidates.forEach((candidate) => {
      const chip = document.createElement("div");
      chip.className = "candidate-chip";
      const best = word.best_surface_candidate
        && tokensToText(word.best_surface_candidate.ipa) === tokensToText(candidate.ipa)
        && Number(word.best_surface_candidate.cost || 0) === Number(candidate.cost || 0);
      if (best) {
        chip.classList.add("best");
      }

      const ipaDiv = document.createElement("div");
      ipaDiv.className = "candidate-ipa";
      ipaDiv.textContent = tokensToText(displayTokensWithDetails(
        candidate.display,
        candidate.ipa,
        candidate.token_details,
        state.displaySystem,
        word.word,
      ));
      chip.appendChild(ipaDiv);

      const metaDiv = document.createElement("div");
      metaDiv.className = "candidate-meta";
      const ruleIds = Array.isArray(candidate.rule_ids) && candidate.rule_ids.length > 0
        ? candidate.rule_ids.map((id) => localizeRule(id)).join(",")
        : localizeRule("base_surface");
      metaDiv.textContent = `${t("profileRules")}=${ruleIds}, ${t("profileCost")}=${Number(candidate.cost || 0).toFixed(2)}`;
      chip.appendChild(metaDiv);

      candidatesCell.appendChild(chip);
    });

    const phoneticCell = node.querySelector(".phonetic-detail");
    const phoneticCandidates = Array.isArray(word.phonetic_candidates) ? [...word.phonetic_candidates] : [];
    const profile = getActiveProfile();
    phoneticCandidates.sort((a, b) => compareCandidatePriority(a, b, profile));

    const profileRecommended = phoneticCandidates.length > 0 ? phoneticCandidates[0] : null;
    const selectedPhonetic = word.teaching_phonetic_candidate || profileRecommended || null;

    phoneticCandidates.forEach((candidate) => {
      const chip = document.createElement("div");
      chip.className = "phonetic-chip";
      const isRecommended = profileRecommended
        && tokensToText(profileRecommended.ipa || []) === tokensToText(candidate.ipa || [])
        && Number(profileRecommended.cost || 0) === Number(candidate.cost || 0);
      const isSelected = selectedPhonetic
        && tokensToText(selectedPhonetic.ipa || []) === tokensToText(candidate.ipa || [])
        && Number(selectedPhonetic.cost || 0) === Number(candidate.cost || 0);

      if (isRecommended) {
        chip.classList.add("recommended");
      }
      if (isSelected) {
        chip.classList.add("selected");
      }

      const ipaDiv = document.createElement("div");
      ipaDiv.className = "phonetic-ipa";
      ipaDiv.textContent = tokensToText(displayTokensWithDetails(
        candidate.display,
        candidate.ipa,
        candidate.token_details,
        state.displaySystem,
        word.word,
      ));
      chip.appendChild(ipaDiv);

      const metaDiv = document.createElement("div");
      metaDiv.className = "phonetic-meta";
      const rankedRules = candidateRuleIds(candidate);
      const rules = rankedRules.length > 0
        ? rankedRules.map((id) => localizeRule(id)).join(",")
        : localizeRule("base_surface");
      const features = Array.isArray(candidate.feature_ids) && candidate.feature_ids.length > 0
        ? candidate.feature_ids.map((id) => localizeFeature(id)).join(",")
        : "none";
      const tags = [];
      if (isRecommended) {
        tags.push(localizeTag("profile_recommended"));
      }
      if (isSelected) {
        tags.push(localizeTag("saved_default"));
      }
      const tagText = tags.length > 0 ? `, ${t("profileTags")}=${tags.join("+")}` : "";
      metaDiv.textContent = `${t("profileRules")}=${rules}, ${t("profileFeatures")}=${features}, ${t("profileCost")}=${Number(candidate.cost || 0).toFixed(2)}${tagText}`;
      chip.appendChild(metaDiv);

      phoneticCell.appendChild(chip);
    });

    const goldInput = node.querySelector(".gold-input");
    const notesInput = node.querySelector(".notes-input");
    const goldDisplay = node.querySelector(".gold-display");
    const quickFillLabel = node.querySelector(".gold-quick-fill-label");
    const quickFillSelect = node.querySelector(".gold-quick-fill-select");

    const initialGoldTokens = getCompactGoldTokens(word, state.displaySystem);
    const initialGoldText = tokensToText(initialGoldTokens);
    const initialNotesText = word.notes || "";
    goldInput.value = initialGoldText;
    notesInput.value = initialNotesText;
    if (quickFillLabel) {
      quickFillLabel.textContent = t("quickFillLabel");
    }

    const renderGoldDisplayValue = (overrideTokens = null) => {
      const displayLabel = DISPLAY_LABEL[state.uiLanguage][state.displaySystem] || state.displaySystem;
      if (state.displaySystem === "ipa") {
        const fallbackIpa = getFallbackGoldIpaTokens(word);
        const fallbackDetails = pickTokenDetailsForWordTokens(word, fallbackIpa);
        const goldDisplayTokens = displayTokensWithDetails(
          word.gold_display,
          fallbackIpa,
          fallbackDetails,
          state.displaySystem,
          word.word,
        );
        renderLabeledTokenSequence(goldDisplay, displayLabel, goldDisplayTokens, fallbackDetails);
        return;
      }

      const shownTokens = Array.isArray(overrideTokens)
        ? overrideTokens
        : getCompactGoldTokens(word, state.displaySystem);
      renderLabeledTokenSequence(goldDisplay, displayLabel, shownTokens, []);
    };

    renderGoldDisplayValue();

    if (quickFillSelect) {
      quickFillSelect.appendChild(buildQuickFillOptionElement("", t("quickFillPlaceholder")));

      const quickOptions = gatherGoldQuickFillOptions(word, state.displaySystem);
      quickOptions.forEach((optionItem) => {
        quickFillSelect.appendChild(buildQuickFillOptionElement(optionItem.key, `${optionItem.label}: ${optionItem.key}`));
      });

      quickFillSelect.value = "";
      quickFillSelect.disabled = quickOptions.length === 0;

      quickFillSelect.addEventListener("change", () => {
        const picked = quickOptions.find((optionItem) => optionItem.key === quickFillSelect.value);
        if (!picked) {
          return;
        }
        if (state.displaySystem === "ipa") {
          applyGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, picked.tokens);
        } else {
          applyDisplayGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, picked.tokens);
        }
        quickFillSelect.value = "";
      });
    }

    goldInput.addEventListener("input", () => {
      const newTokens = normalizeTokenSequence(goldInput.value);
      if (state.displaySystem === "ipa") {
        applyGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, newTokens);
      } else {
        applyDisplayGoldInputValue(word, goldInput, renderGoldDisplayValue, initialGoldText, newTokens);
      }
    });

    goldInput.addEventListener("focus", () => {
      state.activeGoldInput = goldInput;
      resetKeyboardHelp();
    });

    goldInput.addEventListener("click", () => {
      state.activeGoldInput = goldInput;
      resetKeyboardHelp();
    });

    notesInput.addEventListener("input", () => {
      word.notes = notesInput.value;
      if ((word.notes || "") !== initialNotesText) {
        notesInput.classList.add("changed");
      } else {
        notesInput.classList.remove("changed");
      }
      markServerDirty(true);
      markDirty(true);
    });

    el.wordTableBody.appendChild(node);
  });
}

function renderCompactRows(sentence) {
  state.activeGoldInput = null;
  el.compactWordGrid.innerHTML = "";
  const words = Array.isArray(sentence.words) ? sentence.words : [];
  const displayLabel = DISPLAY_LABEL[state.uiLanguage][state.displaySystem] || state.displaySystem;

  words.forEach((word) => {
    const node = el.compactWordTemplate.content.firstElementChild.cloneNode(true);

    node.querySelector(".word-text").textContent = word.word || "";
    node.querySelector(".gold-label").textContent = t("compactGoldHeader", displayLabel);

    const compactGoldInput = node.querySelector(".compact-gold-input");
    const initialTokens = getCompactGoldTokens(word, state.displaySystem);
    const initialText = tokensToText(initialTokens);
    compactGoldInput.value = initialText;

    const quickOptions = gatherGoldQuickFillOptions(word, state.displaySystem);
    if (quickOptions.length > 0) {
      const actionRow = document.createElement("div");
      actionRow.className = "compact-row";

      const quickLabel = document.createElement("div");
      quickLabel.className = "compact-label";
      quickLabel.textContent = t("quickFillLabel");
      actionRow.appendChild(quickLabel);

      const quickSelect = document.createElement("select");
      quickSelect.className = "gold-quick-fill-select";
      quickSelect.appendChild(buildQuickFillOptionElement("", t("quickFillPlaceholder")));
      quickOptions.forEach((optionItem) => {
        quickSelect.appendChild(buildQuickFillOptionElement(optionItem.key, `${optionItem.label}: ${optionItem.key}`));
      });
      quickSelect.value = "";
      quickSelect.addEventListener("change", () => {
        const picked = quickOptions.find((optionItem) => optionItem.key === quickSelect.value);
        if (!picked) {
          return;
        }
        applyCompactGoldInputValue(word, compactGoldInput, initialText, picked.tokens);
        quickSelect.value = "";
      });

      actionRow.appendChild(quickSelect);
      node.appendChild(actionRow);
    }

    compactGoldInput.addEventListener("input", () => {
      const newTokens = normalizeTokenSequence(compactGoldInput.value);
      applyCompactGoldInputValue(word, compactGoldInput, initialText, newTokens);
    });

    compactGoldInput.addEventListener("focus", () => {
      state.activeGoldInput = compactGoldInput;
      resetKeyboardHelp();
    });

    compactGoldInput.addEventListener("click", () => {
      state.activeGoldInput = compactGoldInput;
      resetKeyboardHelp();
    });

    el.compactWordGrid.appendChild(node);
  });
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

function rerenderPresentationIfActive() {
  if (state.viewMode !== "presentation") {
    return;
  }
  const sentence = getCurrentSentence();
  renderPresentationSentence(sentence);
}

let presentationResizeRafId = null;

function requestPresentationLayoutRefresh() {
  if (presentationResizeRafId !== null) {
    return;
  }
  presentationResizeRafId = window.requestAnimationFrame(() => {
    presentationResizeRafId = null;
    rerenderPresentationIfActive();
  });
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

function buildLessonPayloadForDownload() {
  if (!state.lesson) {
    return null;
  }
  const payload = JSON.parse(JSON.stringify(state.lesson));
  if (payload && typeof payload === "object") {
    delete payload._meta;
  }
  return payload;
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

function bindEvents() {
  el.languageSelect.addEventListener("change", () => {
    state.uiLanguage = el.languageSelect.value === "en" ? "en" : "zh-TW";
    persistPreference(STORAGE_KEYS.language, state.uiLanguage);
    applyLanguage();
  });

  el.lessonSelect.addEventListener("change", () => {
    switchLessonByKey(el.lessonSelect.value);
  });

  if (el.localLessonDirInput) {
    el.localLessonDirInput.addEventListener("change", () => {
      const files = el.localLessonDirInput.files;
      if (!files || files.length === 0) {
        setLocalLessonStatus("error", t("localLessonNoFiles"));
        return;
      }
      importLocalLessonDirectory(files);
    });
  }

  if (el.loadRemoteLessonBtn) {
    el.loadRemoteLessonBtn.addEventListener("click", () => {
      const slug = el.remoteCatalogSelect ? el.remoteCatalogSelect.value : "";
      if (slug) loadRemoteLesson(slug);
    });
  }

  if (el.changeLessonBtn) {
    el.changeLessonBtn.addEventListener("click", () => {
      goToEntryScreen();
    });
  }

  if (el.entryLoadRemoteBtn) {
    el.entryLoadRemoteBtn.addEventListener("click", () => {
      const slug = el.entryCatalogSelect ? el.entryCatalogSelect.value : "";
      if (slug) loadRemoteLesson(slug);
    });
  }

  if (el.entryLocalDirInput) {
    el.entryLocalDirInput.addEventListener("change", () => {
      const files = el.entryLocalDirInput.files;
      if (!files || files.length === 0) {
        if (el.entryLocalStatus) el.entryLocalStatus.textContent = t("localLessonNoFiles");
        return;
      }
      importLocalLessonDirectory(files);
    });
  }

  if (el.clearRemoteEditsBtn) {
    el.clearRemoteEditsBtn.addEventListener("click", () => {
      const slug = (state.currentLessonKey || "").replace("remote:", "");
      if (!slug) return;
      clearRemoteLessonEdits(slug);
      const selectSlug = el.remoteCatalogSelect ? el.remoteCatalogSelect.value : slug;
      loadRemoteLesson(selectSlug || slug);
    });
  }

  el.sentenceSelect.addEventListener("change", () => {
    const idx = Number(el.sentenceSelect.value);
    if (!Number.isNaN(idx)) {
      stopPresentationPlayAll();
      state.sentenceIndex = idx;
      renderSentence();
    }
  });

  el.prevSentenceBtn.addEventListener("click", () => jumpToSentence(-1));
  el.nextSentenceBtn.addEventListener("click", () => jumpToSentence(1));
  if (el.compactPrevSentenceBtn) {
    el.compactPrevSentenceBtn.addEventListener("click", () => jumpToSentence(-1));
  }
  if (el.compactNextSentenceBtn) {
    el.compactNextSentenceBtn.addEventListener("click", () => jumpToSentence(1));
  }

  el.loopSentenceCheckbox.addEventListener("change", () => {
    state.loopSentence = !!el.loopSentenceCheckbox.checked;
    persistPreference(STORAGE_KEYS.loopSentence, state.loopSentence ? "1" : "0");
    if (!state.loopSentence) {
      resetLoopPlaybackState();
    }
    updatePresentationLoopToggleButton();
  });

  el.loopGapInput.addEventListener("change", () => {
    applyLoopGapInputValue(el.loopGapInput.value, true);
  });

  el.loopGapInput.addEventListener("blur", () => {
    applyLoopGapInputValue(el.loopGapInput.value, false);
  });

  el.loopCountInput.addEventListener("input", () => {
    const sanitized = normalizeLoopCountInputValue(el.loopCountInput.value);
    if (el.loopCountInput.value !== sanitized) {
      el.loopCountInput.value = sanitized;
    }
  });

  el.loopCountInput.addEventListener("change", () => {
    applyLoopCountInputValue(el.loopCountInput.value, true);
    if (state.loopSentence && !canScheduleNextLoopPlayback()) {
      resetLoopPlaybackState();
    }
  });

  el.loopCountInput.addEventListener("blur", () => {
    applyLoopCountInputValue(el.loopCountInput.value, false);
  });

  el.audioStartOffsetMinusBtn.addEventListener("click", () => {
    nudgeCurrentSentenceOffset("start", -AUDIO_OFFSET_QUICK_STEP_SEC);
  });

  el.audioStartOffsetPlusBtn.addEventListener("click", () => {
    nudgeCurrentSentenceOffset("start", AUDIO_OFFSET_QUICK_STEP_SEC);
  });

  el.audioEndOffsetMinusBtn.addEventListener("click", () => {
    nudgeCurrentSentenceOffset("end", -AUDIO_OFFSET_QUICK_STEP_SEC);
  });

  el.audioEndOffsetPlusBtn.addEventListener("click", () => {
    nudgeCurrentSentenceOffset("end", AUDIO_OFFSET_QUICK_STEP_SEC);
  });

  el.audioStartOffsetInput.addEventListener("change", () => {
    applyOffsetInputChange("start");
  });

  el.audioStartOffsetInput.addEventListener("blur", () => {
    renderAudioOffsetControls();
  });

  el.audioEndOffsetInput.addEventListener("change", () => {
    applyOffsetInputChange("end");
  });

  el.audioEndOffsetInput.addEventListener("blur", () => {
    renderAudioOffsetControls();
  });

  el.resetAudioOffsetsBtn.addEventListener("click", () => {
    applyAudioOffsetsForCurrentSentence(0, 0, false);
  });

  el.sentenceAudio.addEventListener("loadedmetadata", () => {
    applyPresentationPlaybackRate(state.presentationPlaybackRate, false);
    refreshAudioRangeFromState();
    renderAudioOffsetControls();
    syncAudioToSentenceStart(true);
    playPendingPresentationPlayAll();
    updatePresentationPlayPauseButton();
  });

  el.sentenceAudio.addEventListener("play", () => {
    handleAudioPlayEvent();
    updatePresentationPlayPauseButton();
  });

  el.sentenceAudio.addEventListener("pause", () => {
    if (!state.loopSentence) {
      cancelLoopRestartTimer();
    }
    handleAudioPauseDuringPresentationPlayAll();
    updatePresentationPlayPauseButton();
  });

  el.sentenceAudio.addEventListener("ended", () => {
    state.presentationPlayAllLastEndedAtMs = Date.now();
    updatePresentationPlayPauseButton();
    if (state.presentationPlayAllActive) {
      advancePresentationPlayAll();
      return;
    }
    if (!state.loopSentence) {
      return;
    }
    if (!canAutoLoopAfterManualEnd()) {
      pauseAudioAtRangeStart();
      return;
    }
    scheduleLoopRestart();
  });

  el.sentenceAudio.addEventListener("seeking", () => {
    enforceAudioPlaybackRange();
  });

  el.sentenceAudio.addEventListener("timeupdate", () => {
    enforceAudioPlaybackRange();
  });

  el.displaySystemSelect.addEventListener("change", () => {
    state.displaySystem = el.displaySystemSelect.value || "ipa";
    persistPreference(STORAGE_KEYS.displaySystem, state.displaySystem);
    if (el.presentationDisplaySystemSelect) {
      el.presentationDisplaySystemSelect.value = state.displaySystem;
    }
    renderKeyboard();
    renderSentence();
  });

  el.compactViewBtn.addEventListener("click", () => {
    setViewMode("compact");
  });

  el.detailedViewBtn.addEventListener("click", () => {
    setViewMode("detailed");
  });

  if (el.presentationViewBtn) {
    el.presentationViewBtn.addEventListener("click", () => {
      setViewMode("presentation");
    });
  }

  if (el.presentationReturnBtn) {
    el.presentationReturnBtn.addEventListener("click", () => {
      setViewMode("compact");
    });
  }

  if (el.presentationPrevSentenceBtn) {
    el.presentationPrevSentenceBtn.addEventListener("click", () => {
      const keepPlayAll = state.presentationPlayAllActive;
      jumpToSentence(-1, { preservePlayAll: keepPlayAll, autoplayAfterJump: keepPlayAll });
    });
  }

  if (el.presentationNextSentenceBtn) {
    el.presentationNextSentenceBtn.addEventListener("click", () => {
      const keepPlayAll = state.presentationPlayAllActive;
      jumpToSentence(1, { preservePlayAll: keepPlayAll, autoplayAfterJump: keepPlayAll });
    });
  }

  if (el.presentationPlayPauseBtn) {
    el.presentationPlayPauseBtn.addEventListener("click", () => {
      toggleSentencePlayback();
    });
  }

  if (el.presentationPlayAllBtn) {
    el.presentationPlayAllBtn.addEventListener("click", () => {
      togglePresentationPlayAll();
    });
  }

  if (el.presentationLoopToggleBtn) {
    el.presentationLoopToggleBtn.addEventListener("click", () => {
      state.loopSentence = !state.loopSentence;
      el.loopSentenceCheckbox.checked = state.loopSentence;
      persistPreference(STORAGE_KEYS.loopSentence, state.loopSentence ? "1" : "0");
      if (!state.loopSentence) {
        resetLoopPlaybackState();
      }
      updatePresentationLoopToggleButton();
    });
  }

  if (el.presentationLoopToggleBtn) {
    el.presentationLoopToggleBtn.addEventListener("mouseenter", () => {
      el.presentationLoopToggleBtn.title = state.loopSentence
        ? t("presentationLoopHintOn")
        : t("presentationLoopHintOff");
    });
  }

  if (el.presentationLoopGapInput) {
    el.presentationLoopGapInput.addEventListener("change", () => {
      applyLoopGapInputValue(el.presentationLoopGapInput.value, true);
    });
    el.presentationLoopGapInput.addEventListener("blur", () => {
      applyLoopGapInputValue(el.presentationLoopGapInput.value, false);
    });
  }

  if (el.presentationLoopCountInput) {
    el.presentationLoopCountInput.addEventListener("input", () => {
      const sanitized = normalizeLoopCountInputValue(el.presentationLoopCountInput.value);
      if (el.presentationLoopCountInput.value !== sanitized) {
        el.presentationLoopCountInput.value = sanitized;
      }
    });
    el.presentationLoopCountInput.addEventListener("change", () => {
      applyLoopCountInputValue(el.presentationLoopCountInput.value, true);
      if (state.loopSentence && !canScheduleNextLoopPlayback()) {
        resetLoopPlaybackState();
      }
    });
    el.presentationLoopCountInput.addEventListener("blur", () => {
      applyLoopCountInputValue(el.presentationLoopCountInput.value, false);
    });
  }

  if (el.presentationDisplaySystemSelect) {
    el.presentationDisplaySystemSelect.addEventListener("change", () => {
      state.displaySystem = el.presentationDisplaySystemSelect.value || "ipa";
      el.displaySystemSelect.value = state.displaySystem;
      persistPreference(STORAGE_KEYS.displaySystem, state.displaySystem);
      renderKeyboard();
      renderSentence();
    });
  }

  if (el.presentationSpeedSelect) {
    el.presentationSpeedSelect.addEventListener("change", () => {
      applyPresentationPlaybackRate(el.presentationSpeedSelect.value, true);
    });
  }

  if (el.presentationPhonemeToggleBtn) {
    el.presentationPhonemeToggleBtn.addEventListener("click", () => {
      applyPresentationPhonemeVisibility(!state.presentationShowPhonemes, true);
    });
  }

  el.downloadLessonBtn.addEventListener("click", () => {
    downloadEditedLessonJson();
  });

  if (el.downloadOfflineZipBtn) {
    el.downloadOfflineZipBtn.addEventListener("click", () => {
      downloadOfflineLessonZip();
    });
  }

  el.phoneticProfileSelect.addEventListener("change", () => {
    state.activeProfileId = el.phoneticProfileSelect.value || null;
    persistPreference(STORAGE_KEYS.profile, state.activeProfileId || "");
    renderProfileOptions();
    renderSentence();
  });

  el.applyProfileSentenceBtn.addEventListener("click", () => {
    if (!state.lesson || !Array.isArray(state.lesson.sentences)) {
      return;
    }
    const sentence = state.lesson.sentences[state.sentenceIndex];
    if (!sentence) {
      return;
    }
    const changed = applyProfileToSentence(sentence);
    if (changed > 0) {
      markServerDirty(true);
      markDirty(true);
      el.saveStatus.textContent = t("profileAppliedChanged", changed, sentence.sentence_id);
      el.saveStatus.className = "status-unsaved";
    } else {
      setSavedStatus(t("profileAppliedNoChange", sentence.sentence_id));
    }
    renderSentence();
  });

  el.showDetailsCheckbox.addEventListener("change", () => {
    state.showDetails = el.showDetailsCheckbox.checked;
    applyShowDetailsMode();
  });

  el.saveBtn.addEventListener("click", () => {
    if (state.viewMode === "compact" || state.viewMode === "presentation") {
      renderSaveStatus();
      return;
    }
    saveLesson();
  });

  el.transcriptEditor.addEventListener("input", () => {
    const changed = normalizeTextContent(el.transcriptEditor.value) !== state.transcriptOriginal;
    markTranscriptDirty(changed);
  });

  el.saveTranscriptBtn.addEventListener("click", () => {
    saveTranscript();
  });

  el.buildCommandBtn.addEventListener("click", () => {
    generateRebuildCommand();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty && !state.transcriptDirty && !state.compactDirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("pagehide", () => {
    releaseLocalAudioUrls();
  });

  window.addEventListener("keydown", handleGlobalPresentationHotkeys);
  window.addEventListener("resize", requestPresentationLayoutRefresh);
}

function initializeControlsFromState() {
  stopPresentationPlayAll();
  el.languageSelect.value = state.uiLanguage;
  el.displaySystemSelect.value = state.displaySystem;
  if (el.presentationDisplaySystemSelect) {
    el.presentationDisplaySystemSelect.value = state.displaySystem;
  }
  if (el.presentationSpeedSelect) {
    el.presentationSpeedSelect.innerHTML = "";
    PRESENTATION_PLAYBACK_RATES.forEach((rate) => {
      const option = document.createElement("option");
      option.value = formatPresentationPlaybackRate(rate);
      option.textContent = `${formatPresentationPlaybackRate(rate)}x`;
      el.presentationSpeedSelect.appendChild(option);
    });
    syncPresentationSpeedInput();
  }
  el.loopSentenceCheckbox.checked = state.loopSentence;
  el.loopGapInput.min = "0";
  el.loopGapInput.max = String(LOOP_GAP_MAX_SEC);
  el.loopGapInput.step = formatOffsetStepValue(LOOP_GAP_STEP_SEC);
  el.loopGapInput.value = formatOffsetStepValue(state.loopGapSec);
  syncPresentationLoopGapInput();
  applyLoopCountInputValue(buildLoopCountDisplayValue(), false);
  state.loopRestartCount = 0;
  state.loopRestartFromTimer = false;
  renderAudioOffsetControls();
  el.showDetailsCheckbox.checked = state.showDetails;
  el.wordTableSection.hidden = true;
  el.wordCompactSection.hidden = false;
  if (el.presentationSection) {
    el.presentationSection.hidden = true;
  }
  if (el.sentenceHeaderSection) {
    el.sentenceHeaderSection.hidden = false;
  }
  if (el.audioSection) {
    el.audioSection.hidden = false;
  }
  el.sentenceMeta.hidden = true;
  if (el.showDetailsGroup) {
    el.showDetailsGroup.hidden = true;
  }
  if (el.phoneticProfileGroup) {
    el.phoneticProfileGroup.hidden = true;
  }
  if (el.saveGoldGroup) {
    el.saveGoldGroup.hidden = true;
  }
  if (el.transcriptGroup) {
    el.transcriptGroup.hidden = true;
  }
  el.compactViewBtn.classList.add("active");
  el.detailedViewBtn.classList.remove("active");
  if (el.presentationViewBtn) {
    el.presentationViewBtn.classList.remove("active");
    el.presentationViewBtn.setAttribute("aria-pressed", "false");
  }
  el.compactViewBtn.setAttribute("aria-pressed", "true");
  el.detailedViewBtn.setAttribute("aria-pressed", "false");
  el.viewModeNotice.textContent = "";
  el.downloadLessonBtn.disabled = true;
  if (el.downloadOfflineZipBtn) {
    el.downloadOfflineZipBtn.hidden = false;
    el.downloadOfflineZipBtn.disabled = true;
  }
  el.lessonSelect.disabled = true;
  el.transcriptEditor.disabled = true;
  el.saveTranscriptBtn.disabled = true;
  el.buildCommandBtn.disabled = true;
  el.saveBtn.disabled = true;
  el.rebuildCommand.value = "";
  el.phonemeKeyboard.innerHTML = "";
  el.transcriptStatus.textContent = t("transcriptLoading");
  el.transcriptPath.textContent = "";
  setLocalLessonStatus("idle", "");
  state.rebuildCommandStatusKind = "idle";
  state.rebuildCommandStatusText = t("rebuildCommandIdle");
  renderRebuildCommandUI();
  applyShowDetailsMode();
  applyPresentationDisplayOptions();
  updatePresentationPlayPauseButton();
  updatePresentationLoopToggleButton();
  updatePresentationPlayAllButton();
  applyAppScreen();
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

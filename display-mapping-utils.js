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

// Lesson payloads carry exceptions either in the config file shape
// ({word_ipa_overrides: [...]}) or as the parsed map that remap_display.py embeds
// ({word_norm: {"ipa tokens": [zhuyin...]}}); both parse with ZhuyinCore.
function parseDisplayExceptions(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  if (Array.isArray(payload.word_ipa_overrides)) {
    return ZhuyinCore.loadDisplayExceptionsJson(payload);
  }

  const entries = [];
  Object.entries(payload).forEach(([wordRaw, mapping]) => {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return;
    }
    Object.entries(mapping).forEach(([ipaText, zhuyin]) => {
      if (Array.isArray(zhuyin)) {
        entries.push({ word_norm: wordRaw, ipa: String(ipaText || "").split(/\s+/), zhuyin_plus: zhuyin });
      }
    });
  });
  return ZhuyinCore.loadDisplayExceptionsJson({ word_ipa_overrides: entries });
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

// Candidate token_details (teaching/phonetic/surface) carry no stress, but the
// stress rules (final /i/, ə+l, intervocalic p) need it. Candidates keep the
// canonical vowels in order, so when the vowel counts agree each vowel takes the
// canonical vowel's stress; otherwise the details are returned unchanged.
function fillStressFromCanonical(word, ipaTokens, tokenDetails) {
  const details = Array.isArray(tokenDetails) ? tokenDetails : [];
  const ipaList = Array.isArray(ipaTokens) ? ipaTokens : [];
  if (details.length !== ipaList.length || details.every((detail) => detail?.stress_level != null)) {
    return details;
  }
  const canonical = Array.isArray(word?.canonical_ipa) ? word.canonical_ipa : [];
  const canonicalDetails = Array.isArray(word?.canonical_token_details) ? word.canonical_token_details : [];
  const canonicalStress = Array.isArray(word?.canonical_stress_levels) ? word.canonical_stress_levels : [];
  const isVowelToken = (token) => ZhuyinCore.isVowel(ZhuyinCore.stripDiacritics(token));
  const vowelStress = [];
  canonical.forEach((token, idx) => {
    if (isVowelToken(token)) {
      const raw = canonicalStress[idx] ?? canonicalDetails[idx]?.stress_level;
      vowelStress.push(ZhuyinCore.normalizeStressLevel(raw));
    }
  });
  const vowelIndices = [];
  ipaList.forEach((token, idx) => {
    if (isVowelToken(token)) {
      vowelIndices.push(idx);
    }
  });
  if (vowelIndices.length === 0 || vowelIndices.length !== vowelStress.length) {
    return details;
  }
  const filled = details.map((detail) => ({ ...detail }));
  vowelIndices.forEach((idx, pos) => {
    if (filled[idx].stress_level == null) {
      filled[idx].stress_level = vowelStress[pos];
    }
  });
  return filled;
}

// Zhuyin is recomputed from the IPA and the stored C1/V/C2 details with the
// presenter's rules (zhuyin_core.js); other systems are a plain table lookup.
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

  // buildDisplayBundle drops empty IPA tokens; keep their positions as empty zhuyin.
  const kept = [];
  ipaList.forEach((token, idx) => {
    if (token) {
      kept.push(idx);
    }
  });
  const bundle = ZhuyinCore.buildDisplayBundle(
    kept.map((idx) => ipaList[idx]),
    table,
    kept.map((idx) => details[idx]),
    wordText,
    state.displayExceptions,
  );
  const output = new Array(ipaList.length).fill("");
  kept.forEach((idx, pos) => {
    output[idx] = bundle.zhuyin_plus[pos];
  });
  return output;
}

function cloneTokenDetails(details) {
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .filter((item) => item && typeof item === "object")
    .map((item) => ({ ...item }));
}

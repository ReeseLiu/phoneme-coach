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
      const key = ipaKey(ipaTokens);
      if (!key) {
        return;
      }
      if (!output[wordNorm]) {
        output[wordNorm] = {};
      }
      output[wordNorm][key] = normalizeOverrideTokens(zhuyinRaw, ipaTokens.length);
    });
  });
  return output;
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

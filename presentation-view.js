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
function renderPresentationLessonMeta() {
  if (!el.presentationLessonMeta || !state.lesson) return;
  const name = state.lesson.display_name || state.currentLessonKey || "";
  const count = Array.isArray(state.lesson.sentences) ? state.lesson.sentences.length : 0;
  el.presentationLessonMeta.textContent = state.uiLanguage === "zh-TW"
    ? `${name}　${count} 句`
    : `${name} · ${count} sentences`;
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

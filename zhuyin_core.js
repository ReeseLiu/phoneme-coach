// IPA -> Improved Zhuyin core shared by the browser pipeline and phoneme-surface-lattice's web/.
// Mirrors backend/phoneme_core/{rules_conservative,syllable_structure,display_mapping}.py and is
// locked to them by tests/fixtures/zhuyin_golden.json.
//
// Loads both as a classic <script> and as a side-effect ES module (`import "./zhuyin_core.js"`),
// so it has no export statements and publishes its API on globalThis.ZhuyinCore.
(function initZhuyinCore(root) {
  "use strict";

  const VOWELS = new Set([
    "i",
    "ɪ",
    "eɪ",
    "ɛ",
    "æ",
    "ə",
    "ʌ",
    "ɑ",
    "ɔ",
    "ʊ",
    "u",
    "aɪ",
    "aʊ",
    "oʊ",
    "ɔɪ",
    "iː",
    "uː",
    "ɑː",
    "ɔː",
    "ɜː",
    "ɐ",
    "ɚ",
    "ɝ",
    "ɔːɹ",
    "ɑːɹ",
    "ɪɹ",
  ]);

  const LEGAL_ONSET_CLUSTERS_2 = new Set([
    "p ɹ",
    "b ɹ",
    "t ɹ",
    "d ɹ",
    "k ɹ",
    "ɡ ɹ",
    "f ɹ",
    "θ ɹ",
    "p l",
    "b l",
    "k l",
    "ɡ l",
    "f l",
    "s p",
    "s t",
    "s k",
    "s m",
    "s n",
    "s f",
    "s w",
    "s j",
    "s l",
    "s ɹ",
    "ʃ ɹ",
    "k w",
    "t w",
    "d w",
    "ɡ w",
    "θ w",
    // Coronal + /j/ (tj, dj, nj, lj) is deliberately excluded; keep in sync with syllable_structure.py.
    "p j",
    "b j",
    "k j",
    "ɡ j",
    "f j",
    "v j",
    "m j",
    "h j",
  ]);

  const LEGAL_ONSET_CLUSTERS_3 = new Set([
    "s p ɹ",
    "s t ɹ",
    "s k ɹ",
    "s p l",
    "s k l",
    "s k w",
    "s t j",
    "s k j",
    "s p j",
  ]);

  function normalizeWordToken(token) {
    let normalized = String(token || "").toLowerCase().replaceAll("’", "'");
    normalized = normalized.replace(/[^a-z0-9']+/g, "");
    return normalized.trim();
  }

  function stripDiacritics(token) {
    return String(token || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
  }

  function isVowel(token) {
    return VOWELS.has(token);
  }

  function maxOnsetSize(cluster) {
    if (!Array.isArray(cluster) || cluster.length === 0) {
      return 0;
    }
    const maxSize = Math.min(3, cluster.length);
    for (let size = maxSize; size >= 1; size -= 1) {
      const tail = cluster.slice(cluster.length - size).join(" ");
      if (size === 1) {
        return 1;
      }
      if (size === 2 && LEGAL_ONSET_CLUSTERS_2.has(tail)) {
        return 2;
      }
      if (size === 3 && LEGAL_ONSET_CLUSTERS_3.has(tail)) {
        return 3;
      }
    }
    return 1;
  }

  function ipaKey(tokens) {
    return (tokens || []).filter((token) => token).join(" ");
  }

  function normalizeSeamWord(raw) {
    return normalizeWordToken(String(raw || "").replaceAll("’", "'"));
  }

  // data/compound_seams.json -> { word_norm: { "ipa tokens": seam } }
  function loadCompoundSeamsJson(payload) {
    const output = Object.create(null);
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    entries.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      const wordNorm = normalizeSeamWord(item.word_norm || "");
      const key = String(item.ipa || "").trim().split(/\s+/).filter((token) => token).join(" ");
      const seam = item.seam;
      if (!wordNorm || !key || !Number.isInteger(seam) || seam <= 0) {
        return;
      }
      if (!output[wordNorm]) {
        output[wordNorm] = Object.create(null);
      }
      output[wordNorm][key] = seam;
    });
    return output;
  }

  // Left-half IPA token count when (word, IPA) is a listed compound, otherwise null.
  function resolveCompoundSeam(compoundSeams, wordText, ipaTokens) {
    if (!compoundSeams || typeof compoundSeams !== "object") {
      return null;
    }
    const wordRules = compoundSeams[normalizeSeamWord(wordText || "")];
    if (!wordRules || typeof wordRules !== "object") {
      return null;
    }
    const seam = wordRules[ipaKey(ipaTokens)];
    return Number.isInteger(seam) ? seam : null;
  }

  // seam: tokens in the left half of a listed compound. When the consonants between two vowels
  // have tokens on both sides of it, the boundary is fixed at the seam instead of the maximal onset.
  function analyzeSyllableTokens(baseTokens, seam = null) {
    if (!Array.isArray(baseTokens) || baseTokens.length === 0) {
      return [];
    }

    const baseNorm = baseTokens.map((token) => stripDiacritics(token));
    const vowelIndices = [];
    baseNorm.forEach((token, idx) => {
      if (isVowel(token)) {
        vowelIndices.push(idx);
      }
    });

    const annotations = baseTokens.map((_, idx) => ({
      index: idx,
      syllable_index: 0,
      syllable_slot: "C1",
      slot_index: idx,
      position: idx === 0 ? "onset" : "coda",
    }));

    if (vowelIndices.length === 0) {
      return annotations;
    }

    const syllableCount = vowelIndices.length;
    const firstVowel = vowelIndices[0];
    const lastVowel = vowelIndices[vowelIndices.length - 1];

    for (let idx = 0; idx < firstVowel; idx += 1) {
      annotations[idx] = {
        index: idx,
        syllable_index: 0,
        syllable_slot: "C1",
        slot_index: idx,
        position: "onset",
      };
    }

    vowelIndices.forEach((vowelIdx, syllableIndex) => {
      annotations[vowelIdx] = {
        index: vowelIdx,
        syllable_index: syllableIndex,
        syllable_slot: "V",
        slot_index: 0,
        position: "nucleus",
      };
    });

    const tail = [];
    for (let idx = lastVowel + 1; idx < baseTokens.length; idx += 1) {
      tail.push(idx);
    }
    tail.forEach((idx, slotIndex) => {
      annotations[idx] = {
        index: idx,
        syllable_index: syllableCount - 1,
        syllable_slot: "C2",
        slot_index: slotIndex,
        position: "coda",
      };
    });

    for (let leftSylIdx = 0; leftSylIdx < syllableCount - 1; leftSylIdx += 1) {
      const leftVowel = vowelIndices[leftSylIdx];
      const rightVowel = vowelIndices[leftSylIdx + 1];
      const middle = [];
      for (let idx = leftVowel + 1; idx < rightVowel; idx += 1) {
        middle.push(idx);
      }
      if (middle.length === 0) {
        continue;
      }

      let codaCount;
      if (Number.isInteger(seam) && middle[0] < seam && seam <= middle[middle.length - 1]) {
        codaCount = seam - middle[0];
      } else {
        const clusterNorm = middle.map((idx) => baseNorm[idx]);
        const onsetCount = maxOnsetSize(clusterNorm);
        codaCount = Math.max(0, middle.length - onsetCount);
      }
      const codaIndices = middle.slice(0, codaCount);
      const onsetIndices = middle.slice(codaCount);

      codaIndices.forEach((idx, slotIndex) => {
        annotations[idx] = {
          index: idx,
          syllable_index: leftSylIdx,
          syllable_slot: "C2",
          slot_index: slotIndex,
          position: "intervocalic",
        };
      });

      onsetIndices.forEach((idx, slotIndex) => {
        annotations[idx] = {
          index: idx,
          syllable_index: leftSylIdx + 1,
          syllable_slot: "C1",
          slot_index: slotIndex,
          position: "intervocalic",
        };
      });
    }

    return annotations;
  }

  function normalizeStressLevel(value) {
    if (Number.isInteger(value) && [0, 1, 2].includes(value)) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const parsed = Number(value);
      return [0, 1, 2].includes(parsed) ? parsed : null;
    }
    return null;
  }

  function detailDict(tokenDetails, idx) {
    if (!Array.isArray(tokenDetails) || idx < 0 || idx >= tokenDetails.length) {
      return {};
    }
    const detail = tokenDetails[idx];
    return detail && typeof detail === "object" ? detail : {};
  }

  function detailSlot(tokenDetails, idx) {
    return String(detailDict(tokenDetails, idx).syllable_slot || "");
  }

  function detailPosition(tokenDetails, idx) {
    return String(detailDict(tokenDetails, idx).position || "");
  }

  function detailSyllableIndex(tokenDetails, idx) {
    const raw = detailDict(tokenDetails, idx).syllable_index;
    if (Number.isInteger(raw)) {
      return raw;
    }
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      return Number(raw);
    }
    return null;
  }

  function detailSlotIndex(tokenDetails, idx) {
    const raw = detailDict(tokenDetails, idx).slot_index;
    if (Number.isInteger(raw)) {
      return raw;
    }
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      return Number(raw);
    }
    return null;
  }

  // Stress of the vowel in the syllable holding token idx, or null when unknown.
  function syllableStressLevel(tokenDetails, idx) {
    const syllableIndex = detailSyllableIndex(tokenDetails, idx);
    if (syllableIndex === null || !Array.isArray(tokenDetails)) {
      return null;
    }
    for (let otherIdx = 0; otherIdx < tokenDetails.length; otherIdx += 1) {
      if (detailSlot(tokenDetails, otherIdx) === "V" && detailSyllableIndex(tokenDetails, otherIdx) === syllableIndex) {
        return normalizeStressLevel(detailDict(tokenDetails, otherIdx).stress_level);
      }
    }
    return null;
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

  function shouldMergeReducedSchwaL(ipaTokens, tokenDetails, idx) {
    if (idx + 1 >= ipaTokens.length) {
      return false;
    }
    if (ipaTokens[idx] !== "ə" || ipaTokens[idx + 1] !== "l") {
      return false;
    }
    if (idx + 1 !== ipaTokens.length - 1) {
      return false;
    }
    if (idx + 1 >= tokenDetails.length) {
      return false;
    }

    const current = detailDict(tokenDetails, idx);
    const next = detailDict(tokenDetails, idx + 1);
    if (normalizeStressLevel(current.stress_level) !== 0) {
      return false;
    }
    if (String(next.syllable_slot || "") !== "C2") {
      return false;
    }
    const currentSyllable = current.syllable_index;
    const nextSyllable = next.syllable_index;
    if (Number.isInteger(currentSyllable) && Number.isInteger(nextSyllable) && currentSyllable !== nextSyllable) {
      return false;
    }
    return true;
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

  function contextualZhuyinOverride(ipaTokens, tokenDetails, idx, reducedSchwaL) {
    const token = ipaTokens[idx];
    const slot = detailSlot(tokenDetails, idx);

    if (shouldMergeReducedSchwaL(ipaTokens, tokenDetails, idx)) {
      return { text: reducedSchwaL, mergeNext: true };
    }

    if (idx + 1 < ipaTokens.length) {
      const nextToken = ipaTokens[idx + 1];
      const nextSlot = detailSlot(tokenDetails, idx + 1);
      const same = sameSyllable(tokenDetails, idx, idx + 1);

      if (token === "ɔ" && nextToken === "ɹ" && nextSlot === "C2" && same) return { text: "ㄛㄦ", mergeNext: true };
      if (["ɑ", "ɑː", "a"].includes(token) && nextToken === "ɹ" && nextSlot === "C2" && same) return { text: "ㄚ(喉)ㄦ", mergeNext: true };
      if (token === "ɛ" && nextToken === "ɹ" && nextSlot === "C2" && same) return { text: "ㄝㄦ", mergeNext: true };
      if (["ɪ", "i"].includes(token) && nextToken === "ɹ" && nextSlot === "C2" && same) return { text: "ㄧㄦ", mergeNext: true };
      if (token === "ɔ" && nextToken === "l" && nextSlot === "C2" && same) return { text: "ㄛ", mergeNext: true };
      if (token === "d" && nextToken === "z" && slot === "C2" && nextSlot === "C2" && idx + 1 === ipaTokens.length - 1 && same) return { text: "ㄗ", mergeNext: true };
      if (token === "t" && nextToken === "s" && slot === "C2" && nextSlot === "C2" && idx + 1 === ipaTokens.length - 1 && same) return { text: "ㄘ", mergeNext: true };
      if (token === "t" && nextToken === "ɹ" && adjacentOnsetSlots(tokenDetails, idx, idx + 1)) return { text: "ㄔㄨ", mergeNext: true };
      if (token === "d" && nextToken === "ɹ" && adjacentOnsetSlots(tokenDetails, idx, idx + 1)) return { text: "ㄓㄨ", mergeNext: true };
    }

    if (token === "k" && idx > 0 && ipaTokens[idx - 1] === "s" && adjacentOnsetSlots(tokenDetails, idx - 1, idx)) {
      return { text: "ㄍ", mergeNext: false };
    }
    if (token === "p" && idx > 0 && ipaTokens[idx - 1] === "s" && adjacentOnsetSlots(tokenDetails, idx - 1, idx)) {
      return { text: "ㄅ", mergeNext: false };
    }
    // Intervocalic onset p is unaspirated only before an unstressed vowel; unknown stress keeps ㄅ.
    if (
      token === "p"
      && slot === "C1"
      && detailPosition(tokenDetails, idx) === "intervocalic"
      && ![1, 2].includes(syllableStressLevel(tokenDetails, idx))
    ) {
      return { text: "ㄅ", mergeNext: false };
    }
    if (token === "l" && slot === "C2") {
      return { text: "ㄛ", mergeNext: false };
    }
    // Word-final /i/ of a polysyllable without primary stress (happy IY0, pony IY2) is ㄧ;
    // he, see, primary-stressed and unknown-stress /i/ keep ㄧ(微).
    if (
      token === "i"
      && idx === ipaTokens.length - 1
      && ipaTokens.length > 2
      && [0, 2].includes(normalizeStressLevel(detailDict(tokenDetails, idx).stress_level))
    ) {
      return { text: "ㄧ", mergeNext: false };
    }
    return null;
  }

  function normalizeOverrideTokens(tokens, targetLen) {
    const normalized = (tokens || []).map((token) => String(token || ""));
    if (normalized.length < targetLen) {
      normalized.push(...new Array(targetLen - normalized.length).fill(""));
    }
    if (normalized.length > targetLen) {
      return normalized.slice(0, targetLen);
    }
    return normalized;
  }

  function normalizeExceptionWord(raw) {
    return normalizeWordToken(String(raw || "").replaceAll("’", "'"));
  }

  function loadDisplayExceptionsJson(payload) {
    const output = Object.create(null);
    const entries = Array.isArray(payload?.word_ipa_overrides) ? payload.word_ipa_overrides : [];
    entries.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      const wordNorm = normalizeExceptionWord(item.word_norm || "");
      const ipaRaw = Array.isArray(item.ipa) ? item.ipa : [];
      const zhuyinRaw = Array.isArray(item.zhuyin_plus) ? item.zhuyin_plus : [];
      if (!wordNorm) {
        return;
      }
      const ipaTokens = ipaRaw.map((token) => String(token || "").trim()).filter((token) => token);
      if (ipaTokens.length === 0) {
        return;
      }
      if (!output[wordNorm]) {
        output[wordNorm] = {};
      }
      output[wordNorm][ipaKey(ipaTokens)] = normalizeOverrideTokens(zhuyinRaw, ipaTokens.length);
    });
    return output;
  }

  function resolveDisplayExceptionZhuyin(displayExceptions, wordText, ipaTokens) {
    if (!displayExceptions || typeof displayExceptions !== "object") {
      return null;
    }
    const wordNorm = normalizeExceptionWord(wordText || "");
    if (!wordNorm) {
      return null;
    }
    const wordRules = displayExceptions[wordNorm];
    if (!wordRules || typeof wordRules !== "object") {
      return null;
    }
    const candidate = wordRules[ipaKey(ipaTokens)];
    if (!Array.isArray(candidate)) {
      return null;
    }
    return normalizeOverrideTokens(candidate, ipaTokens.length);
  }

  function buildDisplayBundle(tokens, table, tokenDetails = [], wordText = "", displayExceptions = null) {
    const ipaTokens = (tokens || []).filter((token) => token);
    const kkTokens = [];
    const zhuyinTokens = [];
    const symbolIds = [];
    const details = Array.isArray(tokenDetails) ? tokenDetails : [];
    const reducedSchwaL = (table?.["əl"]?.zhuyin_plus) || "ㄛ";
    const mergedNextIndices = new Set();
    const exceptionZhuyin = resolveDisplayExceptionZhuyin(displayExceptions, wordText, ipaTokens);

    ipaTokens.forEach((token, idx) => {
      const row = table?.[token] && typeof table[token] === "object" ? table[token] : {};
      kkTokens.push(row.kk || token);
      symbolIds.push(row.symbol_id || "");

      if (exceptionZhuyin) {
        zhuyinTokens.push(idx < exceptionZhuyin.length ? exceptionZhuyin[idx] : "");
        return;
      }
      if (mergedNextIndices.has(idx)) {
        zhuyinTokens.push("");
        return;
      }

      const override = contextualZhuyinOverride(ipaTokens, details, idx, reducedSchwaL);
      if (override) {
        zhuyinTokens.push(override.text);
        if (override.mergeNext && idx + 1 < ipaTokens.length) {
          mergedNextIndices.add(idx + 1);
        }
        return;
      }

      zhuyinTokens.push(slotAwareZhuyin(row, token, detailSlot(details, idx)));
    });

    return {
      ipa: ipaTokens,
      kk: kkTokens,
      zhuyin_plus: zhuyinTokens,
      symbol_ids: symbolIds,
    };
  }

  root.ZhuyinCore = Object.freeze({
    VOWELS,
    LEGAL_ONSET_CLUSTERS_2,
    LEGAL_ONSET_CLUSTERS_3,
    normalizeWordToken,
    stripDiacritics,
    isVowel,
    maxOnsetSize,
    ipaKey,
    loadCompoundSeamsJson,
    resolveCompoundSeam,
    analyzeSyllableTokens,
    normalizeStressLevel,
    syllableStressLevel,
    adjacentOnsetSlots,
    slotAwareZhuyin,
    contextualZhuyinOverride,
    loadDisplayExceptionsJson,
    resolveDisplayExceptionZhuyin,
    buildDisplayBundle,
  });
}(globalThis));

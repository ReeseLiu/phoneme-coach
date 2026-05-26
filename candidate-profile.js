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

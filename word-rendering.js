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

function buildQuickFillOptionElement(value, labelText) {
  const option = document.createElement("option");
  option.value = String(value || "");
  option.textContent = String(labelText || "");
  return option;
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

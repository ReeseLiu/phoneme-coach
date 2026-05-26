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

function updateDisplayHeaders() {
  const label = DISPLAY_LABEL[state.uiLanguage][state.displaySystem] || state.displaySystem;
  el.canonicalHeader.textContent = t("canonicalHeader", label);
  el.candidatesHeader.textContent = t("candidatesHeader", label);
  el.phoneticHeader.textContent = t("phoneticHeader", label);
  el.observedHeader.textContent = t("observedHeader", label);
}

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

  if (el.presentationStartMinusBtn) {
    el.presentationStartMinusBtn.addEventListener("click", () =>
      nudgeCurrentSentenceOffset("start", -AUDIO_OFFSET_QUICK_STEP_SEC));
  }
  if (el.presentationStartPlusBtn) {
    el.presentationStartPlusBtn.addEventListener("click", () =>
      nudgeCurrentSentenceOffset("start", AUDIO_OFFSET_QUICK_STEP_SEC));
  }
  if (el.presentationEndMinusBtn) {
    el.presentationEndMinusBtn.addEventListener("click", () =>
      nudgeCurrentSentenceOffset("end", -AUDIO_OFFSET_QUICK_STEP_SEC));
  }
  if (el.presentationEndPlusBtn) {
    el.presentationEndPlusBtn.addEventListener("click", () =>
      nudgeCurrentSentenceOffset("end", AUDIO_OFFSET_QUICK_STEP_SEC));
  }

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
    if (!state.internalSeekActive) {
      enforceAudioPlaybackRange();
    }
  });

  el.sentenceAudio.addEventListener("seeked", () => {
    if (!state.internalSeekActive) {
      enforceAudioPlaybackRange();
    }
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

    let vscode;
    try {
      vscode = acquireVsCodeApi();
    } catch (e) {
      console.warn("[SonarAgent Webview] acquireVsCodeApi error:", e);
    }
    try {
      vscode?.postMessage({ command: "ready" });
      vscode?.postMessage({ command: "log", text: "Webview script started execution" });
    } catch (e) {}

    const onboardingView = document.getElementById("onboarding-view");
    const connectedView = document.getElementById("connected-view");
    const alertBox = document.getElementById("alert-box");
    const overviewError = document.getElementById("overview-error");

    window.addEventListener("error", (e) => {
      console.error("[SonarAgent Webview Error]", e);
      try {
        vscode.postMessage({ command: "log", text: "Webview error event: " + (e.message || String(e)) });
      } catch (_) {}
      if (alertBox) {
        alertBox.textContent = "Webview script error: " + (e.message || String(e));
        alertBox.className = "alert error";
      }
    });

    window.addEventListener("unhandledrejection", (e) => {
      console.error("[SonarAgent Webview Unhandled Rejection]", e);
      try {
        vscode.postMessage({ command: "log", text: "Webview unhandledrejection event: " + (e.reason?.message || String(e.reason)) });
      } catch (_) {}
      if (alertBox) {
        alertBox.textContent = "Webview promise error: " + (e.reason?.message || String(e.reason));
        alertBox.className = "alert error";
      }
    });

    const loadingIndicator = document.getElementById("loading-indicator");
    const metricsGrid = document.getElementById("metrics-grid");
    const qualityGateBanner = document.getElementById("quality-gate-banner");
    const qualityGateToggle = document.getElementById("quality-gate-toggle");
    const qualityGateLabel = document.getElementById("quality-gate-label");
    const qualityGateChevron = document.getElementById("quality-gate-chevron");
    const qualityGateConditions = document.getElementById("quality-gate-conditions");

    const issuesSection = document.getElementById("issues-section");
    const issuesListTitle = document.getElementById("issues-list-title");
    const issuesListCount = document.getElementById("issues-list-count");
    const issuesLoading = document.getElementById("issues-loading");
    const issuesContainer = document.getElementById("issues-container");
    const batchActionBar = document.getElementById("batch-action-bar");
    const selectedCountLabel = document.getElementById("selected-count-label");
    const sendBatchBtn = document.getElementById("send-batch-btn");
    const deselectAllBtn = document.getElementById("deselect-all-btn");
    const selectAllCheckbox = document.getElementById("select-all-checkbox");

    const filterSeverity = document.getElementById("filter-severity");
    const filterAuthor = document.getElementById("filter-author");
    const filterFile = document.getElementById("filter-file");
    const filterRule = document.getElementById("filter-rule");
    const filterIncludeTests = document.getElementById("filter-include-tests");
    const filterPopoverTrigger = document.getElementById("filter-popover-trigger");
    const filterPopover = document.getElementById("filter-popover");
    const filterActiveBadge = document.getElementById("filter-active-badge");
    const filterActiveChips = document.getElementById("filter-active-chips");
    const filterClearAllBtn = document.getElementById("filter-clear-all-btn");
    const filterSearchInput = document.getElementById("filter-search-input");
    const filterResetBtn = document.getElementById("filter-reset-btn");
    const filterCloseBtn = document.getElementById("filter-close-btn");

    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const projectSearchInput = document.getElementById("project-search-input");
    const projectSearchToggleBtn = document.getElementById("project-search-toggle-btn");
    const projectDropdownPopup = document.getElementById("project-dropdown-popup");
    const projectItemsContainer = document.getElementById("project-items-container");
    const manualProjectItem = document.getElementById("manual-project-item");
    const targetAgentDropdown = document.getElementById("target-agent-dropdown");
    const profileSwitcher = document.getElementById("profile-switcher");
    const noProfilesView = document.getElementById("no-profiles-view");
    const createProfileBtn = document.getElementById("create-profile-btn");
    const headerRefreshBtn = document.getElementById("header-refresh-btn");
    const headerProjectBtn = document.getElementById("header-project-btn");
    const headerSettingsBtn = document.getElementById("header-settings-btn");

    headerRefreshBtn?.addEventListener("click", () => {
      vscode?.postMessage({ command: "refresh" });
    });

    headerProjectBtn?.addEventListener("click", () => {
      vscode?.postMessage({ command: "openProjectPicker" });
    });

    headerSettingsBtn?.addEventListener("click", () => {
      vscode?.postMessage({ command: "configure" });
    });

    let cachedProjects = [];
    let currentSelectedProjectKey = "";

    function renderProjectList(filterText) {
      projectItemsContainer.innerHTML = "";
      const q = (filterText || "").trim().toLowerCase();

      const filtered = cachedProjects.filter((p) => {
        if (!q) return true;
        const nameMatch = (p.name || "").toLowerCase().includes(q);
        const keyMatch = (p.key || "").toLowerCase().includes(q);
        return nameMatch || keyMatch;
      });

      if (filtered.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.padding = "8px 10px";
        emptyDiv.style.fontSize = "11px";
        emptyDiv.style.color = "var(--vscode-descriptionForeground)";
        emptyDiv.textContent = cachedProjects.length === 0 ? "No projects found" : "No matching projects";
        projectItemsContainer.appendChild(emptyDiv);
      } else {
        filtered.forEach((p) => {
          const itemDiv = document.createElement("div");
          itemDiv.className = "project-item" + (p.key === currentSelectedProjectKey ? " active" : "");
          itemDiv.setAttribute("role", "option");
          itemDiv.setAttribute("tabindex", "0");
          itemDiv.setAttribute("aria-selected", p.key === currentSelectedProjectKey ? "true" : "false");

          const nameRow = document.createElement("div");
          nameRow.style.display = "flex";
          nameRow.style.justifyContent = "space-between";
          nameRow.style.alignItems = "center";

          const nameSpan = document.createElement("span");
          nameSpan.className = "project-item-name";
          nameSpan.textContent = p.name;
          nameRow.appendChild(nameSpan);

          if (p.key === currentSelectedProjectKey) {
            const check = document.createElement("span");
            check.style.display = "inline-flex";
            check.style.alignItems = "center";
            check.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>';
            nameRow.appendChild(check);
          }

          const keySpan = document.createElement("span");
          keySpan.className = "project-item-key";
          keySpan.textContent = p.key;

          itemDiv.appendChild(nameRow);
          itemDiv.appendChild(keySpan);

          const selectProject = () => {
            currentSelectedProjectKey = p.key;
            projectSearchInput.value = p.name === p.key ? p.key : p.name + " (" + p.key + ")";
            projectDropdownPopup.classList.add("hidden");
            projectSearchInput.setAttribute("aria-expanded", "false");
            vscode.postMessage({ command: "selectProject", projectKey: p.key });
          };

          itemDiv.addEventListener("click", selectProject);
          itemDiv.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectProject();
            }
          });

          projectItemsContainer.appendChild(itemDiv);
        });
      }
    }

    projectSearchInput.addEventListener("focus", () => {
      projectDropdownPopup.classList.remove("hidden");
      projectSearchInput.setAttribute("aria-expanded", "true");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchInput.addEventListener("input", () => {
      projectDropdownPopup.classList.remove("hidden");
      projectSearchInput.setAttribute("aria-expanded", "true");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (projectDropdownPopup.classList.contains("hidden")) {
        projectDropdownPopup.classList.remove("hidden");
        projectSearchInput.setAttribute("aria-expanded", "true");
        renderProjectList("");
      } else {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
      }
    });

    if (manualProjectItem) {
      const openPicker = () => {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
        vscode.postMessage({ command: "openProjectPicker" });
      };
      manualProjectItem.addEventListener("click", openPicker);
      manualProjectItem.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      });
    }

    document.addEventListener("click", (e) => {
      const wrapper = document.querySelector(".project-selector-wrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
      }
    });

    const securityCount = document.getElementById("metric-security-count");
    const badgeSecurity = document.getElementById("badge-security");
    const reliabilityCount = document.getElementById("metric-reliability-count");
    const badgeReliability = document.getElementById("badge-reliability");
    const maintainabilityCount = document.getElementById("metric-maintainability-count");
    const badgeMaintainability = document.getElementById("badge-maintainability");
    const coveragePercent = document.getElementById("metric-coverage-percent");
    const coverageLines = document.getElementById("metric-coverage-lines");
    const duplicationsPercent = document.getElementById("metric-duplications-percent");
    const duplicationsLines = document.getElementById("metric-duplications-lines");
    const hotspotsCount = document.getElementById("metric-hotspots-count");
    const badgeHotspots = document.getElementById("badge-hotspots");
    const acceptedCount = document.getElementById("metric-accepted-count");

    let activeCategory = null;
    let currentDetailPeriod = "{{codePeriod}}";
    let rawCategoryItems = [];
    let currentItems = [];
    const selectedItemIds = new Set();

/* {{issueLifecycleMenuScript}} */
    function showAlert(msg, type = "error") {
      alertBox.textContent = msg;
      alertBox.className = "alert " + type;
    }

    function clearAlert() {
      alertBox.textContent = "";
      alertBox.className = "alert";
      overviewError.textContent = "";
      overviewError.className = "alert";
    }

    function formatNumber(num) {
      if (num >= 1000) {
        return (num / 1000).toFixed(0) + "k";
      }
      return String(num);
    }

    const ringCoverage = document.getElementById("ring-coverage");
    const ringDuplications = document.getElementById("ring-duplications");
    const ringSecurity = document.getElementById("ring-security");
    const ringReliability = document.getElementById("ring-reliability");
    const ringMaintainability = document.getElementById("ring-maintainability");
    const ringHotspots = document.getElementById("ring-hotspots");
    const celebrationBadge = document.getElementById("celebration-badge");
    const celebrationCanvas = document.getElementById("celebration-canvas");
    let lastGateStatus = null;
    let currentGateStatus = null;

    const CIRCUMFERENCE_R14 = 87.96;

    function updateDonutRing(circleEl, percent, isCoverage) {
      if (!circleEl) return;
      const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
      const dashOffset = Math.round((CIRCUMFERENCE_R14 - (clamped / 100) * CIRCUMFERENCE_R14) * 100) / 100;
      circleEl.style.strokeDasharray = String(CIRCUMFERENCE_R14);
      circleEl.style.strokeDashoffset = String(dashOffset);

      if (isCoverage) {
        circleEl.style.stroke = clamped >= 80 ? "url(#coverage-gradient)" : clamped >= 50 ? "var(--sonar-yellow)" : "var(--sonar-red)";
      } else {
        circleEl.style.stroke = clamped > 10 ? "var(--sonar-red)" : clamped > 3 ? "var(--sonar-yellow)" : "var(--sonar-green)";
      }
    }

    function getRatingColorVar(rating) {
      const r = String(rating || "A").toUpperCase().trim();
      if (r === "A" || r === "1" || r === "1.0") return "var(--sonar-green)";
      if (r === "B" || r === "2" || r === "2.0") return "var(--sonar-lime)";
      if (r === "C" || r === "3" || r === "3.0") return "var(--sonar-yellow)";
      if (r === "D" || r === "4" || r === "4.0") return "var(--sonar-orange)";
      if (r === "E" || r === "5" || r === "5.0") return "var(--sonar-red)";
      return "var(--sonar-green)";
    }

    function updateRatingBadge(el, rating, ringEl) {
      el.className = "rating-badge rating-" + rating;
      el.textContent = rating;
      if (ringEl) {
        ringEl.style.stroke = getRatingColorVar(rating);
        ringEl.style.filter = "drop-shadow(0 0 5px " + (rating === "A" ? "rgba(34, 197, 94, 0.45)" : "rgba(234, 179, 8, 0.45)") + ")";
      }
    }

    function triggerCelebration(msg) {
      if (celebrationBadge) {
        celebrationBadge.innerHTML = '<span class="subtext-icon">🎉</span> <span class="subtext-content">' + msg + '</span>';
        celebrationBadge.classList.remove("hidden");
      }
      if (qualityGateBanner) {
        qualityGateBanner.classList.add("quality-gate-celebrate");
        setTimeout(() => {
          qualityGateBanner.classList.remove("quality-gate-celebrate");
        }, 4000);
      }
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      launchConfetti();
    }

    function launchConfetti() {
      if (!celebrationCanvas) return;
      const ctx = celebrationCanvas.getContext("2d");
      if (!ctx) return;
      celebrationCanvas.width = window.innerWidth;
      celebrationCanvas.height = window.innerHeight;

      const colors = ["#00aa5e", "#81b300", "#eabe06", "#2563eb", "#9333ea", "#06b6d4"];
      const particles = [];
      for (let i = 0; i < 35; i++) {
        particles.push({
          x: celebrationCanvas.width * (0.2 + Math.random() * 0.6),
          y: celebrationCanvas.height * 0.2,
          vx: (Math.random() - 0.5) * 6,
          vy: -Math.random() * 5 - 2,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          rot: Math.random() * 360,
        });
      }

      let frame = 0;
      function step() {
        frame++;
        ctx.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
        let alive = false;
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2;
          p.alpha -= 0.015;
          if (p.alpha > 0) {
            alive = true;
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
          }
        }
        if (alive && frame < 90) {
          requestAnimationFrame(step);
        } else {
          ctx.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
        }
      }
      requestAnimationFrame(step);
    }

    function updateBatchBar() {
      const count = selectedItemIds.size;
      if (count > 0) {
        batchActionBar.classList.remove("hidden");
        selectedCountLabel.textContent = count + " issue" + (count > 1 ? "s" : "") + " selected";
        sendBatchBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>Send ' + count + ' to Agent';
      } else {
        batchActionBar.classList.add("hidden");
      }
      syncSelectAllState();
    }

    function syncSelectAllState() {
      if (!selectAllCheckbox) return;
      const visibleIds = currentItems.map((i) => i.id);
      const selectedVisible = visibleIds.filter((id) => selectedItemIds.has(id)).length;
      selectAllCheckbox.disabled = visibleIds.length === 0;
      selectAllCheckbox.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    }

    function renderOverview(overview) {
      if (!overview) return;

      securityCount.textContent = overview.security.count;
      updateRatingBadge(badgeSecurity, overview.security.rating, ringSecurity);

      reliabilityCount.textContent = overview.reliability.count;
      updateRatingBadge(badgeReliability, overview.reliability.rating, ringReliability);

      maintainabilityCount.textContent = overview.maintainability.count;
      updateRatingBadge(badgeMaintainability, overview.maintainability.rating, ringMaintainability);

      coveragePercent.textContent = overview.coverage.percentage.toFixed(1) + "%";
      coverageLines.textContent = "On " + formatNumber(overview.coverage.linesToCover) + " lines to cover.";
      updateDonutRing(ringCoverage, overview.coverage.percentage, true);

      duplicationsPercent.textContent = overview.duplications.percentage.toFixed(1) + "%";
      duplicationsLines.textContent = "On " + formatNumber(overview.duplications.duplicatedLines) + " lines.";
      updateDonutRing(ringDuplications, overview.duplications.percentage, false);

      hotspotsCount.textContent = overview.securityHotspots.count;
      updateRatingBadge(badgeHotspots, overview.securityHotspots.rating, ringHotspots);

      if (acceptedCount && overview.acceptedIssues) {
        acceptedCount.textContent = formatNumber(overview.acceptedIssues.count);
      }

      const totalIssues =
        (overview.security.count || 0) +
        (overview.reliability.count || 0) +
        (overview.maintainability.count || 0);
      if (totalIssues === 0) {
        triggerCelebration("0 Issues Reached! Clean Code streak maintained");
      }
    }

    const QUALITY_GATE_LABELS = { OK: "PASS", WARN: "WARN", ERROR: "FAIL" };
    const QUALITY_GATE_CLASSES = {
      OK: "quality-gate-pass",
      WARN: "quality-gate-warn",
      ERROR: "quality-gate-fail",
    };
    const COMPARATOR_SYMBOLS = { LT: "<", GT: ">", LTE: "≤", GTE: "≥", EQ: "=" };

    function humanizeMetricKey(metricKey) {
      return String(metricKey || "condition")
        .replace(/^new_/, "New ")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function formatGateCondition(condition) {
      const symbol = COMPARATOR_SYMBOLS[condition.comparator] || condition.comparator || "";
      const threshold =
        condition.status === "WARN" && condition.warnThreshold
          ? condition.warnThreshold
          : condition.errorThreshold;
      const parts = [humanizeMetricKey(condition.metricKey)];
      if (symbol && threshold !== undefined && threshold !== "") {
        parts.push(symbol, String(threshold));
      }
      let text = parts.join(" ");
      if (condition.actualValue !== undefined && condition.actualValue !== "") {
        text += " → actual " + condition.actualValue;
      }
      return text;
    }

    function updateQualityGateLabel(statusVal, isNew) {
      if (!qualityGateLabel) return;
      const prefix = isNew ? "Quality Gate (New):" : "Quality Gate:";
      qualityGateLabel.innerHTML = '<span class="gate-title-prefix">' + prefix + '</span> <span class="gate-status-val">' + statusVal + '</span>';
    }

    function updateQualityGateIcon(status) {
      const iconEl = document.getElementById("quality-gate-icon-svg");
      if (!iconEl) return;
      if (status === "OK") {
        iconEl.innerHTML = '<path class="gate-icon-shield" d="M12 2.5L4.5 5.5V11.5C4.5 16.5 7.7 21.1 12 22.3C16.3 21.1 19.5 16.5 19.5 11.5V5.5L12 2.5Z" fill="#10b981" /><path class="gate-icon-check" d="M9 11.8L11 13.8L15 9.8" stroke="#042016" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />';
      } else if (status === "WARN") {
        iconEl.innerHTML = '<path class="gate-icon-shield" d="M12 2.5L4.5 5.5V11.5C4.5 16.5 7.7 21.1 12 22.3C16.3 21.1 19.5 16.5 19.5 11.5V5.5L12 2.5Z" fill="#f59e0b" /><path d="M12 8V13M12 16H12.01" stroke="#261b05" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />';
      } else {
        iconEl.innerHTML = '<path class="gate-icon-shield" d="M12 2.5L4.5 5.5V11.5C4.5 16.5 7.7 21.1 12 22.3C16.3 21.1 19.5 16.5 19.5 11.5V5.5L12 2.5Z" fill="#ef4444" /><path d="M9.5 9.5L14.5 14.5M14.5 9.5L9.5 14.5" stroke="#26090c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />';
      }
    }

    function renderQualityGate(status) {
      if (!qualityGateBanner || !qualityGateToggle) return;
      if (!status || !QUALITY_GATE_LABELS[status.status]) {
        qualityGateBanner.className = "quality-gate hidden";
        return;
      }

      if (lastGateStatus === "ERROR" && status.status === "OK") {
        triggerCelebration("Quality Gate Passed! Clean Code streak maintained");
      }
      lastGateStatus = status.status;
      currentGateStatus = status;

      const variant = QUALITY_GATE_CLASSES[status.status];
      qualityGateBanner.className = "quality-gate " + variant;
      const isNew = status.period === "new" || currentDetailPeriod === "new";
      updateQualityGateLabel(QUALITY_GATE_LABELS[status.status], isNew);
      updateQualityGateIcon(status.status);

      const allConditions = status.conditions || [];
      const failing = allConditions.filter(
        (c) => c.status === "ERROR" || c.status === "WARN",
      );

      if (celebrationBadge) {
        if (status.status === "OK") {
          celebrationBadge.innerHTML = '<span class="subtext-icon">🎉</span> <span class="subtext-content">0 Issues Reached! Clean code streak maintained.</span>';
        } else if (status.status === "WARN") {
          celebrationBadge.innerHTML = '<span class="subtext-icon">⚠️</span> <span class="subtext-content">Warning conditions require attention.</span>';
        } else {
          celebrationBadge.innerHTML = '<span class="subtext-icon">⚠️</span> <span class="subtext-content">' + failing.length + ' condition' + (failing.length === 1 ? '' : 's') + ' failed. Action required.</span>';
        }
        celebrationBadge.classList.remove("hidden");
      }

      const conditionsToShow = failing.length > 0 ? failing : allConditions;
      if (qualityGateConditions) {
        qualityGateConditions.innerHTML = "";
        conditionsToShow.forEach((condition) => {
          const li = document.createElement("li");
          const statusClass =
            condition.status === "ERROR"
              ? "condition-error"
              : condition.status === "WARN"
                ? "condition-warn"
                : "condition-pass";
          li.className = "quality-gate-condition " + statusClass;
          const metricSpan = document.createElement("span");
          metricSpan.className = "condition-metric";
          const icon = condition.status === "ERROR" ? "✕ " : condition.status === "WARN" ? "! " : "✓ ";
          metricSpan.textContent = icon + formatGateCondition(condition);
          li.appendChild(metricSpan);
          qualityGateConditions.appendChild(li);
        });
        qualityGateConditions.classList.add("hidden");
      }
      qualityGateToggle.setAttribute("aria-expanded", "false");
      qualityGateToggle.disabled = conditionsToShow.length === 0;
      if (qualityGateChevron) {
        qualityGateChevron.style.visibility = conditionsToShow.length === 0 ? "hidden" : "visible";
      }
    }

    if (qualityGateToggle) {
      qualityGateToggle.addEventListener("click", () => {
        if (!qualityGateConditions || qualityGateToggle.disabled) return;
        const expanded = qualityGateToggle.getAttribute("aria-expanded") === "true";
        qualityGateToggle.setAttribute("aria-expanded", String(!expanded));
        qualityGateConditions.classList.toggle("hidden", expanded);
      });
    }

    function isTestFile(filePath) {
      if (!filePath) return false;
      const normalized = filePath.split(String.fromCharCode(92)).join("/");
      if (/(?:^|[/])(?:__tests__|__test__|tests?|testing|specs?)(?:[/]|$)/i.test(normalized)) {
        return true;
      }
      const filename = normalized.split("/").pop() || "";
      return /(?:[._-](?:tests?|specs?)[.][a-z0-9]+$)|(?:(?:^|[a-z0-9])(?:Tests?|Specs?)[.][a-z0-9]+$)/i.test(filename);
    }

    function populateFilterDropdowns(items) {
      const prevAuthor = filterAuthor.value;
      const prevFile = filterFile.value;
      const prevRule = filterRule.value;

      const authors = Array.from(new Set(items.map((i) => i.author).filter(Boolean))).sort();
      filterAuthor.innerHTML = '<option value="ALL">All</option>';
      authors.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        filterAuthor.appendChild(opt);
      });
      if (authors.includes(prevAuthor)) {
        filterAuthor.value = prevAuthor;
      }

      const files = Array.from(new Set(items.map((i) => i.filePath).filter(Boolean))).sort();
      filterFile.innerHTML = '<option value="ALL">All</option>';
      files.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        const shortName = f.split("/").pop() || f;
        opt.textContent = shortName;
        opt.title = f;
        filterFile.appendChild(opt);
      });
      if (files.includes(prevFile)) {
        filterFile.value = prevFile;
      }

      const rules = Array.from(new Set(items.map((i) => i.ruleKey).filter(Boolean))).sort();
      filterRule.innerHTML = '<option value="ALL">All</option>';
      rules.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        filterRule.appendChild(opt);
      });
      if (rules.includes(prevRule)) {
        filterRule.value = prevRule;
      }
    }

    function getFilteredItems() {
      const sev = filterSeverity.value;
      const author = filterAuthor.value;
      const file = filterFile.value;
      const rule = filterRule.value;
      const includeTests = filterIncludeTests.checked;
      const search = (filterSearchInput?.value || "").trim().toLowerCase();

      return rawCategoryItems.filter((item) => {
        if (sev !== "ALL" && item.severity !== sev) {
          return false;
        }
        if (author !== "ALL" && (item.author || "") !== author) {
          return false;
        }
        if (file !== "ALL" && item.filePath !== file) {
          return false;
        }
        if (rule !== "ALL" && item.ruleKey !== rule) {
          return false;
        }
        if (!includeTests && isTestFile(item.filePath)) {
          return false;
        }
        if (search) {
          const msg = (item.message || "").toLowerCase();
          const fPath = (item.filePath || "").toLowerCase();
          const rKey = (item.ruleKey || "").toLowerCase();
          const aut = (item.author || "").toLowerCase();
          if (!msg.includes(search) && !fPath.includes(search) && !rKey.includes(search) && !aut.includes(search)) {
            return false;
          }
        }
        return true;
      });
    }

    function renderIssueCard(item) {
      const card = document.createElement("div");
      card.className = "issue-card";

      // Card Header: File path and collapse button
      const headerDiv = document.createElement("div");
      headerDiv.className = "issue-card-header";

      const pathDiv = document.createElement("div");
      pathDiv.className = "issue-path";
      pathDiv.textContent = item.filePath;
      pathDiv.title = "Click to jump to file";
      pathDiv.addEventListener("click", () => {
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const collapseBtn = document.createElement("button");
      collapseBtn.className = "issue-collapse-btn";
      collapseBtn.setAttribute("aria-label", "Toggle card details");
      collapseBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 10-5-5-5 5"/></svg>';

      headerDiv.appendChild(pathDiv);
      headerDiv.appendChild(collapseBtn);

      // Hidden checkbox for batch selection compatibility
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "issue-checkbox";
      checkbox.style.display = "none";
      checkbox.checked = selectedItemIds.has(item.id);
      checkbox.setAttribute("aria-label", "Select issue: " + item.message);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedItemIds.add(item.id);
        } else {
          selectedItemIds.delete(item.id);
        }
        updateBatchBar();
      });

      // Card Inner Panel
      const innerDiv = document.createElement("div");
      innerDiv.className = "issue-card-inner";

      let isExpanded = true;
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        innerDiv.style.display = isExpanded ? "flex" : "none";
        collapseBtn.innerHTML = isExpanded
          ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 10-5-5-5 5"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 5 5 5-5"/></svg>';
      });

      // Main Row: Donut Chart / Icon + Title & Metadata
      const mainRow = document.createElement("div");
      mainRow.className = "issue-main-row";

      if (item.type === "COVERAGE") {
        const donutWrap = document.createElement("div");
        donutWrap.className = "issue-donut-wrap";

        const covMatch = item.message.match(/(\d+(?:\.\d+)?)%\s*coverage/i);
        const percent = covMatch ? Math.min(100, Math.max(0, parseFloat(covMatch[1]))) : 0;
        const r = 16;
        const circ = 2 * Math.PI * r;
        const offset = circ * (1 - percent / 100);

        donutWrap.innerHTML =
          '<svg width="44" height="44" viewBox="0 0 40 40" class="coverage-donut-svg">' +
          '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="4.5" />' +
          '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="#38bdf8" stroke-width="4.5" ' +
          'stroke-dasharray="' + circ.toFixed(2) + '" ' +
          'stroke-dashoffset="' + offset.toFixed(2) + '" ' +
          'stroke-linecap="round" ' +
          'transform="rotate(-90 20 20)" ' +
          'style="filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.65));" />' +
          '</svg>';
        mainRow.appendChild(donutWrap);
      }

      const infoWrap = document.createElement("div");
      infoWrap.className = "issue-info-wrap";

      const titleRow = document.createElement("div");
      titleRow.className = "issue-title-row";

      if (item.type === "COVERAGE") {
        const splitMatch = item.message.match(/^(.*?)\s*(\(\d+(?:\.\d+)?%\s*coverage\))$/i);
        if (splitMatch) {
          const boldText = document.createElement("span");
          boldText.className = "issue-title-bold";
          boldText.textContent = splitMatch[1];

          const metaText = document.createElement("span");
          metaText.className = "issue-title-cov-meta";
          metaText.textContent = splitMatch[2];

          titleRow.appendChild(boldText);
          titleRow.appendChild(metaText);
        } else {
          const boldText = document.createElement("span");
          boldText.className = "issue-title-bold";
          boldText.textContent = item.message;
          titleRow.appendChild(boldText);
        }
      } else {
        const boldText = document.createElement("span");
        boldText.className = "issue-title-bold";
        boldText.textContent = item.message;
        titleRow.appendChild(boldText);
      }

      const metaSub = document.createElement("div");
      metaSub.className = "issue-meta-sub";
      metaSub.textContent = (item.line ? "L" + item.line : "File level") + (item.effort ? " • " + item.effort : "");

      infoWrap.appendChild(titleRow);
      infoWrap.appendChild(metaSub);
      mainRow.appendChild(infoWrap);
      innerDiv.appendChild(mainRow);

      // Badges
      const badgesDiv = document.createElement("div");
      badgesDiv.className = "issue-badges";

      const primaryBadge = document.createElement("span");
      const sevClass = (item.severity ? item.severity.toLowerCase() : "info");
      primaryBadge.className = "badge-tag badge-severity-" + sevClass;
      primaryBadge.textContent = item.type + (item.severity ? " (" + item.severity + ")" : "");
      badgesDiv.appendChild(primaryBadge);

      if (item.author) {
        const authorBadge = document.createElement("span");
        authorBadge.className = "badge-tag";
        authorBadge.textContent = "@" + item.author;
        badgesDiv.appendChild(authorBadge);
      }

      (item.tags || []).forEach((tag) => {
        const tagBadge = document.createElement("span");
        tagBadge.className = "badge-tag";
        tagBadge.textContent = tag;
        badgesDiv.appendChild(tagBadge);
      });

      innerDiv.appendChild(badgesDiv);

      // Actions Footer
      const footerDiv = document.createElement("div");
      footerDiv.className = "issue-footer";

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "issue-actions";

      const jumpBtn = document.createElement("button");
      jumpBtn.className = "btn btn-secondary btn-sm btn-jump-file";
      jumpBtn.setAttribute("aria-label", "Jump to " + item.filePath + (item.line ? ":" + item.line : ""));
      jumpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg><span>Jump to File</span>';
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const agentBtn = document.createElement("button");
      agentBtn.className = "btn btn-agent btn-sm btn-agent-primary";
      let agentBtnLabel = "Send to Agent";
      if (item.type === "COVERAGE") {
        agentBtnLabel = "Generate Unit Tests";
      } else if (item.type === "DUPLICATION") {
        agentBtnLabel = "Refactor";
      } else if (item.type === "HOTSPOT") {
        agentBtnLabel = "Review";
      }
      agentBtn.setAttribute("aria-label", agentBtnLabel + " for " + item.message);

      const lightningSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="0.5" style="flex-shrink:0;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
      agentBtn.innerHTML = lightningSvg + '<span>' + agentBtnLabel + '</span>';
      agentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetAgentId = targetAgentDropdown.value;
        if (item.type === "COVERAGE") {
          vscode.postMessage({ command: "generateMissingTests", item, targetAgentId });
        } else {
          vscode.postMessage({ command: "sendToAgent", item, targetAgentId });
        }
      });

      actionsDiv.appendChild(jumpBtn);
      actionsDiv.appendChild(agentBtn);

/* {{issueLifecycleCardButtonScript}} */
      footerDiv.appendChild(actionsDiv);

      card.appendChild(checkbox);
      card.appendChild(headerDiv);
      card.appendChild(innerDiv);
      card.appendChild(footerDiv);

      issuesContainer.appendChild(card);
    }

    function applyFiltersAndRender() {
      const filtered = getFilteredItems();
      currentItems = filtered;

      // Clean up selected items that are no longer visible in the filtered list
      const visibleIdSet = new Set(filtered.map((i) => i.id));
      for (const id of Array.from(selectedItemIds)) {
        if (!visibleIdSet.has(id)) {
          selectedItemIds.delete(id);
        }
      }
      updateBatchBar();
      updateActiveFilterChips();

      issuesListCount.textContent = filtered.length + " item" + (filtered.length === 1 ? "" : "s");
      issuesContainer.innerHTML = "";

      if (filtered.length === 0) {
        const isNewCodePeriod = currentDetailPeriod === "new";
        const emptyMsg = isNewCodePeriod
          ? "No issues in New Code period for this category."
          : "No issues match the selected filters.";
        issuesContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px;">' + emptyMsg + '</div>';
        return;
      }

      filtered.forEach((item) => {
        renderIssueCard(item);
      });
    }

    function toggleFilterPopover(force) {
      if (!filterPopover) return;
      const isHidden = filterPopover.classList.contains("hidden");
      const shouldOpen = force !== undefined ? force : isHidden;
      filterPopover.classList.toggle("hidden", !shouldOpen);
      filterPopoverTrigger?.classList.toggle("open", shouldOpen);
      filterPopoverTrigger?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }

    function closeFilterPopover() {
      toggleFilterPopover(false);
    }

    function resetAllFilters() {
      if (filterSeverity) filterSeverity.value = "ALL";
      if (filterAuthor) filterAuthor.value = "ALL";
      if (filterFile) filterFile.value = "ALL";
      if (filterRule) filterRule.value = "ALL";
      if (filterIncludeTests) filterIncludeTests.checked = true;
      if (filterSearchInput) filterSearchInput.value = "";
      applyFiltersAndRender();
    }

    function updateActiveFilterChips() {
      if (!filterActiveChips) return;
      filterActiveChips.innerHTML = "";

      const sev = filterSeverity?.value || "ALL";
      const author = filterAuthor?.value || "ALL";
      const file = filterFile?.value || "ALL";
      const rule = filterRule?.value || "ALL";
      const includeTests = filterIncludeTests?.checked ?? true;
      const search = (filterSearchInput?.value || "").trim();

      const activeFilters = [];
      if (sev !== "ALL") {
        activeFilters.push({
          label: sev.charAt(0) + sev.slice(1).toLowerCase(),
          onRemove: () => {
            filterSeverity.value = "ALL";
            applyFiltersAndRender();
          },
        });
      }
      if (author !== "ALL") {
        activeFilters.push({
          label: author,
          onRemove: () => {
            filterAuthor.value = "ALL";
            applyFiltersAndRender();
          },
        });
      }
      if (file !== "ALL") {
        const shortFile = file.split("/").pop() || file;
        activeFilters.push({
          label: shortFile,
          full: file,
          onRemove: () => {
            filterFile.value = "ALL";
            applyFiltersAndRender();
          },
        });
      }
      if (rule !== "ALL") {
        activeFilters.push({
          label: rule,
          onRemove: () => {
            filterRule.value = "ALL";
            applyFiltersAndRender();
          },
        });
      }
      if (search) {
        activeFilters.push({
          label: `"${search}"`,
          onRemove: () => {
            if (filterSearchInput) filterSearchInput.value = "";
            applyFiltersAndRender();
          },
        });
      }
      if (!includeTests) {
        activeFilters.push({
          label: "No tests",
          onRemove: () => {
            if (filterIncludeTests) filterIncludeTests.checked = true;
            applyFiltersAndRender();
          },
        });
      }

      const count = activeFilters.length;
      if (filterActiveBadge) {
        filterActiveBadge.textContent = String(count);
        filterActiveBadge.classList.toggle("hidden", count === 0);
      }
      if (filterClearAllBtn) {
        filterClearAllBtn.classList.toggle("hidden", count === 0);
      }
      const filterChipsRow = document.getElementById("filter-chips-row");
      if (filterChipsRow) {
        filterChipsRow.classList.toggle("hidden", count === 0);
      }
      filterPopoverTrigger?.classList.toggle("active", count > 0);

      activeFilters.forEach((af) => {
        const chip = document.createElement("span");
        chip.className = "filter-chip";
        chip.title = af.full || af.label;

        const textSpan = document.createElement("span");
        textSpan.textContent = af.label;
        chip.appendChild(textSpan);

        const rmBtn = document.createElement("button");
        rmBtn.className = "filter-chip-remove";
        rmBtn.type = "button";
        rmBtn.innerHTML = "&times;";
        rmBtn.title = "Remove filter";
        rmBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          af.onRemove();
        });
        chip.appendChild(rmBtn);

        filterActiveChips.appendChild(chip);
      });
    }

    function renderIssues(items, category, period) {
      if (period) {
        currentDetailPeriod = period;
      }
      rawCategoryItems = items;
      selectedItemIds.clear();

      filterSeverity.value = "ALL";
      filterIncludeTests.checked = true;
      if (filterSearchInput) filterSearchInput.value = "";

      const categoryTitles = {
        duplications: "Duplication Files",
        coverage: "Coverage Files",
        hotspots: "Security Hotspots",
        reliability: "Reliability Issues",
        security: "Security Issues",
        maintainability: "Maintainability Issues",
        accepted: "Accepted Issues",
      };
      const categoryIcons = {
        coverage: '<svg width="15" height="15" viewBox="0 0 16 16" fill="#3b82f6"><rect x="1.5" y="6.5" width="2.5" height="8" rx="1.25"/><rect x="6.75" y="1.5" width="2.5" height="13" rx="1.25"/><rect x="12" y="4.5" width="2.5" height="10" rx="1.25"/></svg>',
        security: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#3b82f6"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2L4 5.5v5.8c0 5.4 3.4 10.4 8 11.7 4.6-1.3 8-6.3 8-11.7V5.5L12 2zm3.3 7.3a1 1 0 0 0-1.4-1.4L11 10.8l-1.9-1.9a1 1 0 0 0-1.4 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6z"/></svg>',
        reliability: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#ef4444"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L8.91 5.748a8.04 8.04 0 0 0-1.574.908l-1.802-.916c-.82-.417-1.82-.162-2.35.597L2.14 7.8c-.53.76-.39 1.79.324 2.384l1.573 1.306a8.07 8.07 0 0 0 0 1.82l-1.573 1.306c-.714.593-.854 1.624-.324 2.384l1.044 1.463c.53.76 1.53 1.014 2.35.597l1.802-.916c.49.345 1.018.65 1.574.908l.318 1.931c.15.904.933 1.567 1.85 1.567h1.844c.917 0 1.699-.663 1.85-1.567l.318-1.931a8.04 8.04 0 0 0 1.574-.908l1.802.916c.82.417 1.82.162 2.35-.597l1.044-1.463c.53-.76.39-1.79-.324-2.384l-1.573-1.306a8.07 8.07 0 0 0 0-1.82l1.573-1.306c.714-.593.854-1.624.324-2.384L20.816 7.037c-.53-.76-1.53-1.014-2.35-.597l-1.802.916a8.04 8.04 0 0 0-1.574-.908l-.318-1.931c-.15-.904-.933-1.567-1.85-1.567h-1.844zM12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z"/></svg>',
        maintainability: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#06b6d4"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.1L9 6.2 6.2 9 1.9 4.7C.6 7.1 1 10.1 3 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.4-.4.4-1 0-1.4z"/></svg>',
        hotspots: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="#f59e0b"/></svg>',
        duplications: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5" ry="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        accepted: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
      };

      const filterSeverityWrapper = document.getElementById("filter-severity-wrapper");
      const filterRuleWrapper = document.getElementById("filter-rule-wrapper");
      const filterAuthorWrapper = document.getElementById("filter-author-wrapper");
      if (filterSeverityWrapper) filterSeverityWrapper.classList.remove("hidden");
      if (filterRuleWrapper) filterRuleWrapper.classList.remove("hidden");
      if (filterAuthorWrapper) filterAuthorWrapper.classList.remove("hidden");

      populateFilterDropdowns(items);

      issuesSection.classList.remove("hidden");
      issuesListTitle.textContent = categoryTitles[category] || (category ? category.charAt(0).toUpperCase() + category.slice(1) + " Issues" : "Issues");
      const titleIconEl = document.getElementById("issues-title-icon");
      if (titleIconEl) {
        titleIconEl.innerHTML = categoryIcons[category] || "";
      }

      applyFiltersAndRender();
    }

    [filterSeverity, filterAuthor, filterFile, filterRule].forEach((sel) => {
      sel?.addEventListener("change", applyFiltersAndRender);
    });
    filterIncludeTests?.addEventListener("change", applyFiltersAndRender);

    filterPopoverTrigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFilterPopover();
    });

    filterCloseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFilterPopover();
    });

    filterPopover?.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    filterResetBtn?.addEventListener("click", resetAllFilters);
    filterClearAllBtn?.addEventListener("click", resetAllFilters);
    filterSearchInput?.addEventListener("input", applyFiltersAndRender);

    document.addEventListener("click", (e) => {
      if (filterPopover && !filterPopover.classList.contains("hidden")) {
        if (!filterPopover.contains(e.target) && !filterPopoverTrigger?.contains(e.target)) {
          closeFilterPopover();
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && filterPopover && !filterPopover.classList.contains("hidden")) {
        closeFilterPopover();
      }
    });

    sendBatchBtn.addEventListener("click", () => {
      const selectedItems = currentItems.filter((item) => selectedItemIds.has(item.id));
      if (selectedItems.length > 0) {
        const targetAgentId = targetAgentDropdown.value;
        vscode.postMessage({ command: "sendBatchToAgent", items: selectedItems, targetAgentId });
      }
    });

    deselectAllBtn.addEventListener("click", () => {
      selectedItemIds.clear();
      document.querySelectorAll(".issue-checkbox").forEach((cb) => {
        cb.checked = false;
      });
      updateBatchBar();
    });

    selectAllCheckbox.addEventListener("change", () => {
      currentItems.forEach((item) => {
        if (selectAllCheckbox.checked) {
          selectedItemIds.add(item.id);
        } else {
          selectedItemIds.delete(item.id);
        }
      });
      document.querySelectorAll(".issue-checkbox").forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
      });
      updateBatchBar();
    });

    // ---- Current Code tab ----
    const tabOverall = document.getElementById("tab-overall");
    const tabCurrent = document.getElementById("tab-current");
    const overallPanel = document.getElementById("overall-tab-panel");
    const currentPanel = document.getElementById("current-tab-panel");
    const currentIssuesContainer = document.getElementById("current-issues-container");
    const currentBatchBar = document.getElementById("current-batch-bar");
    const currentSelectedCount = document.getElementById("current-selected-count");
    const currentSendBatchBtn = document.getElementById("current-send-batch-btn");
    const currentClearBtn = document.getElementById("current-clear-btn");
    const currentSelectAllCheckbox = document.getElementById("current-select-all-checkbox");
    const currentLoading = document.getElementById("current-loading");
    const currentError = document.getElementById("current-error");
    const currentEmptySonarlint = document.getElementById("current-empty-sonarlint");
    const currentEmptyClean = document.getElementById("current-empty-clean");
    const currentSourceLabel = document.getElementById("current-source-label");
    const runFullScanBtn = document.getElementById("run-full-scan-btn");
    const cleanFileBtn = document.getElementById("clean-file-btn");
    const installSonarlintBtn = document.getElementById("install-sonarlint-btn");
    const runFullScanEmptyBtn = document.getElementById("run-full-scan-empty-btn");

    let currentCodeItems = [];
    const selectedCurrentIds = new Set();

    function setActiveTab(tab) {
      const isCurrent = tab === "currentCode";
      if (tabOverall) {
        tabOverall.classList.toggle("active", !isCurrent);
        tabOverall.setAttribute("aria-selected", String(!isCurrent));
      }
      if (tabCurrent) {
        tabCurrent.classList.toggle("active", isCurrent);
        tabCurrent.setAttribute("aria-selected", String(isCurrent));
      }
      if (overallPanel) {
        overallPanel.classList.toggle("hidden", isCurrent);
      }
      if (currentPanel) {
        currentPanel.classList.toggle("hidden", !isCurrent);
      }
    }

    function updateCurrentBatchBar() {
      if (!currentBatchBar) return;
      const count = selectedCurrentIds.size;
      if (count > 0) {
        currentBatchBar.classList.remove("hidden");
        currentSelectedCount.textContent = count + " issue" + (count > 1 ? "s" : "") + " selected";
        currentSendBatchBtn.textContent =
          "Send " + count + " Issue" + (count > 1 ? "s" : "") + " to Agent";
      } else {
        currentBatchBar.classList.add("hidden");
      }
      syncCurrentSelectAllState();
    }

    function syncCurrentSelectAllState() {
      if (!currentSelectAllCheckbox) return;
      const visibleIds = currentCodeItems.map((i) => i.id);
      const selectedVisible = visibleIds.filter((id) => selectedCurrentIds.has(id)).length;
      currentSelectAllCheckbox.disabled = visibleIds.length === 0;
      currentSelectAllCheckbox.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      currentSelectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    }

    function renderCurrentIssueCard(item) {
      const card = document.createElement("div");
      card.className = "issue-card";

      // Card Header
      const headerDiv = document.createElement("div");
      headerDiv.className = "issue-card-header";

      const pathDiv = document.createElement("div");
      pathDiv.className = "issue-path";
      pathDiv.textContent = item.filePath;
      pathDiv.title = "Click to jump to file";
      pathDiv.addEventListener("click", () => {
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const collapseBtn = document.createElement("button");
      collapseBtn.className = "issue-collapse-btn";
      collapseBtn.setAttribute("aria-label", "Toggle card details");
      collapseBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 10-5-5-5 5"/></svg>';

      headerDiv.appendChild(pathDiv);
      headerDiv.appendChild(collapseBtn);

      // Hidden checkbox for current batch selection compatibility
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "issue-checkbox current-issue-checkbox";
      checkbox.style.display = "none";
      checkbox.checked = selectedCurrentIds.has(item.id);
      checkbox.setAttribute("aria-label", "Select issue: " + item.message);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedCurrentIds.add(item.id);
        } else {
          selectedCurrentIds.delete(item.id);
        }
        updateCurrentBatchBar();
      });

      // Card Inner Panel
      const innerDiv = document.createElement("div");
      innerDiv.className = "issue-card-inner";

      let isExpanded = true;
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        innerDiv.style.display = isExpanded ? "flex" : "none";
        collapseBtn.innerHTML = isExpanded
          ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 10-5-5-5 5"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 5 5 5-5"/></svg>';
      });

      // Main Row: Title & Metadata
      const mainRow = document.createElement("div");
      mainRow.className = "issue-main-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "issue-info-wrap";

      const titleRow = document.createElement("div");
      titleRow.className = "issue-title-row";

      const boldText = document.createElement("span");
      boldText.className = "issue-title-bold";
      boldText.textContent = item.message;
      titleRow.appendChild(boldText);

      const metaSub = document.createElement("div");
      metaSub.className = "issue-meta-sub";
      metaSub.textContent = (item.line ? "L" + item.line : "File level") + (item.effort ? " • " + item.effort : "");

      infoWrap.appendChild(titleRow);
      infoWrap.appendChild(metaSub);
      mainRow.appendChild(infoWrap);
      innerDiv.appendChild(mainRow);

      // Badges
      const badgesDiv = document.createElement("div");
      badgesDiv.className = "issue-badges";

      const severityBadge = document.createElement("span");
      severityBadge.className = "badge-tag badge-severity-" + String(item.severity || "major").toLowerCase();
      severityBadge.textContent = (item.type || "CODE_SMELL") + " (" + (item.severity || "MAJOR") + ")";
      badgesDiv.appendChild(severityBadge);

      if (item.ruleKey) {
        const ruleBadge = document.createElement("span");
        ruleBadge.className = "badge-tag";
        ruleBadge.textContent = item.ruleKey;
        badgesDiv.appendChild(ruleBadge);
      }

      innerDiv.appendChild(badgesDiv);

      // Actions Footer
      const footerDiv = document.createElement("div");
      footerDiv.className = "issue-footer";

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "issue-actions";

      const jumpBtn = document.createElement("button");
      jumpBtn.className = "btn btn-secondary btn-sm btn-jump-file";
      jumpBtn.setAttribute("aria-label", "Jump to " + item.filePath + (item.line ? ":" + item.line : ""));
      jumpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg><span>Jump to File</span>';
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const agentBtn = document.createElement("button");
      agentBtn.className = "btn btn-agent btn-sm btn-agent-primary";
      agentBtn.setAttribute("aria-label", "Send to Agent for " + item.message);

      const lightningSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="0.5" style="flex-shrink:0;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
      agentBtn.innerHTML = lightningSvg + '<span>Send to Agent</span>';
      agentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetAgentId = targetAgentDropdown.value;
        vscode.postMessage({ command: "sendToAgent", item, targetAgentId });
      });

      actionsDiv.appendChild(jumpBtn);
      actionsDiv.appendChild(agentBtn);

      footerDiv.appendChild(actionsDiv);

      card.appendChild(checkbox);
      card.appendChild(headerDiv);
      card.appendChild(innerDiv);
      card.appendChild(footerDiv);

      currentIssuesContainer.appendChild(card);
    }

    function renderCurrentCodeItems(items, sonarLintInstalled, sourceLabel) {
      currentCodeItems = items || [];
      selectedCurrentIds.clear();
      updateCurrentBatchBar();
      if (currentSourceLabel && sourceLabel) {
        currentSourceLabel.textContent = sourceLabel;
      }
      if (currentError) {
        currentError.textContent = "";
        currentError.className = "alert error hidden";
      }
      if (!currentIssuesContainer) return;
      currentIssuesContainer.innerHTML = "";
      const hasItems = currentCodeItems.length > 0;
      if (cleanFileBtn) {
        cleanFileBtn.classList.toggle("hidden", !hasItems);
      }
      if (currentEmptySonarlint) {
        currentEmptySonarlint.classList.toggle("hidden", sonarLintInstalled !== false || hasItems);
      }
      if (currentEmptyClean) {
        currentEmptyClean.classList.toggle("hidden", !(sonarLintInstalled !== false && !hasItems));
      }
      currentCodeItems.forEach(renderCurrentIssueCard);
    }

    function updateCurrentTabCount(count) {
      if (tabCurrent) {
        tabCurrent.textContent = "Local Code (" + count + ")";
      }
    }

    const measuresTitle = document.getElementById("measures-title");
    const periodBtnOverall = document.getElementById("period-btn-overall");
    const periodBtnNew = document.getElementById("period-btn-new");
    const newCodeEmptyNotice = document.getElementById("new-code-empty-notice");

    function setCodePeriodUI(period, hasNewCode) {
      currentDetailPeriod = period;
      const isNew = period === "new";
      if (measuresTitle) {
        measuresTitle.textContent = isNew ? "New Code Measures" : "Overall Code Measures";
      }
      if (currentGateStatus && qualityGateLabel && QUALITY_GATE_LABELS[currentGateStatus.status]) {
        const isGateNew = currentGateStatus.period === "new" || isNew;
        updateQualityGateLabel(QUALITY_GATE_LABELS[currentGateStatus.status], isGateNew);
      }
      if (periodBtnOverall && periodBtnNew) {
        periodBtnOverall.classList.toggle("active", !isNew);
        periodBtnOverall.setAttribute("aria-checked", !isNew ? "true" : "false");
        periodBtnNew.classList.toggle("active", isNew);
        periodBtnNew.setAttribute("aria-checked", isNew ? "true" : "false");
      }
      if (newCodeEmptyNotice) {
        newCodeEmptyNotice.classList.toggle("hidden", !isNew || hasNewCode !== false);
      }
    }

    if (periodBtnOverall) {
      periodBtnOverall.addEventListener("click", () => {
        vscode.postMessage({ command: "switchCodePeriod", period: "overall" });
      });
    }
    if (periodBtnNew) {
      periodBtnNew.addEventListener("click", () => {
        vscode.postMessage({ command: "switchCodePeriod", period: "new" });
      });
    }

    if (tabOverall) {
      tabOverall.addEventListener("click", () => {
        vscode.postMessage({ command: "switchTab", tab: "overallCode" });
      });
    }
    if (tabCurrent) {
      tabCurrent.addEventListener("click", () => {
        vscode.postMessage({ command: "switchTab", tab: "currentCode" });
      });
    }
    if (cleanFileBtn) {
      cleanFileBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "cleanCurrentFile" });
      });
    }
    if (runFullScanBtn) {
      runFullScanBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "runCliScan" });
      });
    }
    if (runFullScanEmptyBtn) {
      runFullScanEmptyBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "runCliScan" });
      });
    }
    if (installSonarlintBtn) {
      installSonarlintBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "installSonarLint" });
      });
    }
    if (currentSendBatchBtn) {
      currentSendBatchBtn.addEventListener("click", () => {
        const selected = currentCodeItems.filter((i) => selectedCurrentIds.has(i.id));
        if (selected.length > 0) {
          const targetAgentId = targetAgentDropdown.value;
          vscode.postMessage({ command: "sendBatchToAgent", items: selected, targetAgentId });
        }
      });
    }
    if (currentClearBtn) {
      currentClearBtn.addEventListener("click", () => {
        selectedCurrentIds.clear();
        document.querySelectorAll(".current-issue-checkbox").forEach((cb) => {
          cb.checked = false;
        });
        updateCurrentBatchBar();
      });
    }
    if (currentSelectAllCheckbox) {
      currentSelectAllCheckbox.addEventListener("change", () => {
        currentCodeItems.forEach((item) => {
          if (currentSelectAllCheckbox.checked) {
            selectedCurrentIds.add(item.id);
          } else {
            selectedCurrentIds.delete(item.id);
          }
        });
        document.querySelectorAll(".current-issue-checkbox").forEach((cb) => {
          cb.checked = currentSelectAllCheckbox.checked;
        });
        updateCurrentBatchBar();
      });
    }

    targetAgentDropdown.addEventListener("change", () => {
      vscode.postMessage({ command: "setTargetAgent", agentId: targetAgentDropdown.value });
    });

    document.querySelectorAll(".metric-card").forEach((card) => {
      const activateCard = () => {
        const cat = card.dataset.category;
        if (!cat) return;

        document.querySelectorAll(".metric-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        activeCategory = cat;

        issuesContainer.innerHTML = "";
        issuesLoading.classList.remove("hidden");
        issuesSection.classList.remove("hidden");
        const categoryTitles = {
          duplications: "Duplication Files",
          coverage: "Coverage Files",
          hotspots: "Security Hotspots",
          reliability: "Reliability Issues",
          security: "Security Issues",
          maintainability: "Maintainability Issues",
          accepted: "Accepted Issues",
        };
        const categoryIcons = {
          coverage: '<svg width="15" height="15" viewBox="0 0 16 16" fill="#3b82f6"><rect x="1.5" y="6.5" width="2.5" height="8" rx="1.25"/><rect x="6.75" y="1.5" width="2.5" height="13" rx="1.25"/><rect x="12" y="4.5" width="2.5" height="10" rx="1.25"/></svg>',
          security: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#3b82f6"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2L4 5.5v5.8c0 5.4 3.4 10.4 8 11.7 4.6-1.3 8-6.3 8-11.7V5.5L12 2zm3.3 7.3a1 1 0 0 0-1.4-1.4L11 10.8l-1.9-1.9a1 1 0 0 0-1.4 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6z"/></svg>',
          reliability: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#ef4444"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L8.91 5.748a8.04 8.04 0 0 0-1.574.908l-1.802-.916c-.82-.417-1.82-.162-2.35.597L2.14 7.8c-.53.76-.39 1.79.324 2.384l1.573 1.306a8.07 8.07 0 0 0 0 1.82l-1.573 1.306c-.714.593-.854 1.624-.324 2.384l1.044 1.463c.53.76 1.53 1.014 2.35.597l1.802-.916c.49.345 1.018.65 1.574.908l.318 1.931c.15.904.933 1.567 1.85 1.567h1.844c.917 0 1.699-.663 1.85-1.567l.318-1.931a8.04 8.04 0 0 0 1.574-.908l1.802.916c.82.417 1.82.162 2.35-.597l1.044-1.463c.53-.76.39-1.79-.324-2.384l-1.573-1.306a8.07 8.07 0 0 0 0-1.82l1.573-1.306c.714-.593.854-1.624.324-2.384L20.816 7.037c-.53-.76-1.53-1.014-2.35-.597l-1.802.916a8.04 8.04 0 0 0-1.574-.908l-.318-1.931c-.15-.904-.933-1.567-1.85-1.567h-1.844zM12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z"/></svg>',
          maintainability: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#06b6d4"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.1L9 6.2 6.2 9 1.9 4.7C.6 7.1 1 10.1 3 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.4-.4.4-1 0-1.4z"/></svg>',
          hotspots: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="#f59e0b"/></svg>',
          duplications: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5" ry="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
          accepted: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
        };
        issuesListTitle.textContent = categoryTitles[cat] || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) + " Issues" : "Issues");
        const titleIconEl = document.getElementById("issues-title-icon");
        if (titleIconEl) {
          titleIconEl.innerHTML = categoryIcons[cat] || "";
        }

        vscode.postMessage({ command: "fetchDetails", category: cat });
      };

      card.addEventListener("click", activateCard);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateCard();
        }
      });
    });

    connectBtn.addEventListener("click", () => {
      try {
        clearAlert();
        const serverUrl = serverUrlInput.value.trim();
        const token = userTokenInput.value.trim();

        if (!serverUrl || !token) {
          showAlert("Please enter both Server URL and User Token.");
          return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = "Verifying...";
        vscode.postMessage({ command: "connect", serverUrl, token });
      } catch (err) {
        showAlert("Error initiating connection: " + (err?.message || String(err)));
      }
    });

    serverUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        connectBtn.click();
      }
    });

    userTokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        connectBtn.click();
      }
    });

    const manualProjectBtn = document.getElementById("manual-project-btn");
    if (manualProjectBtn) {
      manualProjectBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "openProjectPicker" });
      });
    }

    profileSwitcher.addEventListener("change", () => {
      vscode.postMessage({ command: "switchProfile", profileId: profileSwitcher.value });
    });

    createProfileBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "createProfile" });
    });

    const tryDemoBtn = document.getElementById("try-demo-btn");
    if (tryDemoBtn) {
      tryDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "enableDemoMode" });
      });
    }

    const noProfilesDemoBtn = document.getElementById("no-profiles-demo-btn");
    if (noProfilesDemoBtn) {
      noProfilesDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "enableDemoMode" });
      });
    }

    const exitDemoBtn = document.getElementById("exit-demo-btn");
    if (exitDemoBtn) {
      exitDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "disableDemoMode" });
      });
    }

    const demoBanner = document.getElementById("demo-banner");

    function renderProfileSwitcher(profiles, activeProfileId) {
      profileSwitcher.innerHTML = "";
      if (profiles && Array.isArray(profiles) && profiles.length > 0) {
        profiles.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || "SonarCloud";
          opt.title = `${p.name} · ${p.serverUrl} · ${p.projectKey}`;
          profileSwitcher.appendChild(opt);
        });
        if (activeProfileId) {
          profileSwitcher.value = activeProfileId;
        }
      } else {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "SonarCloud";
        profileSwitcher.appendChild(opt);
      }
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      try {
        vscode.postMessage({ command: "log", text: "Webview received postMessage: " + JSON.stringify({ type: message?.type, state: message?.state }) });
      } catch (_) {}
      switch (message.type) {
        case "loading": {
          if (message.loading) {
            loadingIndicator.classList.remove("hidden");
          } else {
            loadingIndicator.classList.add("hidden");
          }
          break;
        }
        case "loadingDetails": {
          if (message.loading) {
            issuesLoading.classList.remove("hidden");
          } else {
            issuesLoading.classList.add("hidden");
          }
          break;
        }
        case "qualityGate": {
          renderQualityGate(message.status);
          break;
        }
/* {{issueLifecycleMessageScript}} */
        case "details": {
          renderIssues(message.items || [], message.category, message.period);
          break;
        }
        case "state": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          if (message.state === "connected") {
            onboardingView.classList.add("hidden");
            noProfilesView.classList.add("hidden");
            connectedView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);

            if (message.isDemoMode) {
              demoBanner?.classList.remove("hidden");
            } else {
              demoBanner?.classList.add("hidden");
            }

            if (message.availableAgents && Array.isArray(message.availableAgents)) {
              targetAgentDropdown.innerHTML = "";
              message.availableAgents.forEach((agent) => {
                const opt = document.createElement("option");
                opt.value = agent.id;
                opt.textContent = agent.name;
                targetAgentDropdown.appendChild(opt);
              });
            }

            if (message.defaultAgent) {
              targetAgentDropdown.value = message.defaultAgent;
            }

            cachedProjects = message.projects || [];
            currentSelectedProjectKey = message.projectKey || "";

            const matched = cachedProjects.find((p) => p.key === currentSelectedProjectKey);
            if (matched) {
              projectSearchInput.value = matched.name === matched.key ? matched.key : matched.name + " (" + matched.key + ")";
            } else if (currentSelectedProjectKey) {
              projectSearchInput.value = currentSelectedProjectKey;
            } else {
              projectSearchInput.value = "";
            }

            renderProjectList("");

            if (message.overviewError) {
              overviewError.textContent = message.overviewError;
              overviewError.className = "alert error";
            } else {
              overviewError.className = "alert error hidden";
              overviewError.textContent = "";
              if (message.overview) {
                renderOverview(message.overview);
              }
            }
          } else if (message.state === "no-profiles") {
            demoBanner?.classList.add("hidden");
            connectedView.classList.add("hidden");
            onboardingView.classList.add("hidden");
            noProfilesView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
          } else {
            demoBanner?.classList.add("hidden");
            connectedView.classList.add("hidden");
            noProfilesView.classList.add("hidden");
            onboardingView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
            if (message.serverUrl && !serverUrlInput.value) {
              serverUrlInput.value = message.serverUrl;
            }
          }
          break;
        }
        case "connecting": {
          connectBtn.disabled = true;
          connectBtn.textContent = "Verifying connection...";
          clearAlert();
          break;
        }
        case "disconnected": {
          userTokenInput.value = "";
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          if (message.message) {
            showAlert(message.message, "info");
          }
          break;
        }
        case "error": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          showAlert(message.message);
          if (
            currentError &&
            message.message &&
            currentPanel &&
            !currentPanel.classList.contains("hidden")
          ) {
            currentError.textContent = message.message;
            currentError.className = "alert error";
          }
          break;
        }
        case "tabState": {
          setActiveTab(message.activeTab === "currentCode" ? "currentCode" : "overallCode");
          break;
        }
        case "currentCodeItems": {
          renderCurrentCodeItems(message.items || [], message.sonarLintInstalled, message.sourceLabel);
          break;
        }
        case "currentCodeCount": {
          updateCurrentTabCount(message.count || 0);
          break;
        }
        case "scanStatus": {
          if (currentLoading) {
            currentLoading.classList.toggle("hidden", !message.scanning);
          }
          if (runFullScanBtn) {
            runFullScanBtn.disabled = !!message.scanning;
            runFullScanBtn.textContent = message.scanning ? "Scanning…" : "Run Full Scan";
          }
          break;
        }
        case "codePeriodState": {
          setCodePeriodUI(message.period, message.hasNewCode);
          break;
        }
        case "overviewUpdated": {
          if (message.overviewError) {
            overviewError.textContent = message.overviewError;
            overviewError.className = "alert error";
          } else {
            overviewError.className = "alert error hidden";
            overviewError.textContent = "";
            if (message.overview) {
              renderOverview(message.overview);
            }
          }
          setCodePeriodUI(
            message.period || message.overview?.period || "overall",
            message.hasNewCode ?? message.overview?.hasNewCode,
          );
          break;
        }
      }
    });

    try {
      vscode?.postMessage({ command: "ready" });
      vscode?.postMessage({ command: "init" });
      vscode?.postMessage({ command: "log", text: "Webview script completed setup, posting ready & init" });
    } catch (_) {}
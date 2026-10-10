/**
 * Webview assets for the issue lifecycle overflow menu (transitions,
 * assign, comment). Extracted from SonarOverviewViewProvider to keep the
 * provider file manageable; interpolated into the webview HTML template.
 */

/** Webview JS: host "issueTransitions" message handler case. */
export const ISSUE_LIFECYCLE_MESSAGE_SCRIPT = `        case "issueTransitions": {
          const transitions = message.transitions || [];
          issueTransitionsCache[message.issueKey] = transitions;
          if (
            openIssueMenu &&
            openIssueMenu.issueKey === message.issueKey &&
            openIssueMenu.popover.isConnected
          ) {
            buildIssueMenu(openIssueMenu.popover, openIssueMenu.item, transitions);
          }
          break;
        }`;

/** Webview JS: "Issue actions" overflow button on issue cards. */
export const ISSUE_LIFECYCLE_CARD_BUTTON_SCRIPT = `      // Lifecycle actions (transitions / assign / comment) are only
      // supported for real issues, not hotspots/coverage/duplications.
      if (item.type === "BUG" || item.type === "VULNERABILITY" || item.type === "CODE_SMELL") {
        const menuBtn = document.createElement("button");
        menuBtn.className = "btn btn-secondary btn-sm";
        menuBtn.textContent = "⋯";
        menuBtn.title = "Issue actions";
        menuBtn.setAttribute("aria-label", "Issue actions for " + item.message);
        menuBtn.setAttribute("aria-haspopup", "true");
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleIssueMenu(card, item);
        });
        actionsDiv.appendChild(menuBtn);
      }
`;

/** Webview JS: overflow menu construction, popover, comment form. */
export const ISSUE_LIFECYCLE_MENU_SCRIPT = `    // ---- Issue lifecycle overflow menu (⋯) ----
    // Transitions are fetched lazily from the host (cached per issue key);
    // the menu is rebuilt from this cache after the host responds.
    const issueTransitionsCache = {};
    let openIssueMenu = null; // { popover, issueKey, item }

    function humanizeTransitionLabel(transition) {
      switch (transition) {
        case "falsepositive": return "Mark as False Positive";
        case "wontfix": return "Accept (Won\u2019t Fix)";
        case "confirm": return "Confirm";
        case "unconfirm": return "Unconfirm";
        case "reopen": return "Reopen";
        case "resolve": return "Resolve";
        default: return transition.charAt(0).toUpperCase() + transition.slice(1);
      }
    }

    function closeIssueMenu() {
      if (openIssueMenu) {
        openIssueMenu.popover.remove();
        openIssueMenu = null;
      }
      document.removeEventListener("click", onIssueMenuDocClick);
    }

    function onIssueMenuDocClick(e) {
      if (openIssueMenu && !openIssueMenu.popover.contains(e.target)) {
        closeIssueMenu();
      }
    }

    function toggleIssueMenu(card, item) {
      if (openIssueMenu && openIssueMenu.issueKey === item.id) {
        closeIssueMenu();
        return;
      }
      closeIssueMenu();

      const popover = document.createElement("div");
      popover.className = "issue-menu-popover";
      popover.setAttribute("role", "menu");

      const cached = issueTransitionsCache[item.id];
      if (cached) {
        buildIssueMenu(popover, item, cached);
      } else {
        popover.innerHTML = '<div class="issue-menu-loading">Loading actions\u2026</div>';
        vscode.postMessage({ command: "fetchIssueTransitions", issueKey: item.id });
      }

      card.appendChild(popover);
      openIssueMenu = { popover: popover, issueKey: item.id, item: item };
      // Defer so the click that opened the menu doesn't immediately close it.
      setTimeout(() => document.addEventListener("click", onIssueMenuDocClick), 0);
    }

    function buildIssueMenu(popover, item, transitions) {
      popover.innerHTML = "";

      if (!transitions || transitions.length === 0) {
        popover.innerHTML = '<div class="issue-menu-empty">No actions available for this issue.</div>';
      } else {
        transitions.forEach((transition) => {
          const btn = document.createElement("button");
          btn.className = "issue-menu-item";
          btn.setAttribute("role", "menuitem");
          btn.textContent = humanizeTransitionLabel(transition);
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            vscode.postMessage({ command: "issueTransition", issueKey: item.id, transition: transition });
            closeIssueMenu();
          });
          popover.appendChild(btn);
        });
      }

      const divider = document.createElement("div");
      divider.className = "issue-menu-divider";
      popover.appendChild(divider);

      const assignBtn = document.createElement("button");
      assignBtn.className = "issue-menu-item";
      assignBtn.setAttribute("role", "menuitem");
      assignBtn.textContent = "Assign to me";
      assignBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "assignIssue", issueKey: item.id });
        closeIssueMenu();
      });
      popover.appendChild(assignBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className = "issue-menu-item";
      commentBtn.setAttribute("role", "menuitem");
      commentBtn.textContent = "Add comment\u2026";
      commentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showIssueCommentForm(popover, item, transitions);
      });
      popover.appendChild(commentBtn);
    }

    function showIssueCommentForm(popover, item, transitions) {
      popover.innerHTML = "";

      const textarea = document.createElement("textarea");
      textarea.className = "issue-menu-textarea";
      textarea.rows = 3;
      textarea.placeholder = "Write a comment\u2026";
      textarea.setAttribute("aria-label", "Comment text");
      popover.appendChild(textarea);

      const row = document.createElement("div");
      row.className = "issue-menu-form-row";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-secondary btn-sm";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        buildIssueMenu(popover, item, transitions);
      });

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-agent btn-sm";
      saveBtn.textContent = "Comment";
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = textarea.value.trim();
        if (text) {
          vscode.postMessage({ command: "addIssueComment", issueKey: item.id, text: text });
          closeIssueMenu();
        } else {
          textarea.focus();
        }
      });

      row.appendChild(cancelBtn);
      row.appendChild(saveBtn);
      popover.appendChild(row);

      textarea.focus();
    }
`;

/** CSS for the issue lifecycle overflow menu (popover, items, comment form). */
export const ISSUE_LIFECYCLE_CSS = `      position: relative;
    }

    .issue-menu-popover {
      position: absolute;
      right: 8px;
      bottom: 40px;
      z-index: 30;
      min-width: 196px;
      max-width: 250px;
      background: var(--vscode-menu-background, var(--vscode-dropdown-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      padding: 4px;
    }

    .issue-menu-item {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      font-size: 11px;
      padding: 6px 8px;
      cursor: pointer;
      font-family: inherit;
    }

    .issue-menu-item:hover,
    .issue-menu-item:focus-visible {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
      outline: none;
    }

    .issue-menu-divider {
      height: 1px;
      margin: 4px 2px;
      background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border));
    }

    .issue-menu-loading,
    .issue-menu-empty {
      padding: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .issue-menu-textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
      border-radius: 4px;
      padding: 6px;
      font-size: 11px;
      font-family: inherit;
      resize: vertical;
    }

    .issue-menu-textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .issue-menu-form-row {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      margin-top: 6px;`;

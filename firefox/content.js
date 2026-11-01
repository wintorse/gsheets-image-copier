(() => {
  "use strict";

  const {
    SELECTORS, IMAGE_MENU_MARKERS, MENU_ACTIONS, MENU_ACTION_ATTRIBUTE,
    DOWNLOAD_IMAGE_MESSAGE_TYPE, FEEDBACK_RESET_DELAY_MS, DOWNLOAD_FILENAME_PREFIX,
    getLocalizedText, getImageBlob, ensurePngBlob, blobToDataUrl,
    getImageExtension, isVisibleElement
  } = globalThis.GSheetsImageCopier;

  /**
   * RequestAnimationFrame handle for coalescing frequent Google Sheets DOM
   * mutations into a single menu scan.
   * @type {number | null}
   */
  let scheduledMenuScan = null;

  observeMenus();
  scheduleMenuScan();

  /**
   * Starts observing the document for Google Sheets menu insertions.
   *
   * Sheets creates its menus directly under `body` and rebuilds them often, so a
   * document-level observer is more reliable than attaching to a specific menu
   * node that may disappear immediately after a click.
   */
  function observeMenus() {
    const observer = new MutationObserver(scheduleMenuScan);

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"]
    });
  }

  /**
   * Schedules a scan for visible image menus without running one for every DOM
   * mutation emitted by Sheets.
   */
  function scheduleMenuScan() {
    if (scheduledMenuScan !== null) {
      return;
    }

    scheduledMenuScan = window.requestAnimationFrame(() => {
      scheduledMenuScan = null;
      enhanceVisibleImageMenus();
    });
  }

  /**
   * Finds visible embedded-image menus and appends copy/save entries when they
   * have not already been enhanced.
   */
  function enhanceVisibleImageMenus() {
    const menus = Array.from(document.querySelectorAll(SELECTORS.menu));

    for (const menu of menus) {
      if (!(menu instanceof HTMLElement)) {
        continue;
      }

      if (!isVisibleElement(menu) || !isImageOptionsMenu(menu)) {
        continue;
      }

      appendMenuItems(menu);
    }
  }

  /**
   * Checks whether a menu is the image options menu. The menu text is the safer
   * signal here because Sheets builds the menu before the user clicks our custom
   * action; image lookup happens only when the action runs.
   *
   * @param {HTMLElement} menu Candidate Google menu element.
   * @returns {boolean} True when the menu should receive image actions.
   */
  function isImageOptionsMenu(menu) {
    const menuText = Array.from(menu.querySelectorAll(SELECTORS.menuContent))
      .map((item) => item.textContent?.trim() || "")
      .join("\n");

    return IMAGE_MENU_MARKERS.some((marker) => menuText.includes(marker));
  }

  /**
   * Ensures the extension's copy/save items are the final entries in a Sheets
   * image menu. It avoids moving the nodes when they are already in place,
   * because Sheets emits menu mutations frequently and moving the clicked node
   * can interrupt the browser's pointer/click sequence.
   *
   * @param {HTMLElement} menu Google Sheets menu element.
   */
  function appendMenuItems(menu) {
    const copyItem = getOrCreateMenuItem(menu, MENU_ACTIONS.copy);
    const saveItem = getOrCreateMenuItem(menu, MENU_ACTIONS.save);

    if (areMenuItemsAlreadyLast(menu, copyItem, saveItem)) {
      return;
    }

    menu.appendChild(copyItem);
    menu.appendChild(saveItem);
  }

  /**
   * Returns an existing extension-owned menu item or creates it when Sheets has
   * rebuilt the menu from scratch.
   *
   * @param {HTMLElement} menu Google Sheets menu element.
   * @param {"copy" | "save"} action Action represented by the menu item.
   * @returns {HTMLDivElement} Existing or newly created menu item.
   */
  function getOrCreateMenuItem(menu, action) {
    const existingItem = menu.querySelector(`[${MENU_ACTION_ATTRIBUTE}="${action}"]`);
    return existingItem instanceof HTMLDivElement ? existingItem : createMenuItem(action);
  }

  /**
   * Checks whether copy and save are already the last two element children in
   * the intended order.
   *
   * @param {HTMLElement} menu Google Sheets menu element.
   * @param {HTMLDivElement} copyItem Extension copy menu item.
   * @param {HTMLDivElement} saveItem Extension save menu item.
   * @returns {boolean} True when no DOM move is needed.
   */
  function areMenuItemsAlreadyLast(menu, copyItem, saveItem) {
    const elementChildren = Array.from(menu.children);
    return (
      elementChildren.at(-2) === copyItem &&
      elementChildren.at(-1) === saveItem
    );
  }

  /**
   * Creates one Google-style menu item for a custom image action.
   *
   * @param {"copy" | "save"} action Action to run when the item is clicked.
   * @returns {HTMLDivElement} Menu item ready to append to a Google menu.
   */
  function createMenuItem(action) {
    const localizedText = getLocalizedText();
    const item = document.createElement("div");
    item.className = "goog-menuitem";
    item.setAttribute("role", "menuitem");
    item.setAttribute(MENU_ACTION_ATTRIBUTE, action);
    item.style.userSelect = "none";

    const content = document.createElement("div");
    content.className = "goog-menuitem-content";
    content.textContent = localizedText.menu[action];
    item.appendChild(content);

    item.addEventListener("mousedown", stopMenuEvent, true);
    item.addEventListener("mouseup", stopMenuEvent, true);
    item.addEventListener("mouseenter", () => setMenuItemHighlighted(item, true));
    item.addEventListener("mouseleave", () => setMenuItemHighlighted(item, false));
    item.addEventListener("focus", () => setMenuItemHighlighted(item, true));
    item.addEventListener("blur", () => setMenuItemHighlighted(item, false));
    item.addEventListener(
      "click",
      (event) => {
        stopMenuEvent(event);
        void runMenuAction(action, item);
      },
      true
    );

    return item;
  }

  /**
   * Mirrors Google Sheets' hover class on extension-owned menu items so the
   * native menu CSS handles highlighting consistently.
   *
   * @param {HTMLElement} item Extension-owned menu item.
   * @param {boolean} isHighlighted Whether the item should appear highlighted.
   */
  function setMenuItemHighlighted(item, isHighlighted) {
    item.classList.toggle("goog-menuitem-highlight", isHighlighted);
  }

  /**
   * Prevents the host application's menu machinery from handling an injected
   * item click as if it were a native Google Sheets command.
   *
   * @param {Event} event Pointer or click event fired on an injected item.
   */
  function stopMenuEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Runs the selected extension action against the single focused Sheets image.
   *
   * @param {"copy" | "save"} action Action requested from the injected menu.
   * @param {HTMLElement} item Clicked menu item used for local feedback.
   */
  async function runMenuAction(action, item) {
    const localizedText = getLocalizedText();

    showTemporaryFeedback(
      item,
      action === MENU_ACTIONS.copy
        ? localizedText.feedback.copyBusy
        : localizedText.feedback.saveBusy,
      false
    );

    try {
      if (action === MENU_ACTIONS.copy) {
        await copySelectedImage();
        showTemporaryFeedback(item, localizedText.feedback.copyDone);
        return;
      }

      await saveSelectedImage();
      showTemporaryFeedback(item, localizedText.feedback.saveDone);
    } catch (error) {
      console.warn("[gsheets-image-copier] Failed to handle selected image.", error);
      showTemporaryFeedback(
        item,
        isNoSelectedImageError(error)
          ? localizedText.feedback.noImage
          : action === MENU_ACTIONS.copy
            ? localizedText.feedback.copyFail
            : localizedText.feedback.saveFail
      );
    }
  }

  /**
   * Returns the only visible focused Google Sheets embedded image, or null when
   * no visible image or multiple visible images are selected.
   *
   * Google Sheets can leave focused-class overlays outside the active
   * `*-focused-overlay-container`. The image action ignores those broader
   * overlays and uses only the visible overlay under the focused overlay
   * container.
   *
   * @returns {HTMLImageElement | null} The single selected image element.
   */
  function getSingleSelectedImage() {
    return getSingleImageFromFocusedOverlays(
      Array.from(document.querySelectorAll(SELECTORS.focusedOverlay)).filter(
        (element) => element instanceof HTMLElement
      )
    );
  }

  /**
   * Chooses one selected image from focused overlays after removing hidden
   * duplicate or stale overlays that Sheets leaves outside the focused overlay
   * container.
   *
   * @param {HTMLElement[]} focusedOverlays Focused overlay candidates.
   * @returns {HTMLImageElement | null} Single visible selected image.
   */
  function getSingleImageFromFocusedOverlays(focusedOverlays) {
    const activeOverlays = focusedOverlays.filter(isActiveFocusedOverlay);

    if (activeOverlays.length !== 1) {
      return null;
    }

    const selectedImage = activeOverlays[0].querySelector(SELECTORS.image);
    return selectedImage instanceof HTMLImageElement ? selectedImage : null;
  }

  /**
   * Checks whether a focused overlay is the visible, actionable overlay under
   * Sheets' active focused overlay container.
   *
   * @param {HTMLElement} overlay Focused embedded-object overlay candidate.
   * @returns {boolean} True when the overlay should be treated as selected.
   */
  function isActiveFocusedOverlay(overlay) {
    const selectedImage = overlay.querySelector(SELECTORS.image);

    return (
      Boolean(overlay.closest(SELECTORS.focusedOverlayContainer)) &&
      isVisibleElement(overlay) &&
      selectedImage instanceof HTMLImageElement &&
      Boolean(selectedImage.currentSrc || selectedImage.src)
    );
  }

  /**
   * Starts a clipboard write for the selected image while the menu click still
   * has user activation. `ClipboardItem` accepts a Promise for the image bytes,
   * which lets the browser authorize the write immediately and resolve the blob
   * afterward.
   *
   * @returns {Promise<void>} Resolves after the clipboard write succeeds.
   */
  async function copySelectedImage() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Image clipboard writing is not supported.");
    }

    const pngBlob = getSelectedImageBlob().then(ensurePngBlob);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  }

  /**
   * Saves the selected image visible in this content script's document.
   *
   * @returns {Promise<void>} Resolves after Chrome accepts the download request.
   */
  async function saveSelectedImage() {
    await saveImageBlob(await getSelectedImageBlob());
  }

  /**
   * Resolves the selected image visible in this content script's document to a
   * blob.
   *
   * @returns {Promise<Blob>} Selected image blob.
   */
  async function getSelectedImageBlob() {
    const selectedImage = getSingleSelectedImage();

    if (!selectedImage) {
      throw new Error("No selected image is available.");
    }

    return getImageBlob(selectedImage);
  }

  /**
   * Sends a selected image blob to the extension service worker for download.
   *
   * @param {Blob} blob Image blob to save.
   * @returns {Promise<void>} Resolves after Chrome accepts the download request.
   */
  async function saveImageBlob(blob) {
    const dataUrl = await blobToDataUrl(blob);
    const filename = createDownloadFilename(blob);

    await sendRuntimeMessage({
      type: DOWNLOAD_IMAGE_MESSAGE_TYPE,
      dataUrl,
      filename
    });
  }

  /**
   * Wraps `chrome.runtime.sendMessage` in a Promise and surfaces extension
   * runtime errors as normal exceptions.
   *
   * @param {Record<string, unknown>} message Runtime message.
   * @returns {Promise<Record<string, unknown> | undefined>} Runtime response.
   */
  async function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok && response?.error) {
          reject(new Error(response?.error || "Download request failed."));
          return;
        }

        resolve(response);
      });
    });
  }

  /**
   * Builds a filesystem-safe filename for a Google Sheets image download.
   *
   * @param {Blob} blob Image blob being saved.
   * @returns {string} Download filename with an extension derived from MIME type.
   */
  function createDownloadFilename(blob) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${DOWNLOAD_FILENAME_PREFIX}-${timestamp}.${getImageExtension(blob.type)}`;
  }

  /**
   * Temporarily replaces the menu item label with operation feedback.
   *
   * @param {HTMLElement} item Injected menu item.
   * @param {string} label Feedback label to show.
   * @param {boolean} shouldReset Whether to restore the normal action label.
   */
  function showTemporaryFeedback(item, label, shouldReset = true) {
    const action = item.getAttribute(MENU_ACTION_ATTRIBUTE);
    const content = item.querySelector(SELECTORS.menuContent);

    if (!content || !(action === MENU_ACTIONS.copy || action === MENU_ACTIONS.save)) {
      return;
    }

    content.textContent = label;

    if (!shouldReset) {
      return;
    }

    window.setTimeout(() => {
      content.textContent = getLocalizedText().menu[action];
    }, FEEDBACK_RESET_DELAY_MS);
  }

  /**
   * Checks whether an operation failed because there is no usable selected image.
   *
   * @param {unknown} error Error thrown by copy or save flow.
   * @returns {boolean} True when the user-facing no-image message is appropriate.
   */
  function isNoSelectedImageError(error) {
    return error instanceof Error && error.message.includes("No selected image");
  }
})();

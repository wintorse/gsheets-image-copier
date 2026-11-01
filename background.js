"use strict";

/**
 * Message type used by the content script when it has resolved the selected
 * Google Sheets image into a downloadable data URL.
 * @type {"GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE"}
 */
const DOWNLOAD_IMAGE_MESSAGE_TYPE = "GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE";

// Firefox requires a background-page blob URL rather than a data URL.
const USE_BLOB_DOWNLOADS =
  typeof browser !== "undefined" && typeof browser.runtime?.getBrowserInfo === "function";
const pendingBlobUrls = new Map();

if (USE_BLOB_DOWNLOADS) {
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current === "complete" || delta.state?.current === "interrupted") {
      releaseBlobUrl(delta.id);
    }
  });
}

/**
 * Handles download requests from content scripts.
 *
 * The content script owns Google Sheets DOM inspection and image extraction;
 * the service worker only owns the Chrome Downloads API.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isDownloadImageMessage(message)) {
    return false;
  }

  (async () => {
    let blobUrl;
    try {
      if (USE_BLOB_DOWNLOADS) {
        const blob = await (await fetch(message.dataUrl)).blob();
        blobUrl = URL.createObjectURL(blob);
      }

      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download(
          { url: blobUrl || message.dataUrl, filename: message.filename, saveAs: false },
          (id) => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message));
            else resolve(id);
          }
        );
      });

      if (blobUrl) {
        pendingBlobUrls.set(downloadId, blobUrl);
        // A small download can finish before its ID reaches the callback.
        chrome.downloads.search({ id: downloadId }, (items) => {
          if (chrome.runtime.lastError) return;
          if (items[0]?.state === "complete" || items[0]?.state === "interrupted") {
            releaseBlobUrl(downloadId);
          }
        });
      }
      sendResponse({ ok: true, downloadId });
    } catch (error) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});

/**
 * Checks whether an incoming extension message is the download request shape
 * expected by this service worker.
 *
 * @param {unknown} message Incoming message from a content script.
 * @returns {boolean} True when the message can be used for a download.
 */
function isDownloadImageMessage(message) {
  return Boolean(
    message &&
      typeof message === "object" &&
      "type" in message &&
      "dataUrl" in message &&
      "filename" in message &&
      message.type === DOWNLOAD_IMAGE_MESSAGE_TYPE &&
      typeof message.dataUrl === "string" &&
      message.dataUrl.startsWith("data:image/") &&
      typeof message.filename === "string" &&
      message.filename.length > 0
  );
}

function releaseBlobUrl(downloadId) {
  const blobUrl = pendingBlobUrls.get(downloadId);
  if (!blobUrl) return;
  URL.revokeObjectURL(blobUrl);
  pendingBlobUrls.delete(downloadId);
}

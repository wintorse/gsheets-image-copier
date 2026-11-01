"use strict";

/**
 * Message type used by the content script when it has resolved the selected
 * Google Sheets image into a downloadable data URL.
 * @type {"GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE"}
 */
const DOWNLOAD_IMAGE_MESSAGE_TYPE = "GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE";

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

  chrome.downloads.download(
    {
      url: message.dataUrl,
      filename: message.filename,
      saveAs: false
    },
    (downloadId) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        sendResponse({ ok: false, error: runtimeError.message });
        return;
      }

      sendResponse({ ok: true, downloadId });
    }
  );

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

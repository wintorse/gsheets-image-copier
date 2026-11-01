(() => {
  "use strict";

  /**
   * Resolves an image element to a Blob. Fetching the existing `blob:` URL keeps
   * the original bytes when Sheets exposes them; canvas rendering is kept as a
   * fallback for image URLs that cannot be fetched directly from the content
   * script.
   *
   * @param {HTMLImageElement} image Selected Google Sheets image element.
   * @returns {Promise<Blob>} Image blob suitable for clipboard or download.
   */
  async function getImageBlob(image) {
    const fetchedBlob = await fetchImageBlob(image).catch(() => null);

    if (fetchedBlob && fetchedBlob.size > 0) {
      return fetchedBlob;
    }

    return renderImageToPngBlob(image);
  }

  /**
   * Fetches the current image source as a blob.
   *
   * @param {HTMLImageElement} image Selected Google Sheets image element.
   * @returns {Promise<Blob>} Blob returned by the browser fetch pipeline.
   */
  async function fetchImageBlob(image) {
    const imageUrl = image.currentSrc || image.src;

    if (!imageUrl) {
      throw new Error("Selected image has no source URL.");
    }

    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`);
    }

    const blob = await response.blob();
    return blob.type ? blob : new Blob([blob], { type: "image/png" });
  }

  /**
   * Renders an image element into a PNG blob via canvas.
   *
   * @param {HTMLImageElement} image Selected Google Sheets image element.
   * @returns {Promise<Blob>} PNG blob rendered from the image element.
   */
  async function renderImageToPngBlob(image) {
    await waitForImageDecode(image);

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("Selected image has no drawable dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create a canvas context.");
    }

    context.drawImage(image, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Canvas did not produce an image blob."));
      }, "image/png");
    });
  }

  /**
   * Waits for the image to be drawable when the browser has not completed
   * decoding it yet.
   *
   * @param {HTMLImageElement} image Selected Google Sheets image element.
   * @returns {Promise<void>} Resolves when the image is ready to draw.
   */
  async function waitForImageDecode(image) {
    if (image.complete && image.naturalWidth > 0) {
      return;
    }

    if (typeof image.decode === "function") {
      await image.decode();
      return;
    }

    await new Promise((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Image failed to load.")), {
        once: true
      });
    });
  }

  /**
   * Returns a PNG blob because Chromium's image clipboard support is most
   * reliable with `image/png`, regardless of the source image format.
   *
   * @param {Blob} blob Source image blob.
   * @returns {Promise<Blob> | Blob} PNG representation of the source image.
   */
  function ensurePngBlob(blob) {
    return blob.type === "image/png" ? blob : convertBlobToPng(blob);
  }

  /**
   * Converts a non-PNG image blob to PNG for clipboard implementations.
   *
   * @param {Blob} blob Source image blob.
   * @returns {Promise<Blob>} PNG representation of the source image.
   */
  async function convertBlobToPng(blob) {
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await loadImage(objectUrl);
      return renderImageToPngBlob(image);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /**
   * Loads an object URL into a temporary image element.
   *
   * @param {string} url Object URL created for a blob.
   * @returns {Promise<HTMLImageElement>} Loaded image element.
   */
  async function loadImage(url) {
    const image = new Image();
    image.src = url;
    await waitForImageDecode(image);
    return image;
  }

  /**
   * Converts a blob into a data URL that can cross the content-script to
   * service-worker boundary.
   *
   * @param {Blob} blob Image blob to encode.
   * @returns {Promise<string>} Data URL containing the blob bytes.
   */
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("FileReader did not return a data URL."));
      });
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Maps common image MIME types to file extensions.
   *
   * @param {string} mimeType Blob MIME type.
   * @returns {string} File extension without a leading dot.
   */
  function getImageExtension(mimeType) {
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "image/svg+xml":
        return "svg";
      case "image/png":
      default:
        return "png";
    }
  }

  /**
   * Checks whether a menu is currently visible enough to be enhanced.
   *
   * @param {HTMLElement} element Candidate menu element.
   * @returns {boolean} True when the element is displayed and has layout.
   */
  function isVisibleElement(element) {
    const ownerWindow = element.ownerDocument.defaultView || window;
    const style = ownerWindow.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  Object.assign(globalThis.GSheetsImageCopier, {
    getImageBlob, ensurePngBlob, blobToDataUrl, getImageExtension, isVisibleElement
  });
})();

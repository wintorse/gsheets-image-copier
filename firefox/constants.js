(() => {
  "use strict";

  /**
   * Selectors are based on the Google Sheets image-selection and menu markup
   * observed in the provided DOM snapshots. The menu selector intentionally has
   * a broad fallback because Google occasionally omits ARIA attributes while a
   * menu is being constructed.
   * @type {{ focusedOverlay: string, focusedOverlayContainer: string, image: string, menu: string, menuContent: string }}
   */
  const SELECTORS = {
    focusedOverlay:
      "[id$='-focused-overlay-container'] > :is(.overlay-container-ltr, .overlay-container-rtl).focused-overlay-container > .waffle-borderless-embedded-object-overlay.waffle-borderless-embedded-object-overlay-focused",
    focusedOverlayContainer: "[id$='-focused-overlay-container']",
    image: "img",
    menu:
      "body > div.goog-menu.goog-menu-vertical.docs-material.goog-menu-noaccel.goog-menu-noicon.apps-menu-hide-mnemonics, .goog-menu[role='menu'], .goog-menu.goog-menu-vertical",
    menuContent: ".goog-menuitem-content"
  };

  /**
   * Text markers that identify the Google Sheets embedded-image menu rather
   * than another open Docs menu, across the supported page languages.
   * @type {readonly string[]}
   */
  const IMAGE_MENU_MARKERS = Object.freeze([
    // English
    "Replace image",
    "Delete image",
    // Japanese
    "画像を置換",
    "画像を削除",
    // Chinese Simplified
    "替换图片",
    "删除图片",
    // Chinese Traditional
    "取代圖片",
    "替換圖片",
    "刪除圖片",
    // Korean
    "이미지 바꾸기",
    "이미지 삭제",
    // Spanish
    "Reemplazar imagen",
    "Eliminar imagen",
    // Portuguese
    "Substituir imagem",
    "Excluir imagem",
    "Eliminar imagem",
    // French
    "Remplacer l'image",
    "Supprimer l'image",
    // German
    "Bild ersetzen",
    "Bild löschen",
    // Russian
    "Заменить изображение",
    "Удалить изображение",
    // Italian
    "Sostituisci immagine",
    "Elimina immagine",
    // Dutch
    "Afbeelding vervangen",
    "Afbeelding verwijderen",
    // Indonesian
    "Ganti gambar",
    "Hapus gambar",
    // Arabic
    "استبدال الصورة",
    "حذف الصورة",
    // Hindi
    "इमेज बदलें",
    "चित्र मिटाएं",
    // Hebrew
    "החלפת תמונה",
    "מחיקת תמונה",
    // Many languages use the term "Content Credentials" as-is
    "Content Credentials"
  ]);

  /**
   * Action identifiers stored on injected menu items so repeated DOM mutation
   * scans do not add duplicate entries.
   * @type {{ copy: "copy", save: "save" }}
   */
  const MENU_ACTIONS = Object.freeze({
    copy: "copy",
    save: "save"
  });

  /**
   * Attribute used to identify menu items owned by this extension.
   * @type {"data-gsheets-image-copier-action"}
   */
  const MENU_ACTION_ATTRIBUTE = "data-gsheets-image-copier-action";

  /**
   * Message type mirrored in `background.js` for download requests.
   * @type {"GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE"}
   */
  const DOWNLOAD_IMAGE_MESSAGE_TYPE = "GSHEETS_IMAGE_COPIER_DOWNLOAD_IMAGE";

  /**
   * Delay before a clicked menu item returns to its normal label.
   * @type {number}
   */
  const FEEDBACK_RESET_DELAY_MS = 1400;

  /**
   * Base filename used when saving a selected Google Sheets image.
   * @type {"google-sheets-image"}
   */
  const DOWNLOAD_FILENAME_PREFIX = "google-sheets-image";

  globalThis.GSheetsImageCopier = {
    SELECTORS, IMAGE_MENU_MARKERS, MENU_ACTIONS, MENU_ACTION_ATTRIBUTE,
    DOWNLOAD_IMAGE_MESSAGE_TYPE, FEEDBACK_RESET_DELAY_MS, DOWNLOAD_FILENAME_PREFIX
  };
})();

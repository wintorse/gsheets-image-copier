(() => {
  "use strict";

  /**
   * Localized labels for the inserted menu entries and short-lived operation
   * feedback. Google Sheets exposes the active language through `html[lang]`,
   * so the extension keeps localization inside the content script rather than
   * using Chrome's extension i18n files.
   * @type {Record<"en" | "ja" | "ko" | "zh-CN" | "zh-TW", { menu: Record<"copy" | "save", string>, feedback: Record<string, string> }>}
   */
  const I18N_TEXT = Object.freeze({
    en: {
      menu: {
        copy: "Copy image",
        save: "Save image"
      },
      feedback: {
        copyBusy: "Copying...",
        copyDone: "Copied",
        copyFail: "Could not copy",
        saveBusy: "Saving...",
        saveDone: "Saved",
        saveFail: "Could not save",
        noImage: "Select an image"
      }
    },
    ja: {
      menu: {
        copy: "画像をコピー",
        save: "画像を保存"
      },
      feedback: {
        copyBusy: "コピー中...",
        copyDone: "コピーしました",
        copyFail: "コピーできませんでした",
        saveBusy: "保存中...",
        saveDone: "保存しました",
        saveFail: "保存できませんでした",
        noImage: "画像を選択してください"
      }
    },
    ko: {
      menu: {
        copy: "이미지 복사",
        save: "이미지 저장"
      },
      feedback: {
        copyBusy: "복사 중...",
        copyDone: "복사했습니다",
        copyFail: "복사할 수 없습니다",
        saveBusy: "저장 중...",
        saveDone: "저장했습니다",
        saveFail: "저장할 수 없습니다",
        noImage: "이미지를 선택하세요"
      }
    },
    "zh-CN": {
      menu: {
        copy: "复制图片",
        save: "保存图片"
      },
      feedback: {
        copyBusy: "正在复制...",
        copyDone: "已复制",
        copyFail: "无法复制",
        saveBusy: "正在保存...",
        saveDone: "已保存",
        saveFail: "无法保存",
        noImage: "请选择图片"
      }
    },
    "zh-TW": {
      menu: {
        copy: "複製圖片",
        save: "儲存圖片"
      },
      feedback: {
        copyBusy: "正在複製...",
        copyDone: "已複製",
        copyFail: "無法複製",
        saveBusy: "正在儲存...",
        saveDone: "已儲存",
        saveFail: "無法儲存",
        noImage: "請選取圖片"
      }
    }
  });

  /**
   * Returns localized text for the current Google Sheets language.
   *
   * @returns {{ menu: Record<"copy" | "save", string>, feedback: Record<string, string> }} Text bundle for the page language.
   */
  function getLocalizedText() {
    return I18N_TEXT[getPageLanguage()];
  }

  /**
   * Maps `html[lang]` to the extension's supported text bundles.
   * Other languages fall back to English.
   *
   * @returns {"en" | "ja" | "ko" | "zh-CN" | "zh-TW"} Supported language key.
   */
  function getPageLanguage() {
    const pageLanguage = document.documentElement.lang.trim().toLowerCase();

    if (pageLanguage === "ja") {
      return "ja";
    }

    if (pageLanguage === "zh-cn") {
      return "zh-CN";
    }

    if (pageLanguage === "ko" || pageLanguage.startsWith("ko-")) {
      return "ko";
    }

    if (/^zh-(?:tw|hk|mo|hant)(?:-|$)/.test(pageLanguage)) {
      return "zh-TW";
    }

    return "en";
  }

  Object.assign(globalThis.GSheetsImageCopier, { getLocalizedText });
})();

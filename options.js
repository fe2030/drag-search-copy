// デフォルト設定
const DEFAULT_SETTINGS = {
  // 通常のドラッグ
  up: 'google',
  down: 'twitter',
  left: 'amazon',
  right: 'copy',
  // 大きくドラッグ
  upFar: 'none',
  downFar: 'none',
  leftFar: 'none',
  rightFar: 'none',
  // 大きくドラッグ機能のオン/オフ
  farDragEnabled: false,
  // 視覚ガイドのオン/オフ
  enableGuides: true
};

// DOM要素 - 通常のドラッグ
const upSelect = document.getElementById('upAction');
const downSelect = document.getElementById('downAction');
const leftSelect = document.getElementById('leftAction');
const rightSelect = document.getElementById('rightAction');

// DOM要素 - 大きくドラッグ
const upFarSelect = document.getElementById('upFarAction');
const downFarSelect = document.getElementById('downFarAction');
const leftFarSelect = document.getElementById('leftFarAction');
const rightFarSelect = document.getElementById('rightFarAction');

// その他のDOM要素
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const dragToggle = document.getElementById('dragToggle');
const farDragCheckbox = document.getElementById('farDragCheckbox');
const enableGuidesCheckbox = document.getElementById('enableGuidesCheckbox');
const resetButton = document.getElementById('resetButton');

let farDragSections = null;
let tripleClickUsed = false; // 3回クリックが既に使用されたかどうか

// i18n マッピング
const OPTION_I18N_MAP = {
  'none': 'actionNone',
  'google': 'searchGoogle',
  'youtube': 'searchYoutube',
  'twitter': 'searchTwitter',
  'reddit': 'nameReddit',
  'rakuten': 'searchRakuten',
  'amazon': 'searchAmazon',
  'maps': 'searchMaps',
  'deepl': 'translateDeepL',
  'gtranslate': 'translateGoogle',
  'chatgpt': 'nameChatGPT',
  'claude': 'nameClaude',
  'gemini': 'nameGemini',
  'copy': 'actionCopy'
};

const OPTGROUP_LABEL_MAP = {
  '検索': 'groupSearch',
  '翻訳': 'groupTranslation',
  'AI（入力欄に自動入力）': 'groupAI',
  'その他': 'groupOther'
};

// ページ要素のローカライズ
function localizeHtmlPage() {
  // data-i18n 属性を持つ要素を翻訳
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.textContent = message;
    }
  });

  // ドロップダウンのオプションを翻訳
  document.querySelectorAll('option').forEach(opt => {
    const key = OPTION_I18N_MAP[opt.value];
    if (key) {
      opt.textContent = chrome.i18n.getMessage(key);
    }
  });

  // optgroupのラベルを翻訳
  document.querySelectorAll('optgroup').forEach(group => {
    // 現在のラベルに基づいて翻訳（HTMLが日本語のため）
    const key = OPTGROUP_LABEL_MAP[group.label];
    if (key) {
      group.label = chrome.i18n.getMessage(key);
    }
  });

  // タイトルタグの翻訳
  document.title = chrome.i18n.getMessage('settingsTitle');
}

// 設定を読み込んでUIに反映
function loadSettings() {
  // DOM要素を取得
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }

  try {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      if (chrome.runtime.lastError) {
        console.error('設定の読み込みに失敗:', chrome.runtime.lastError);
        // デフォルト値を使用
        applySettingsToUI(DEFAULT_SETTINGS);
        return;
      }
      applySettingsToUI(settings);
    });
  } catch (e) {
    console.error('設定の読み込み中にエラー:', e);
    applySettingsToUI(DEFAULT_SETTINGS);
  }
}

// 設定をUIに適用
function applySettingsToUI(settings) {
  // 通常のドラッグ
  upSelect.value = settings.up || DEFAULT_SETTINGS.up;
  downSelect.value = settings.down || DEFAULT_SETTINGS.down;
  leftSelect.value = settings.left || DEFAULT_SETTINGS.left;
  rightSelect.value = settings.right || DEFAULT_SETTINGS.right;

  // 大きくドラッグ
  upFarSelect.value = settings.upFar || DEFAULT_SETTINGS.upFar;
  downFarSelect.value = settings.downFar || DEFAULT_SETTINGS.downFar;
  leftFarSelect.value = settings.leftFar || DEFAULT_SETTINGS.leftFar;
  rightFarSelect.value = settings.rightFar || DEFAULT_SETTINGS.rightFar;

  // 大きくドラッグ機能のオン/オフ状態を反映
  const farDragEnabled = settings.farDragEnabled !== undefined ? settings.farDragEnabled : DEFAULT_SETTINGS.farDragEnabled;

  if (farDragEnabled) {
    // セクションを表示
    toggleFarDragSection(true);
    // 3回クリックは既に使用済みとしてマーク
    tripleClickUsed = true;
    // カーソルを通常に戻す
    if (dragToggle) {
      dragToggle.style.cursor = 'default';
    }
  } else {
    // セクションを非表示
    toggleFarDragSection(false);
  }

  // 視覚ガイドの状態を反映
  if (enableGuidesCheckbox) {
    enableGuidesCheckbox.checked = settings.enableGuides !== undefined ? settings.enableGuides : DEFAULT_SETTINGS.enableGuides;
  }
}

// 設定を保存
function saveSettings() {
  const settings = {
    // 通常のドラッグ
    up: upSelect.value,
    down: downSelect.value,
    left: leftSelect.value,
    right: rightSelect.value,
    // 大きくドラッグ
    upFar: upFarSelect.value,
    downFar: downFarSelect.value,
    leftFar: leftFarSelect.value,
    rightFar: rightFarSelect.value,
    // 大きくドラッグ機能のオン/オフ
    farDragEnabled: getFarDragEnabled(),
    // 視覚ガイドのオン/オフ
    enableGuides: enableGuidesCheckbox ? enableGuidesCheckbox.checked : DEFAULT_SETTINGS.enableGuides
  };

  try {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        console.error('設定の保存に失敗:', chrome.runtime.lastError);
        showStatus(chrome.i18n.getMessage('statusSaveFailed'), true);
        return;
      }
      showStatus(chrome.i18n.getMessage('statusSaved'), false);
    });
  } catch (e) {
    console.error('設定の保存中にエラー:', e);
    showStatus('保存に失敗しました', true);
  }
}

// ステータスメッセージを表示
function showStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#dc3545' : '#28a745';
  statusMessage.classList.add('visible');

  setTimeout(() => {
    statusMessage.classList.remove('visible');
  }, 2000);
}

// 大きくドラッグセクションの表示/非表示を切り替え
function toggleFarDragSection(enabled) {
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }

  farDragSections.forEach(section => {
    // select要素を取得
    const selects = section.querySelectorAll('select');

    if (enabled) {
      section.classList.add('visible');
      section.classList.remove('disabled');
      // select要素を有効化
      selects.forEach(select => select.disabled = false);
    } else {
      section.classList.remove('visible');
      section.classList.add('disabled');
      // select要素を無効化
      selects.forEach(select => select.disabled = true);
    }
  });

  // チェックボックスの状態を更新
  if (farDragCheckbox) {
    farDragCheckbox.checked = enabled;
  }
}

// 大きくドラッグセクションの有効/無効を切り替え（グレーアウト）
function setFarDragSectionEnabled(enabled) {
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }

  // セクションが表示されている場合のみ有効/無効を切り替え
  farDragSections.forEach(section => {
    if (section.classList.contains('visible')) {
      if (enabled) {
        section.classList.remove('disabled');
        // select要素を有効化
        const selects = section.querySelectorAll('select');
        selects.forEach(select => select.disabled = false);
      } else {
        section.classList.add('disabled');
        // select要素を無効化
        const selects = section.querySelectorAll('select');
        selects.forEach(select => select.disabled = true);
      }
    }
  });

  // チェックボックスの状態を更新
  if (farDragCheckbox) {
    farDragCheckbox.checked = enabled;
  }
}

// 大きくドラッグ機能のオン/オフ状態を取得
function getFarDragEnabled() {
  if (farDragCheckbox) {
    return farDragCheckbox.checked;
  }
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }
  return farDragSections.length > 0 && farDragSections[0].classList.contains('visible') && !farDragSections[0].classList.contains('disabled');
}

// 「Drag」部分の3回クリック検出（一度だけ有効）
let clickCount = 0;
let clickTimer = null;

if (dragToggle) {
  dragToggle.addEventListener('click', () => {
    // 既に3回クリックが使用済みの場合は何もしない
    if (tripleClickUsed) {
      return;
    }

    clickCount++;

    // タイマーをリセット
    if (clickTimer) {
      clearTimeout(clickTimer);
    }

    // 3回クリックを検出（500ms以内）
    clickTimer = setTimeout(() => {
      if (clickCount === 3) {
        // セクションを表示して有効化
        toggleFarDragSection(true);
        tripleClickUsed = true;

        // カーソルを通常に戻す
        if (dragToggle) {
          dragToggle.style.cursor = 'default';
        }

        // 設定を保存
        chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
          const updatedSettings = { ...settings, farDragEnabled: true };
          chrome.storage.sync.set(updatedSettings, () => {
            if (chrome.runtime.lastError) {
              console.error('設定の保存に失敗:', chrome.runtime.lastError);
            }
          });
        });
      }
      clickCount = 0;
    }, 500);
  });
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
  // ローカライズ
  localizeHtmlPage();

  // 非日本語環境で楽天を非表示にする
  const uiLanguage = chrome.i18n.getUILanguage();
  if (!uiLanguage.startsWith('ja')) {
    const rakutenOptions = document.querySelectorAll('option[value="rakuten"]');
    rakutenOptions.forEach(option => {
      option.style.display = 'none'; // または option.remove()
      // 既に選択されている場合はデフォルト(google)などに変更するロジックが必要だが、
      // 既存ユーザーの設定を勝手に変えるのはリスクがあるため、今回は非表示のみとする
      // 新規インストールなどの場合はリストに出ないため選択されない
      option.remove();
    });
  }

  // 初期状態で大きくドラッグセクションを非表示にする
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }
  toggleFarDragSection(false);

  // チェックボックスのイベントリスナー
  if (farDragCheckbox) {
    farDragCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      setFarDragSectionEnabled(enabled);

      // 設定を保存
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        const updatedSettings = { ...settings, farDragEnabled: enabled };
        chrome.storage.sync.set(updatedSettings, () => {
          if (chrome.runtime.lastError) {
            console.error('設定の保存に失敗:', chrome.runtime.lastError);
          }
        });
      });
    });
  }

  // 設定を読み込む
  loadSettings();

  // 視覚ガイドチェックボックスのイベントリスナー
  if (enableGuidesCheckbox) {
    enableGuidesCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      // 設定を即座に保存
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        const updatedSettings = { ...settings, enableGuides: enabled };
        chrome.storage.sync.set(updatedSettings, () => {
          if (chrome.runtime.lastError) {
            console.error('設定の保存に失敗:', chrome.runtime.lastError);
          }
        });
      });
    });
  }

  // 設定読み込み後に3回クリックの使用状態を確認
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (settings.farDragEnabled) {
      tripleClickUsed = true;
    }
  });
});

if (saveButton) {
  saveButton.addEventListener('click', saveSettings);
}

// リセットボタンの要素
// const resetButton = document.getElementById('resetButton'); // Removed duplicate

// デフォルト設定にリセット
function resetToDefault() {
  try {
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      if (chrome.runtime.lastError) {
        console.error('設定のリセットに失敗:', chrome.runtime.lastError);
        showStatus(chrome.i18n.getMessage('statusResetFailed'), true);
        return;
      }
      // UI にデフォルト設定を適用
      applySettingsToUI(DEFAULT_SETTINGS);
      // 3回クリックの状態もリセット
      tripleClickUsed = false;
      if (dragToggle) {
        dragToggle.style.cursor = 'pointer';
      }
      showStatus(chrome.i18n.getMessage('statusResetSuccess'), false);
    });
  } catch (e) {
    console.error('設定のリセット中にエラー:', e);
    showStatus(chrome.i18n.getMessage('statusResetFailed'), true);
  }
}

if (resetButton) {
  resetButton.addEventListener('click', resetToDefault);
}

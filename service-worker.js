// デフォルト設定（options.js, superdrag.js と同期）
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
  farDragEnabled: false
};

// インストール時の初期化処理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 初回インストール時にデフォルト設定を書き込む
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      if (chrome.runtime.lastError) {
        console.error('[ServiceWorker] ERROR: Failed to initialize settings:', chrome.runtime.lastError);
      } else {
        console.log('[ServiceWorker] INFO: Default settings initialized');
      }
    });
  }
});

// URLテンプレート定義（%s がクエリに置換される）
const URL_TEMPLATES = {
  google: 'https://www.google.com/search?q=%s',
  youtube: 'https://www.youtube.com/results?search_query=%s',
  twitter: 'https://x.com/search?q=%s',
  deepl: 'https://www.deepl.com/translator#en/ja/%s',
  gtranslate: 'https://translate.google.com/?sl=auto&tl=ja&text=%s',
  amazon: 'https://www.amazon.co.jp/s?k=%s', // default to jp, logic will override
  rakuten: 'https://search.rakuten.co.jp/search/mall/%s/',
  reddit: 'https://www.reddit.com/search/?q=%s',
  maps: 'https://www.google.co.jp/maps?q=%s'
};

// AI サービスの設定（自動入力が必要なもの）
const AI_SERVICES = {
  chatgpt: {
    url: 'https://chatgpt.com/',
    selectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'textarea[data-id="root"]',
      'div[contenteditable="true"][id="prompt-textarea"]'
    ]
  },
  claude: {
    url: 'https://claude.ai/new',
    selectors: [
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"][data-placeholder]',
      'fieldset div[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]'
    ]
  },
  gemini: {
    url: 'https://gemini.google.com/app',
    selectors: [
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="prompt"]',
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]'
    ]
  }
};

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || message.type !== 'search') return;

    const { engineId, text } = message;

    if (!engineId || !text) {
      console.error('Invalid message: missing engineId or text');
      return;
    }

    // 'none' の場合は何もしない
    if (engineId === 'none') {
      return;
    }

    // 'copy' の場合はコンテンツスクリプトで処理済みなので何もしない
    if (engineId === 'copy') {
      return;
    }

    // AIサービスの場合（自動入力が必要）
    if (AI_SERVICES[engineId]) {
      handleAIService(engineId, text);
      return;
    }

    // 通常の検索エンジンの場合
    let template = URL_TEMPLATES[engineId];
    if (!template) {
      console.error('Unknown engineId:', engineId);
      return;
    }

    // Amazonのロケール対応
    if (engineId === 'amazon') {
      const uiLanguage = chrome.i18n.getUILanguage();
      if (!uiLanguage.startsWith('ja')) {
        template = 'https://www.amazon.com/s?k=%s';
      }
    }

    // URLを生成（%sをエンコードされたテキストで置換）
    const url = template.replace('%s', encodeURIComponent(text));
    openNewTab(url);

  } catch (e) {
    console.error('Service Worker Error:', e);
  }
});

// AIサービスを処理（タブを開いて自動入力）
function handleAIService(engineId, text) {
  const service = AI_SERVICES[engineId];
  if (!service) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to query tabs:', chrome.runtime.lastError);
      return;
    }

    const currentTab = tabs[0];
    const index = currentTab ? currentTab.index + 1 : undefined;

    chrome.tabs.create({
      url: service.url,
      active: true,
      index: index
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to create tab:', chrome.runtime.lastError);
        return;
      }

      // タブの読み込み完了を待ってスクリプトを注入
      const tabId = tab.id;

      // タブの更新を監視
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);

          // 少し待ってからスクリプトを注入（ページのJSが完全に初期化されるのを待つ）
          setTimeout(() => {
            injectAutofillScript(tabId, text, service.selectors);
          }, 500);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // タイムアウト処理（10秒後にリスナーを削除）
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
      }, 10000);
    });
  });
}

// 自動入力スクリプトを注入
function injectAutofillScript(tabId, text, selectors) {
  try {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (text, selectors) => {
        let attempts = 0;
        const maxAttempts = 50;

        function tryAutofill() {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              element.focus();

              if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              } else if (element.contentEditable === 'true') {
                // contentEditable の場合: textContentのみを使用（XSS対策）
                element.textContent = text;

                // 複数のイベントを発火させて確実に検知させる
                element.dispatchEvent(new InputEvent('input', {
                  bubbles: true,
                  cancelable: true,
                  inputType: 'insertText',
                  data: text
                }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              }

              console.log('Drag search&copy: Text autofilled successfully');
              return true;
            }
          }
          return false;
        }

        function attemptAutofill() {
          if (tryAutofill()) {
            return;
          }

          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(attemptAutofill, 100);
          } else {
            console.log('Drag search&copy: Could not find input element');
          }
        }

        attemptAutofill();
      },
      args: [text, selectors]
    }).catch(err => {
      console.error('Failed to inject script:', err);
    });
  } catch (e) {
    console.error('Script injection error:', e);
  }
}

// 新しいタブを開く
function openNewTab(url) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to query tabs:', chrome.runtime.lastError);
      return;
    }

    const currentTab = tabs[0];
    const index = currentTab ? currentTab.index + 1 : undefined;

    chrome.tabs.create({
      url: url,
      active: true,
      index: index
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to create tab:', chrome.runtime.lastError);
      }
    });
  });
}

// デフォルト設定
const DEFAULT_SETTINGS = {
  // 通常のドラッグ
  up: 'google',
  down: 'twitter',
  left: 'youtube',
  right: 'copy',
  // 大きくドラッグ
  upFar: 'none',
  downFar: 'none',
  leftFar: 'none',
  rightFar: 'none'
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

// 設定を読み込んでUIに反映
function loadSettings() {
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
    rightFar: rightFarSelect.value
  };

  try {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        console.error('設定の保存に失敗:', chrome.runtime.lastError);
        showStatus('保存に失敗しました', true);
        return;
      }
      showStatus('保存しました', false);
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

// イベントリスナー
document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);

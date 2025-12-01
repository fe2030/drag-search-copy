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
  rightFar: 'none',
  // 大きくドラッグ機能のオン/オフ
  farDragEnabled: false
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
let farDragSections = null;
let tripleClickUsed = false; // 3回クリックが既に使用されたかどうか

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
  } else {
    // セクションを非表示
    toggleFarDragSection(false);
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
    farDragEnabled: getFarDragEnabled()
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

// 大きくドラッグセクションの表示/非表示を切り替え
function toggleFarDragSection(enabled) {
  if (!farDragSections) {
    farDragSections = document.querySelectorAll('.far-drag-section');
  }
  
  farDragSections.forEach(section => {
    if (enabled) {
      section.classList.add('visible');
      section.classList.remove('disabled');
    } else {
      section.classList.remove('visible');
      section.classList.add('disabled');
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

(function () {
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

    // 現在の設定（初期値はデフォルト）
    let settings = { ...DEFAULT_SETTINGS };

    // ドラッグ状態管理
    let dragStartPoint = null;
    let currentDirection = null;
    let dragStartTime = null;
    let hasTextSelection = false;
    let isFromInteractiveElement = false;

    // 定数
    const THRESHOLD = 4;
    const FAR_THRESHOLD = 100;
    const MIN_DRAG_DURATION = 150;

    // アクションの表示名マップ（絵文字アイコン付き）
    const ACTION_DISPLAY_NAMES = {
        'none': '',
        'google': '🔍 Google',
        'youtube': '🎬 YouTube',
        'twitter': '𝕏 （旧Twitter）',
        'rakuten': '🛒 楽天',
        'amazon': '📦 Amazon',
        'maps': '🗺️ Maps',
        'deepl': '🌐 DeepL',
        'gtranslate': '🌐 Google翻訳',
        'chatgpt': '🤖 ChatGPT',
        'claude': '🧠 Claude',
        'gemini': '✨ Gemini',
        'copy': '📋 Copy'
    };

    // オーバーレイ要素の参照
    let guideOverlayHost = null;
    let guideOverlayRoot = null;
    let guideManuallyHidden = false; // 手動で閉じたかどうかのフラグ

    // 設定を読み込む
    function loadSettings() {
        try {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                settings = { ...DEFAULT_SETTINGS, ...result };
            });
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    // 設定の変更を監視
    function watchSettingsChanges() {
        try {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'sync') return;
                for (const key of Object.keys(changes)) {
                    if (key in DEFAULT_SETTINGS) {
                        settings[key] = changes[key].newValue;
                    }
                }
            });
        } catch (e) {
            console.error('Error setting up storage listener:', e);
        }
    }

    function isInteractive(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.tagName === 'A' && element.href) return true;
        if (element.tagName === 'BUTTON') return true;
        if (element.getAttribute && element.getAttribute('role') === 'button') return true;
        const interactiveParent = element.closest('a[href], button, [role="button"]');
        if (interactiveParent) return true;
        return false;
    }

    function isInputElement(element) {
        if (!element || element.nodeType !== 1) return false;
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
    }

    function getDirection(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return null;
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'Right' : 'Left';
        } else {
            return dy > 0 ? 'Down' : 'Up';
        }
    }

    function getDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getSettingsKey(direction, isFar) {
        const keyMap = {
            'Up': isFar ? 'upFar' : 'up',
            'Down': isFar ? 'downFar' : 'down',
            'Left': isFar ? 'leftFar' : 'left',
            'Right': isFar ? 'rightFar' : 'right'
        };
        return keyMap[direction] || null;
    }

    function showToast(x, y, text) {
        const toast = document.createElement('div');
        toast.textContent = text;
        toast.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            z-index: 2147483647;
            pointer-events: none;
            font-size: 12px;
            font-family: sans-serif;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
    }

    async function executeCopy(text, x, y) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(x, y, 'COPY');
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position: fixed; opacity: 0;';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast(x, y, 'COPY');
            } catch (fallbackErr) {
                console.error('Copy failed', fallbackErr);
            }
            document.body.removeChild(textarea);
        }
    }

    function executeSearch(engineId, text) {
        if (!chrome.runtime) {
            console.error('chrome.runtime is not available');
            return;
        }
        try {
            chrome.runtime.sendMessage({
                type: 'search',
                engineId: engineId,
                text: text
            }, () => {
                void chrome.runtime.lastError;
            });
        } catch (err) {
            console.error('SendMessage failed:', err);
        }
    }

    function resetState() {
        dragStartPoint = null;
        currentDirection = null;
        dragStartTime = null;
        hasTextSelection = false;
        isFromInteractiveElement = false;
        // ガイドオーバーレイは削除しない（選択が残っている限り表示を維持）
        // removeGuideOverlay();
    }

    function createGuideOverlay(x, y) {
        // ガイドが無効の場合は表示しない
        if (!settings.enableGuides) return;

        if (guideOverlayHost) return;

        guideOverlayHost = document.createElement('div');
        guideOverlayHost.id = 'superdrag-guide-overlay';
        guideOverlayHost.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            overflow: visible !important;
        `;
        document.body.appendChild(guideOverlayHost);

        guideOverlayRoot = guideOverlayHost.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            .guide-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            }
            .guide-label {
                position: absolute;
                background: rgba(20, 20, 23, 0.9);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #ffffff;
                padding: 10px 18px;
                border-radius: 10px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 15px;
                font-weight: 500;
                white-space: nowrap;
                transform: translate(-50%, -50%) scale(0.9);
                pointer-events: none;
                opacity: 0;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
                transition: opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                z-index: 1000;
            }
            .guide-label.visible {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            .guide-label.far {
                background: rgba(66, 133, 244, 0.9);
                border-color: rgba(255, 255, 255, 0.2);
                z-index: 900;
            }
            .guide-close {
                position: absolute;
                width: 24px;
                height: 24px;
                background: rgba(50, 50, 55, 0.9);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                pointer-events: auto !important;
                z-index: 2000;
                font-family: sans-serif;
                font-size: 16px;
                line-height: 1;
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .guide-close:hover {
                background: rgba(80, 80, 85, 1);
                transform: translate(-50%, -50%) scale(1.1);
            }
            .guide-close.visible {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        `;
        guideOverlayRoot.appendChild(style);

        const container = document.createElement('div');
        container.className = 'guide-container';
        guideOverlayRoot.appendChild(container);

        // 閉じるボタンを作成 (中心から少し右上に配置)
        const closeBtn = document.createElement('div');
        closeBtn.className = 'guide-close';
        closeBtn.innerHTML = '&#xd7;'; // × mark
        closeBtn.title = 'Close Guide';
        // 右上に配置 (Googleラベルの右側)
        closeBtn.style.left = (x + 70) + 'px';
        closeBtn.style.top = (y - 80) + 'px';

        // Shadow DOM内なのでイベントは別途追加が必要だが、
        // 親のpointer-events: noneを回避するためにCSSでautoにしている
        // mousedownで閉じる（clickだとpreventDefaultと競合するため）
        closeBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault(); // 選択状態を維持
            guideManuallyHidden = true; // 手動で閉じたことを記録
            removeGuideOverlay();
        });

        container.appendChild(closeBtn);

        requestAnimationFrame(() => {
            closeBtn.classList.add('visible');
        });

        const createLabel = (offsetX, offsetY, settingKey, isFar) => {
            const actionId = settings[settingKey] || DEFAULT_SETTINGS[settingKey];
            if (actionId === 'none') return;

            const displayText = ACTION_DISPLAY_NAMES[actionId] || actionId;
            const label = document.createElement('div');
            label.className = `guide-label ${isFar ? 'far' : ''}`;
            label.textContent = displayText;
            label.style.left = (x + offsetX) + 'px';
            label.style.top = (y + offsetY) + 'px';
            container.appendChild(label);

            requestAnimationFrame(() => {
                label.classList.add('visible');
            });
        };

        const OFFSET = 80;
        createLabel(0, -OFFSET, 'up', false);
        createLabel(0, OFFSET, 'down', false);
        createLabel(-OFFSET, 0, 'left', false);
        createLabel(OFFSET, 0, 'right', false);

        if (settings.farDragEnabled) {
            const FAR_OFFSET = 160;
            createLabel(0, -FAR_OFFSET, 'upFar', true);
            createLabel(0, FAR_OFFSET, 'downFar', true);
            createLabel(-FAR_OFFSET, 0, 'leftFar', true);
            createLabel(FAR_OFFSET, 0, 'rightFar', true);
        }
    }

    function removeGuideOverlay() {
        if (guideOverlayHost) {
            if (guideOverlayHost.parentNode) {
                guideOverlayHost.parentNode.removeChild(guideOverlayHost);
            }
            guideOverlayHost = null;
            guideOverlayRoot = null;
        }
    }

    function handleDragStart(e) {
        const target = e.target;
        if (isInputElement(target)) return;

        const selection = window.getSelection().toString();
        hasTextSelection = !!selection;
        let data = selection;
        if (!data && target.href) {
            data = target.href;
        }
        if (!data) return;

        isFromInteractiveElement = isInteractive(target);
        e.dataTransfer.setData('text/plain', data);
        dragStartPoint = { x: e.clientX, y: e.clientY };
        dragStartTime = Date.now();
        currentDirection = null;
    }

    function handleDragOver(e) {
        if (!dragStartPoint) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const currentPoint = { x: e.clientX, y: e.clientY };
        currentDirection = getDirection(dragStartPoint, currentPoint);
    }

    function handleDragEnd(e) {
        resetState();
    }

    async function handleDrop(e) {
        if (!dragStartPoint) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            resetState();
            return;
        }

        if (!hasTextSelection && isFromInteractiveElement && dragStartTime) {
            const dragDuration = Date.now() - dragStartTime;
            if (dragDuration < MIN_DRAG_DURATION) {
                resetState();
                return;
            }
        }

        e.preventDefault();

        const direction = currentDirection;
        const data = e.dataTransfer.getData('text/plain');
        const dropX = e.clientX;
        const dropY = e.clientY;

        const dropPoint = { x: dropX, y: dropY };
        const distance = getDistance(dragStartPoint, dropPoint);
        let isFar = settings.farDragEnabled && distance >= FAR_THRESHOLD;

        if (isFar) {
            const farSettingsKey = getSettingsKey(direction, true);
            if (farSettingsKey) {
                const farEngineId = settings[farSettingsKey] || DEFAULT_SETTINGS[farSettingsKey];
                if (farEngineId === 'none') {
                    isFar = false;
                }
            }
        }

        resetState();

        if (!data || !direction) return;

        const settingsKey = getSettingsKey(direction, isFar);
        if (!settingsKey) return;

        const engineId = settings[settingsKey] || DEFAULT_SETTINGS[settingsKey];

        if (engineId === 'none') {
            return;
        } else if (engineId === 'copy') {
            await executeCopy(data, dropX, dropY);
        } else {
            executeSearch(engineId, data);
        }
    }

    function handleMouseUp(e) {
        if (dragStartPoint) return;

        // 手動で閉じた場合は再表示しない
        if (guideManuallyHidden) return;

        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                try {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    removeGuideOverlay();
                    createGuideOverlay(centerX, centerY);
                } catch (err) {
                    removeGuideOverlay();
                    createGuideOverlay(e.clientX, e.clientY);
                }
            }
        }, 10);
    }

    function handleMouseDown(e) {
        if (dragStartPoint) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            return;
        }
        removeGuideOverlay();
    }

    function handleSelectionChange(e) {
        if (dragStartPoint) return;
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            removeGuideOverlay();
            guideManuallyHidden = false; // 選択が解除されたらフラグをリセット
        }
    }

    // キーダウンハンドラ (Escキーで閉じる)
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            guideManuallyHidden = true; // 手動で閉じたことを記録
            removeGuideOverlay();
        }
    }

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        loadSettings();
        watchSettingsChanges();

        document.addEventListener('dragstart', handleDragStart);
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('drop', handleDrop);
        document.addEventListener('dragend', handleDragEnd);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('selectionchange', handleSelectionChange);
        document.addEventListener('keydown', handleKeyDown);
    }

    init();
})();

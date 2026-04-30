(function () {
    // デフォルト設定
    const DEFAULT_SETTINGS = {
        up: 'google',
        down: 'twitter',
        left: 'amazon',
        right: 'copy',
        upFar: 'none',
        downFar: 'none',
        leftFar: 'none',
        rightFar: 'none',
        farDragEnabled: false,
        enableGuides: true,
        enablePasteButton: true
    };

    let settings = { ...DEFAULT_SETTINGS };
    let dragStartPoint = null;
    let currentDirection = null;
    let dragStartTime = null;
    let hasTextSelection = false;
    let isFromInteractiveElement = false;
    let mouseDownPoint = null;

    const THRESHOLD = 4;
    const FAR_THRESHOLD = 100;
    const MIN_DRAG_DURATION = 150;

    const ACTION_DISPLAY_NAMES = {
        'none': '',
        'google': 'actionNameGoogle',
        'youtube': 'actionNameYoutube',
        'twitter': 'actionNameTwitter',
        'reddit': 'actionNameReddit',
        'rakuten': 'actionNameRakuten',
        'amazon': 'actionNameAmazon',
        'ebay': 'actionNameEbay',
        'maps': 'actionNameMaps',
        'deepl': 'actionNameDeepL',
        'gtranslate': 'actionNameGoogleTranslate',
        'chatgpt': 'actionNameChatGPT',
        'claude': 'actionNameClaude',
        'gemini': 'actionNameGemini',
        'copy': 'actionNameCopy'
    };

    let guideOverlayHost = null;
    let guideOverlayRoot = null;
    let guideManuallyHidden = false;

    function loadSettings() {
        try {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                settings = { ...DEFAULT_SETTINGS, ...result };
            });
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

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
        return !!interactiveParent;
    }

    function isInputElement(element) {
        if (!element || element.nodeType !== 1) return false;
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
    }

    // input/textarea から選択テキストを安全に取得
    // selectionStart 非対応の input type（number 等）では例外をキャッチして空文字を返す
    function getInputSelectedText(element) {
        try {
            const start = element.selectionStart;
            const end = element.selectionEnd;
            if (start === null || end === null || start === end) return '';
            return element.value.substring(start, end);
        } catch (e) {
            return '';
        }
    }

    // ミラー要素テクニックで input/textarea 内の選択テキストのビューポート座標を取得
    // 不可視の div を作成し、対象要素と同じスタイル・位置で配置して選択部分の座標を計測する
    function getInputSelectionCoords(element) {
        try {
            const start = element.selectionStart;
            const end = element.selectionEnd;
            if (start === null || end === null || start === end) return null;

            const isInput = element.tagName === 'INPUT';
            const computed = window.getComputedStyle(element);
            const elemRect = element.getBoundingClientRect();

            // ミラー要素を作成
            const mirror = document.createElement('div');

            // テキストレイアウトに影響するスタイルをコピー
            const properties = [
                'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
                'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent',
                'lineHeight',
                'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
                'direction', 'textAlign'
            ];

            for (var i = 0; i < properties.length; i++) {
                mirror.style[properties[i]] = computed[properties[i]];
            }

            // 対象要素と同じ位置・サイズで fixed 配置（スクロールの影響を受けない）
            // elemRect.width/height は常に border-box 幅なので、boxSizing を border-box に固定することで
            // computed.width の box-sizing 依存によるズレを防ぐ
            mirror.style.position = 'fixed';
            mirror.style.top = elemRect.top + 'px';
            mirror.style.left = elemRect.left + 'px';
            mirror.style.boxSizing = 'border-box';
            mirror.style.width = elemRect.width + 'px';
            mirror.style.height = elemRect.height + 'px';
            mirror.style.overflow = 'hidden';
            mirror.style.visibility = 'hidden';
            mirror.style.pointerEvents = 'none';
            mirror.style.zIndex = '-9999';

            // input は単一行（折り返しなし）、textarea は複数行（折り返しあり）
            if (isInput) {
                mirror.style.whiteSpace = 'pre';
            } else {
                mirror.style.whiteSpace = 'pre-wrap';
                mirror.style.wordWrap = 'break-word';
            }

            // テキスト内容を構築: [選択前テキスト][選択テキスト(span)]
            // afterText は座標計算に不要なので省略（パフォーマンス向上）
            var value = element.value;
            var beforeNode = document.createTextNode(value.substring(0, start));
            var selectedSpan = document.createElement('span');
            selectedSpan.textContent = value.substring(start, end);

            mirror.appendChild(beforeNode);
            mirror.appendChild(selectedSpan);

            document.body.appendChild(mirror);

            // 対象要素内部のスクロール位置を同期
            if (isInput) {
                mirror.scrollLeft = element.scrollLeft;
            } else {
                mirror.scrollTop = element.scrollTop;
                mirror.scrollLeft = element.scrollLeft;
            }

            // 選択テキスト span の座標を取得
            var spanRect = selectedSpan.getBoundingClientRect();

            // DOM から削除する前に値をコピー（削除後は rect が無効になる可能性がある）
            var result = {
                left: spanRect.left,
                top: spanRect.top,
                right: spanRect.right,
                bottom: spanRect.bottom,
                width: spanRect.width,
                height: spanRect.height
            };

            // ミラー要素をクリーンアップ
            document.body.removeChild(mirror);

            // 座標が有効かチェック（画面外やゼロサイズの場合は null）
            if (result.width <= 0 || result.height <= 0) return null;

            return result;
        } catch (e) {
            return null;
        }
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
        }, 350);
    }

    async function executeCopy(text, x, y) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(x, y, chrome.i18n.getMessage('toastCopied'));
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position: fixed; opacity: 0;';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast(x, y, chrome.i18n.getMessage('toastCopied'));
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
    }

    function createGuideOverlay(x, y, text) {

        if (!settings.enableGuides) return;
        if (guideOverlayHost) return;
        if (!isExtensionValid()) return;

        guideOverlayHost = document.createElement('div');
        guideOverlayHost.id = 'superdrag-guide-overlay';
        guideOverlayHost.style.cssText = `
            position: absolute !important;
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
                position: absolute;
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
                pointer-events: auto;
                cursor: pointer;
                opacity: 0;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
                transition: opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                z-index: 1000;
                user-select: none;
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

        const closeBtn = document.createElement('div');
        closeBtn.className = 'guide-close';
        closeBtn.innerHTML = '&#xd7;';
        closeBtn.title = safeGetMessage('guideCloseTitle', 'Close');
        closeBtn.style.left = (x + 70) + 'px';
        closeBtn.style.top = (y - 80) + 'px';

        closeBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            guideManuallyHidden = true;
            removeGuideOverlay();
        });

        container.appendChild(closeBtn);

        requestAnimationFrame(() => {
            closeBtn.classList.add('visible');
        });

        const createLabel = (offsetX, offsetY, settingKey, isFar) => {
            const actionId = settings[settingKey] || DEFAULT_SETTINGS[settingKey];
            if (actionId === 'none') return;

            const i18nKey = ACTION_DISPLAY_NAMES[actionId];
            const displayText = i18nKey ? safeGetMessage(i18nKey, actionId) : actionId;
            const label = document.createElement('div');
            label.className = `guide-label ${isFar ? 'far' : ''}`;
            label.textContent = displayText;
            label.style.left = (x + offsetX) + 'px';
            label.style.top = (y + offsetY) + 'px';

            // アイコンクリックでアクション実行
            label.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();

                // アクション実行
                if (actionId === 'copy') {
                    // executeCopy はビューポート座標 (clientX, clientY) を期待しているため、
                    // ページ座標 (pageX, pageY) からスクロール分を引いて渡す
                    executeCopy(text, x - window.scrollX, y - window.scrollY);
                } else {
                    executeSearch(actionId, text);
                }

                // ガイドを閉じる
                guideManuallyHidden = true;
                removeGuideOverlay();
            });

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

        // input/textarea の場合: selectionStart/selectionEnd で選択テキストを取得
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const inputSelection = getInputSelectedText(target);
            if (!inputSelection) return;

            hasTextSelection = true;
            isFromInteractiveElement = false;
            e.dataTransfer.setData('text/plain', inputSelection);
            dragStartPoint = { x: e.clientX, y: e.clientY };
            dragStartTime = Date.now();
            currentDirection = null;

            // ドラッグ開始時にガイドとペーストボタンを非表示
            removeGuideOverlay();
            removePasteButton();
            return;
        }

        // contentEditable はスキップ（リッチテキストエディタとの競合防止）
        if (target.isContentEditable) return;

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
        if (guideManuallyHidden) return;

        // クリック（ほぼ移動なし）かドラッグ選択かを判定
        const isClick = mouseDownPoint &&
            Math.abs(e.clientX - mouseDownPoint.x) < THRESHOLD &&
            Math.abs(e.clientY - mouseDownPoint.y) < THRESHOLD;
        mouseDownPoint = null;

        // クリックの場合、既存のガイドを移動させない（新規選択ではない）
        if (isClick) return;

        setTimeout(() => {
            const target = e.target;

            // ===== Case 1: input/textarea 内の選択 =====
            // window.getSelection() では取得できないため、独自に処理する
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                const text = getInputSelectedText(target);
                if (text && text.trim().length > 0) {
                    // ペーストボタンと視覚ガイドの重複を防止
                    removePasteButton();
                    removeGuideOverlay();

                    const elemRect = target.getBoundingClientRect();
                    const isTextarea = target.tagName === 'TEXTAREA';
                    const mirrorRect = getInputSelectionCoords(target);

                    let centerX, centerY;
                    if (mirrorRect) {
                        // 水平: ミラーの選択テキスト中央
                        centerX = mirrorRect.left + mirrorRect.width / 2 + window.scrollX;
                        // 垂直: input は要素の垂直中央を使用（単一行で安定）、textarea はミラーの垂直中央
                        centerY = isTextarea
                            ? (mirrorRect.top + mirrorRect.height / 2 + window.scrollY)
                            : (elemRect.top + elemRect.height / 2 + window.scrollY);
                    } else {
                        // フォールバック: 要素の中央
                        centerX = elemRect.left + elemRect.width / 2 + window.scrollX;
                        centerY = elemRect.top + elemRect.height / 2 + window.scrollY;
                    }
                    createGuideOverlay(centerX, centerY, text);
                }
                return;
            }

            // ===== Case 2: 通常テキスト / contentEditable =====
            const selection = window.getSelection();
            const text = selection ? selection.toString() : '';
            if (text.trim().length > 0) {
                try {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();

                    // ゼロ矩形チェック（Shadow DOM 等で位置が取得できない場合）
                    if (rect.width === 0 && rect.height === 0) {
                        removeGuideOverlay();
                        createGuideOverlay(e.clientX + window.scrollX, e.clientY + window.scrollY, text);
                        return;
                    }

                    // ページ座標を使用（スクロール位置を加算）
                    const centerX = rect.left + rect.width / 2 + window.scrollX;
                    const centerY = rect.top + rect.height / 2 + window.scrollY;
                    removeGuideOverlay();
                    createGuideOverlay(centerX, centerY, text);
                } catch (err) {
                    removeGuideOverlay();
                    createGuideOverlay(e.clientX + window.scrollX, e.clientY + window.scrollY, text);
                }
            }
        }, 10);
    }

    function handleMouseDown(e) {
        if (dragStartPoint) return;
        mouseDownPoint = { x: e.clientX, y: e.clientY };

        // ガイドが表示中ならクリックで閉じる
        // （ガイドのボタンは stopPropagation するのでここには到達しない）
        if (guideOverlayHost) {
            removeGuideOverlay();
            return;
        }
    }

    function handleSelectionChange(e) {
        if (dragStartPoint) return;

        // input/textarea 内でテキストが選択されている間はガイドを維持する
        // （window.getSelection() は input/textarea 内の選択を反映しないため、
        //  チェックしないとガイドが即座に削除されてしまう）
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            const inputText = getInputSelectedText(activeEl);
            if (inputText && inputText.length > 0) {
                return;
            }
        }

        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            removeGuideOverlay();
            guideManuallyHidden = false;
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape' && guideOverlayHost) {
            guideManuallyHidden = true;
            removeGuideOverlay();
        }
    }

    // ===== ペーストボタン機能 =====

    // Extension context が有効かどうかをチェック
    function isExtensionValid() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    // 安全に i18n メッセージを取得
    function safeGetMessage(key, fallback) {
        if (!isExtensionValid()) return fallback;
        try {
            return chrome.i18n.getMessage(key) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    let pasteButtonHost = null;
    let pasteButtonRoot = null;
    let currentFocusedElement = null;
    let focusTimeout = null;
    let blurTimeout = null;

    function isPasteTargetElement(element) {
        if (!element || element.nodeType !== 1) return false;

        // input要素のチェック
        if (element.tagName === 'INPUT') {
            const type = element.type.toLowerCase();
            const allowedTypes = ['text', 'search', 'url', 'email', 'tel', 'password', 'number'];
            return allowedTypes.includes(type);
        }

        // textarea要素
        if (element.tagName === 'TEXTAREA') return true;

        // contentEditable要素
        if (element.contentEditable === 'true') return true;

        return false;
    }

    function createPasteButton(targetElement) {
        if (!settings.enablePasteButton) return;
        if (pasteButtonHost) return;
        if (guideOverlayHost) return; // 視覚ガイドが表示されている場合は非表示

        const rect = targetElement.getBoundingClientRect();

        // ボタン位置: テキストボックスの左下（5px下にオフセット）
        const buttonX = rect.left + window.scrollX;
        const buttonY = rect.bottom + window.scrollY + 5;

        pasteButtonHost = document.createElement('div');
        pasteButtonHost.id = 'superdrag-paste-button';
        pasteButtonHost.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            overflow: visible !important;
        `;
        document.body.appendChild(pasteButtonHost);

        pasteButtonRoot = pasteButtonHost.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            .paste-button {
                position: absolute;
                background: linear-gradient(135deg, #4a90d9, #357abd);
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 500;
                white-space: nowrap;
                cursor: pointer;
                pointer-events: auto;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
                opacity: 0;
                transform: scale(0.9);
                transition: opacity 0.15s ease-out, transform 0.15s ease-out, background 0.15s ease, box-shadow 0.15s ease;
                user-select: none;
            }
            .paste-button.visible {
                opacity: 1;
                transform: scale(1);
            }
            .paste-button:hover {
                background: linear-gradient(135deg, #357abd, #2d6cb5);
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3);
                transform: scale(1.02);
            }
            .paste-button:active {
                transform: scale(0.98);
            }
        `;
        pasteButtonRoot.appendChild(style);

        const button = document.createElement('div');
        button.className = 'paste-button';
        button.textContent = safeGetMessage('pasteButtonLabel', '📋 Paste');
        button.style.left = buttonX + 'px';
        button.style.top = buttonY + 'px';

        button.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await handlePaste(targetElement);
            removePasteButton();
        });

        pasteButtonRoot.appendChild(button);

        requestAnimationFrame(() => {
            button.classList.add('visible');
        });
    }

    function removePasteButton() {
        if (pasteButtonHost) {
            if (pasteButtonHost.parentNode) {
                pasteButtonHost.parentNode.removeChild(pasteButtonHost);
            }
            pasteButtonHost = null;
            pasteButtonRoot = null;
        }
    }

    async function handlePaste(targetElement) {
        try {
            const text = await navigator.clipboard.readText();

            if (!text || text.length === 0) {
                // クリップボードが空
                const rect = targetElement.getBoundingClientRect();
                showToast(rect.left, rect.bottom + 10, safeGetMessage('toastClipboardEmpty', 'Clipboard is empty'));
                return;
            }

            // 貼り付け処理
            if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                const start = targetElement.selectionStart || 0;
                const end = targetElement.selectionEnd || 0;
                const before = targetElement.value.substring(0, start);
                const after = targetElement.value.substring(end);
                targetElement.value = before + text + after;
                targetElement.selectionStart = targetElement.selectionEnd = start + text.length;

                // イベント発火
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (targetElement.contentEditable === 'true') {
                // contentEditable の場合
                targetElement.focus();
                document.execCommand('insertText', false, text);
            }

            // 成功時はトーストなし（静かに成功）

        } catch (err) {
            // 貼り付け失敗
            const rect = targetElement.getBoundingClientRect();
            showToast(rect.left, rect.bottom + 10, safeGetMessage('toastPasteFailed', 'Paste failed'));
        }
    }

    function handleFocusIn(e) {
        const target = e.target;

        if (!isPasteTargetElement(target)) return;
        if (!settings.enablePasteButton) return;

        // 既存のタイマーをクリア
        if (blurTimeout) {
            clearTimeout(blurTimeout);
            blurTimeout = null;
        }

        currentFocusedElement = target;

        // 100ms 遅延後にボタンを表示
        focusTimeout = setTimeout(() => {
            if (currentFocusedElement === target && !guideOverlayHost) {
                createPasteButton(target);
            }
        }, 100);
    }

    function handleFocusOut(e) {
        const target = e.target;

        if (!isPasteTargetElement(target)) return;

        // タイマーをクリア
        if (focusTimeout) {
            clearTimeout(focusTimeout);
            focusTimeout = null;
        }

        // 100ms 遅延後にボタンを非表示（ボタンクリック時のため）
        blurTimeout = setTimeout(() => {
            if (currentFocusedElement === target) {
                removePasteButton();
                currentFocusedElement = null;
            }
        }, 100);
    }

    // ===== ペーストボタン機能 ここまで =====

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

        // ペーストボタン用イベント
        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
    }

    init();
})();

(function () {
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

    // 現在の設定（初期値はデフォルト）
    let settings = { ...DEFAULT_SETTINGS };

    // ドラッグ状態管理
    let dragStartPoint = null;
    let currentDirection = null;
    let dragStartTime = null;
    let hasTextSelection = false;
    let isFromInteractiveElement = false;

    // 定数
    const THRESHOLD = 4;           // 方向判定の最小閾値（px）
    const FAR_THRESHOLD = 80;      // 「大きく動かす」の閾値（px）
    const MIN_DRAG_DURATION = 150; // テキスト選択なしでリンク/ボタンからドラッグする場合の最小時間(ms)

    // 設定を読み込む
    function loadSettings() {
        try {
            chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to load settings:', chrome.runtime.lastError);
                    return;
                }
                settings = { ...DEFAULT_SETTINGS, ...result };
            });
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    // 設定変更を監視
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

    // リンクやボタンなどのインタラクティブ要素かどうかを判定
    function isInteractive(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.tagName === 'A' && element.href) return true;
        if (element.tagName === 'BUTTON') return true;
        if (element.getAttribute && element.getAttribute('role') === 'button') return true;
        const interactiveParent = element.closest('a[href], button, [role="button"]');
        if (interactiveParent) return true;
        return false;
    }

    // 入力要素かどうかを判定
    function isInputElement(element) {
        if (!element || element.nodeType !== 1) return false;
        return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
    }

    // ドラッグ方向を判定（方向のみ）
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

    // 2点間の距離を計算
    function getDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 方向と距離から設定キーを取得
    function getSettingsKey(direction, isFar) {
        const keyMap = {
            'Up': isFar ? 'upFar' : 'up',
            'Down': isFar ? 'downFar' : 'down',
            'Left': isFar ? 'leftFar' : 'left',
            'Right': isFar ? 'rightFar' : 'right'
        };
        return keyMap[direction] || null;
    }

    // ポップアップを表示
    function showToast(x, y, text) {
        const toast = document.createElement('div');
        toast.textContent = text;
        toast.style.position = 'fixed';
        toast.style.left = x + 'px';
        toast.style.top = y + 'px';
        toast.style.background = 'rgba(0, 0, 0, 0.7)';
        toast.style.color = 'white';
        toast.style.padding = '4px 8px';
        toast.style.borderRadius = '4px';
        toast.style.zIndex = '2147483647';
        toast.style.pointerEvents = 'none';
        toast.style.fontSize = '12px';
        toast.style.fontFamily = 'sans-serif';
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
    }

    // コピー処理を実行（navigator.clipboard.writeText優先、フォールバック付き）
    async function executeCopy(text, x, y) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(x, y, 'COPY');
        } catch (err) {
            // フォールバック: execCommand('copy')
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
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

    // 検索処理を実行
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
                // lastErrorを読み取って警告を抑制（service workerがsendResponseを呼ばないため）
                void chrome.runtime.lastError;
            });
        } catch (err) {
            console.error('SendMessage failed:', err);
        }
    }

    // 状態をリセット
    function resetState() {
        dragStartPoint = null;
        currentDirection = null;
        dragStartTime = null;
        hasTextSelection = false;
        isFromInteractiveElement = false;
    }

    // ドラッグ開始ハンドラ（イベント委譲）
    function handleDragStart(e) {
        const target = e.target;

        // INPUT, TEXTAREA, contentEditableを除外
        if (isInputElement(target)) return;

        const selection = window.getSelection().toString();
        hasTextSelection = !!selection;
        let data = selection;
        if (!data && target.href) {
            data = target.href;
        }

        if (!data) return;

        // インタラクティブ要素からのドラッグかどうかを記録
        isFromInteractiveElement = isInteractive(target);

        e.dataTransfer.setData('text/plain', data);
        dragStartPoint = { x: e.clientX, y: e.clientY };
        dragStartTime = Date.now();
        currentDirection = null;
    }

    // ドラッグオーバーハンドラ（イベント委譲）
    function handleDragOver(e) {
        if (!dragStartPoint) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const currentPoint = { x: e.clientX, y: e.clientY };
        currentDirection = getDirection(dragStartPoint, currentPoint);
    }

    // ドラッグ終了ハンドラ（イベント委譲）
    function handleDragEnd(e) {
        resetState();
    }

    // ドロップハンドラ（イベント委譲）
    async function handleDrop(e) {
        if (!dragStartPoint) return;

        // ファイルドロップをチェック
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            resetState();
            return;
        }

        // テキスト選択がなく、リンク/ボタンからのドラッグの場合、時間をチェック
        // 短すぎるドラッグは誤クリックとみなして無視
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

        // ドロップ時点での距離を計算
        const dropPoint = { x: dropX, y: dropY };
        const distance = getDistance(dragStartPoint, dropPoint);
        const isFar = distance >= FAR_THRESHOLD;

        // 状態をリセット
        resetState();

        if (!data || !direction) return;

        // 設定から機能IDを取得（距離に基づいて通常/Far版を選択）
        const settingsKey = getSettingsKey(direction, isFar);
        if (!settingsKey) return;

        const engineId = settings[settingsKey] || DEFAULT_SETTINGS[settingsKey];

        // 機能を実行
        if (engineId === 'none') {
            // 何もしない
            return;
        } else if (engineId === 'copy') {
            await executeCopy(data, dropX, dropY);
        } else {
            executeSearch(engineId, data);
        }
    }

    // 初期化
    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        // 設定を読み込む
        loadSettings();

        // 設定変更を監視
        watchSettingsChanges();

        // イベント委譲: documentにのみイベントリスナーを登録
        // これにより全要素への個別登録とMutationObserverが不要になる
        document.addEventListener('dragstart', handleDragStart);
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('drop', handleDrop);
        document.addEventListener('dragend', handleDragEnd);
    }

    init();
})();

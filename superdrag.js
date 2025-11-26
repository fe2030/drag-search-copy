(function () {
    let dragStartPoint = null;
    let currentDirection = null;
    let dragStartTime = null;
    let hasTextSelection = false;
    let isFromInteractiveElement = false;
    const THRESHOLD = 4;
    const MIN_DRAG_DURATION = 150; // テキスト選択なしでリンク/ボタンからドラッグする場合の最小時間(ms)

    // リンクやボタンなどのインタラクティブ要素かどうかを判定
    function isInteractive(element) {
        if (!element || element.nodeType !== 1) return false;
        // リンク（hrefを持つaタグ）
        if (element.tagName === 'A' && element.href) return true;
        // ボタン
        if (element.tagName === 'BUTTON') return true;
        // role="button"を持つ要素
        if (element.getAttribute && element.getAttribute('role') === 'button') return true;
        // 親要素がインタラクティブ要素の場合もチェック
        const interactiveParent = element.closest('a[href], button, [role="button"]');
        if (interactiveParent) return true;
        return false;
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

    function handleDragStart(e) {
        // Exclude check again just in case
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        const selection = window.getSelection().toString();
        hasTextSelection = !!selection;
        let data = selection;
        if (!data && e.target.href) {
            data = e.target.href;
        }

        if (!data) return;

        // インタラクティブ要素からのドラッグかどうかを記録
        isFromInteractiveElement = isInteractive(e.target);

        e.dataTransfer.setData('text/plain', data);
        dragStartPoint = { x: e.clientX, y: e.clientY };
        dragStartTime = Date.now();
        currentDirection = null;
    }

    function handleDragOver(e) {
        if (!dragStartPoint) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const currentPoint = { x: e.clientX, y: e.clientY };
        currentDirection = getDirection(dragStartPoint, currentPoint);
    }

    function handleDragEnd(e) {
        dragStartPoint = null;
        currentDirection = null;
        dragStartTime = null;
        hasTextSelection = false;
        isFromInteractiveElement = false;
    }

    async function handleDrop(e) {
        if (!dragStartPoint) return;

        // File drop check
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            dragStartPoint = null;
            currentDirection = null;
            dragStartTime = null;
            hasTextSelection = false;
            isFromInteractiveElement = false;
            return;
        }

        // テキスト選択がなく、リンク/ボタンからのドラッグの場合、時間をチェック
        // 短すぎるドラッグは誤クリックとみなして無視
        if (!hasTextSelection && isFromInteractiveElement && dragStartTime) {
            const dragDuration = Date.now() - dragStartTime;
            if (dragDuration < MIN_DRAG_DURATION) {
                // 誤クリック防止: 時間が短すぎるので無視
                dragStartPoint = null;
                currentDirection = null;
                dragStartTime = null;
                hasTextSelection = false;
                isFromInteractiveElement = false;
                return;
            }
        }

        e.preventDefault();
        e.stopPropagation();

        const direction = currentDirection;
        const data = e.dataTransfer.getData('text/plain');

        // Cleanup
        dragStartPoint = null;
        currentDirection = null;
        dragStartTime = null;
        hasTextSelection = false;
        isFromInteractiveElement = false;

        if (!data || !direction) return;

        if (direction === 'Right') {
            // Copy
            try {
                await navigator.clipboard.writeText(data);
                showToast(e.clientX, e.clientY, 'COPY');
            } catch (err) {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = data;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    showToast(e.clientX, e.clientY, 'COPY');
                } catch (fallbackErr) {
                    console.error('Copy failed', fallbackErr);
                }
                document.body.removeChild(textarea);
            }
        } else {
            // Search
            if (chrome.runtime) {
                try {
                    chrome.runtime.sendMessage({
                        c: encodeURIComponent(data),
                        direction: direction
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError);
                        }
                    });
                } catch (err) {
                    console.error('SendMessage failed', err);
                }
            }
        }
    }

    function applyHandlers(node) {
        if (node.nodeType !== 1) return; // Element node only
        // Exclude INPUT, TEXTAREA, contentEditable
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable) return;

        // Using named functions prevents duplication
        node.addEventListener('dragstart', handleDragStart);
        node.addEventListener('dragover', handleDragOver);
        node.addEventListener('drop', handleDrop);
        node.addEventListener('dragend', handleDragEnd);
    }

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        // Initial apply
        document.querySelectorAll('*').forEach(applyHandlers);

        // Observer
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        applyHandlers(node);
                        node.querySelectorAll('*').forEach(applyHandlers);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    init();
})();

(function () {
    let dragStartPoint = null;
    let currentDirection = null;
    const THRESHOLD = 4;

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
        toast.style.backgroundColor = 'black';
        toast.style.color = 'white';
        toast.style.padding = '5px 10px';
        toast.style.borderRadius = '4px';
        toast.style.zIndex = '2147483647';
        toast.style.pointerEvents = 'none';
        toast.style.fontSize = '12px';
        toast.style.fontFamily = 'sans-serif';
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 100);
    }

    function handleDragStart(e) {
        // Exclude check again just in case
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        const selection = window.getSelection().toString();
        let data = selection;
        if (!data && e.target.href) {
            data = e.target.href;
        }

        if (!data) return;

        e.dataTransfer.setData('text/plain', data);
        dragStartPoint = { x: e.clientX, y: e.clientY };
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
    }

    async function handleDrop(e) {
        if (!dragStartPoint) return;

        // File drop check
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            dragStartPoint = null;
            currentDirection = null;
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const direction = currentDirection;
        const data = e.dataTransfer.getData('text/plain');

        // Cleanup
        dragStartPoint = null;
        currentDirection = null;

        if (!data || !direction) return;

        if (direction === 'Right') {
            // Copy
            try {
                await navigator.clipboard.writeText(data);
                showToast(e.clientX, e.clientY, 'コピー');
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
                    showToast(e.clientX, e.clientY, 'コピー');
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
                        direction: direction,
                        foregroundOverride: e.shiftKey
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

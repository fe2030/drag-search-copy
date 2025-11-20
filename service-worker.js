chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || !message.c || !message.direction) return;

    const query = decodeURIComponent(message.c);
    let url = '';

    switch (message.direction) {
      case 'Up':
        url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        break;
      case 'Down':
        url = `https://x.com/search?q=${encodeURIComponent(query)}`;
        break;
      case 'Left':
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        break;
      default:
        return;
    }

    if (url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
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
            console.error(chrome.runtime.lastError);
          }
        });
      });
    }
  } catch (e) {
    console.error('Service Worker Error:', e);
  }
});

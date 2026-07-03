(() => {
  // src/shared/constants.js
  var MessageActions = {
    SHOW_REPLACER_PANEL: "SHOW_REPLACER_PANEL",
    HIDE_REPLACER_PANEL: "HIDE_REPLACER_PANEL",
    EXECUTE_REPLACE: "EXECUTE_REPLACE"
  };

  // src/background/index.js
  chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-replacer") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: MessageActions.SHOW_REPLACER_PANEL }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("Content script not ready, injecting...");
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ["dist/content.js"]
              }, () => {
                chrome.tabs.sendMessage(tabs[0].id, { action: MessageActions.SHOW_REPLACER_PANEL });
              });
            }
          });
        }
      });
    }
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("\u6587\u672C\u66FF\u6362\u52A9\u624B\u5DF2\u5B89\u88C5");
    } else if (details.reason === "update") {
      console.log("\u6587\u672C\u66FF\u6362\u52A9\u624B\u5DF2\u66F4\u65B0");
    }
  });
})();

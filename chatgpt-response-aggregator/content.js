// ChatGPTページ上で動作するcontent script

(() => {
  // DOM要素を取得するためのセレクタ（フォールバック付き）
  const SELECTORS = {
    textArea: [
      "#prompt-textarea",
      'textarea[placeholder]',
      'div[contenteditable="true"][id="prompt-textarea"]',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[type="submit"]',
    ],
    stopButton: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
    ],
    assistantMessage: [
      '[data-message-author-role="assistant"]',
      ".agent-turn",
      '.message[data-role="assistant"]',
    ],
  };

  function querySelector(selectorList) {
    for (const sel of selectorList) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function querySelectorAll(selectorList) {
    for (const sel of selectorList) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return els;
    }
    return [];
  }

  // テキスト入力
  async function typeText(text) {
    const textArea = querySelector(SELECTORS.textArea);
    if (!textArea) {
      throw new Error("チャット入力欄が見つかりません。ChatGPTのページを開いてください。");
    }

    // contenteditable divの場合
    if (textArea.tagName !== "TEXTAREA") {
      textArea.focus();
      textArea.innerHTML = "";
      // ProseMirrorやReact向けにinput eventを発火
      const p = document.createElement("p");
      p.textContent = text;
      textArea.appendChild(p);
      textArea.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // textareaの場合
      textArea.focus();
      // Reactのstate更新のためnativeInputValueSetterを使用
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      nativeSetter.call(textArea, text);
      textArea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 入力が反映されるまで少し待つ
    await sleep(300);
  }

  // 送信ボタンをクリック
  async function clickSend() {
    // 入力後にボタンが有効になるまで待つ
    await sleep(500);

    const sendBtn = querySelector(SELECTORS.sendButton);
    if (!sendBtn) {
      throw new Error("送信ボタンが見つかりません。");
    }
    sendBtn.click();
    await sleep(500);
  }

  // 生成完了を待機（停止ボタンが消えるまで）
  async function waitForCompletion(timeoutMs = 120000) {
    const startTime = Date.now();

    // まず停止ボタンが表示されるのを待つ（生成開始の確認）
    await sleep(2000);

    // 停止ボタンが消えるまで待つ（生成完了）
    while (Date.now() - startTime < timeoutMs) {
      const stopBtn = querySelector(SELECTORS.stopButton);
      if (!stopBtn) {
        // 生成完了後にDOMが安定するまで少し待つ
        await sleep(1500);
        return;
      }
      await sleep(1000);
    }

    throw new Error("回答生成がタイムアウトしました（120秒）。");
  }

  // 最新のアシスタント回答を取得
  function getLatestAnswer() {
    const messages = querySelectorAll(SELECTORS.assistantMessage);
    if (messages.length === 0) {
      throw new Error("ChatGPTの回答が見つかりません。");
    }

    const lastMessage = messages[messages.length - 1];
    // マークダウンレンダリング部分のテキストを取得
    const markdown =
      lastMessage.querySelector(".markdown") ||
      lastMessage.querySelector('[class*="markdown"]') ||
      lastMessage;

    return (markdown.textContent || "").trim();
  }

  // 現在のアシスタントメッセージ数を取得
  function getMessageCount() {
    return querySelectorAll(SELECTORS.assistantMessage).length;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "startAggregation") {
      handleAggregation(request.settings)
        .then((answers) => sendResponse({ success: true, answers }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // 非同期レスポンスを有効にする
    }
  });

  async function handleAggregation(settings) {
    const { rulePrompt, question, repeatCount } = settings;
    const answers = [];

    // ステップ1: ルールプロンプトを送信（設定されている場合）
    if (rulePrompt) {
      await typeText(rulePrompt);
      await clickSend();
      await waitForCompletion();
    }

    // ステップ2: 質問を繰り返し送信し、回答を取得
    for (let i = 0; i < repeatCount; i++) {
      const beforeCount = getMessageCount();

      await typeText(question);
      await clickSend();
      await waitForCompletion();

      // 新しい回答が追加されたことを確認
      const afterCount = getMessageCount();
      if (afterCount <= beforeCount) {
        throw new Error(`回答${i + 1}の生成に失敗しました。`);
      }

      const answer = getLatestAnswer();
      answers.push(answer);

      // 次の質問の前に少し待つ
      if (i < repeatCount - 1) {
        await sleep(1000);
      }
    }

    return answers;
  }
})();

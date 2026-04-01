document.addEventListener("DOMContentLoaded", () => {
  const rulePrompt = document.getElementById("rulePrompt");
  const question = document.getElementById("question");
  const repeatCount = document.getElementById("repeatCount");
  const formUrl = document.getElementById("formUrl");
  const entryQuestion = document.getElementById("entryQuestion");
  const entryContainer = document.getElementById("entryContainer");
  const generateBtn = document.getElementById("generateEntries");
  const saveBtn = document.getElementById("saveBtn");
  const runBtn = document.getElementById("runBtn");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");

  // 保存した設定を読み込む
  chrome.storage.local.get("settings", (data) => {
    if (data.settings) {
      const s = data.settings;
      rulePrompt.value = s.rulePrompt || "";
      question.value = s.question || "";
      repeatCount.value = s.repeatCount || 3;
      formUrl.value = s.formUrl || "";
      entryQuestion.value = s.entryQuestion || "";
      if (s.entryAnswers && s.entryAnswers.length > 0) {
        buildEntryFields(s.entryAnswers.length, s.entryAnswers);
      }
    }
  });

  // エントリID欄を生成
  generateBtn.addEventListener("click", () => {
    const count = parseInt(repeatCount.value, 10);
    if (count < 1 || count > 50) {
      setStatus("繰り返し回数は1〜50の範囲で指定してください。", "error");
      return;
    }
    buildEntryFields(count, []);
  });

  function buildEntryFields(count, values) {
    entryContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "entry-row";
      row.innerHTML = `
        <span class="entry-label">回答${i + 1}:</span>
        <input type="text" class="entry-answer" placeholder="entry.987654321"
               value="${values[i] || ""}">
      `;
      entryContainer.appendChild(row);
    }
  }

  // 設定を保存
  saveBtn.addEventListener("click", () => {
    const settings = gatherSettings();
    chrome.storage.local.set({ settings }, () => {
      setStatus("設定を保存しました。", "info");
    });
  });

  function gatherSettings() {
    const entryAnswers = Array.from(
      document.querySelectorAll(".entry-answer")
    ).map((el) => el.value.trim());

    return {
      rulePrompt: rulePrompt.value.trim(),
      question: question.value.trim(),
      repeatCount: parseInt(repeatCount.value, 10),
      formUrl: formUrl.value.trim(),
      entryQuestion: entryQuestion.value.trim(),
      entryAnswers,
    };
  }

  // 実行
  runBtn.addEventListener("click", async () => {
    const settings = gatherSettings();

    // バリデーション
    if (!settings.question) {
      setStatus("質問内容を入力してください。", "error");
      return;
    }
    if (settings.repeatCount < 1) {
      setStatus("繰り返し回数を1以上にしてください。", "error");
      return;
    }
    if (
      settings.formUrl &&
      (!settings.entryQuestion ||
        settings.entryAnswers.length < settings.repeatCount)
    ) {
      setStatus(
        "Google Form連携にはエントリIDの設定が必要です。エントリID欄を生成してください。",
        "error"
      );
      return;
    }

    // 保存してから実行
    chrome.storage.local.set({ settings });

    runBtn.disabled = true;
    logEl.innerHTML = "";
    setStatus("実行中... ChatGPTタブを操作しています。", "running");

    try {
      // ChatGPTのアクティブタブを探す
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.url || !tab.url.includes("chatgpt.com")) {
        setStatus(
          "ChatGPTのタブをアクティブにしてから実行してください。",
          "error"
        );
        runBtn.disabled = false;
        return;
      }

      // content scriptへメッセージ送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "startAggregation",
        settings,
      });

      if (response && response.success) {
        const answers = response.answers;
        answers.forEach((a, i) => {
          addLog(`回答${i + 1}: ${a.substring(0, 80)}...`);
        });

        // Google Formへ送信
        if (settings.formUrl) {
          addLog("Google Formへ送信中...");
          const formResult = await chrome.runtime.sendMessage({
            action: "submitToForm",
            settings,
            answers,
          });

          if (formResult && formResult.success) {
            setStatus(
              `完了: ${answers.length}件の回答を取得し、フォームに送信しました。`,
              "info"
            );
          } else {
            setStatus(
              `回答は取得しましたが、フォーム送信に失敗しました: ${formResult?.error || "不明なエラー"}`,
              "error"
            );
          }
        } else {
          setStatus(`完了: ${answers.length}件の回答を取得しました。`, "info");
        }
      } else {
        setStatus(
          `エラー: ${response?.error || "content scriptとの通信に失敗しました。"}`,
          "error"
        );
      }
    } catch (err) {
      setStatus(`エラー: ${err.message}`, "error");
    } finally {
      runBtn.disabled = false;
    }
  });

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  function addLog(message) {
    const p = document.createElement("p");
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }
});

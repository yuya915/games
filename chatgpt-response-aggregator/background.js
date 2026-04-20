// Google Formへのバックグラウンド送信を担当するservice worker

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "submitToForm") {
    handleFormSubmission(request.settings, request.answers)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 非同期レスポンスを有効にする
  }
});

async function handleFormSubmission(settings, answers) {
  const { formUrl, question, entryQuestion, entryAnswers } = settings;

  // フォームURLからformResponseのURLを構築
  const submitUrl = formUrl
    .replace("/viewform", "/formResponse")
    .replace("/edit", "/formResponse");

  // フォームデータを構築
  const formData = new URLSearchParams();

  // 質問のエントリ
  if (entryQuestion) {
    formData.append(entryQuestion, question);
  }

  // 各回答のエントリ
  for (let i = 0; i < answers.length; i++) {
    if (entryAnswers[i]) {
      formData.append(entryAnswers[i], answers[i]);
    }
  }

  // HTTP POSTで送信
  const response = await fetch(submitUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  // no-corsモードではresponse.okは常にfalseになるが、送信自体は成功する
  return { success: true };
}

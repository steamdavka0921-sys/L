const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  const sendMessage = (chatId, text, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };

    return new Promise((resolve) => {
      const req = https.request(options);
      req.write(data);
      req.end(() => resolve());
    });
  };

  const saveToFirestore = (gameId, telegramUser) => {
    const data = JSON.stringify({
      fields: {
        gameId: { stringValue: gameId },
        telegramId: { stringValue: telegramUser.id.toString() },
        firstName: { stringValue: telegramUser.first_name || "" },
        username: { stringValue: telegramUser.username || "unknown" },
        status: { stringValue: "pending" },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    });

    const options = {
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.write(data);
      req.end();
    });
  };

  try {
    const message = update.message;
    const callbackQuery = update.callback_query;

    if (message?.text === "/start") {
      await sendMessage(message.chat.id, "Сайн байна уу? Цэнэглэх хүсэлт илгээх бол доорх товчийг дарна уу.", {
        inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
      });
    }

    if (callbackQuery?.data === "ask_id") {
      await sendMessage(callbackQuery.message.chat.id, "Та тоглоомын ID-гаа бичиж илгээнэ үү:");
    }

    // Хэрэглэгч ID-гаа бичих үед
    if (message?.text && message.text !== "/start") {
      const gameId = message.text.trim();
      
      // Firestore-руу хадгалах
      await saveToFirestore(gameId, message.from);

      // Админд мэдэгдэх
      await sendMessage(ADMIN_ID, `🔔 ШИНЭ ЦЭНЭГЛЭЛТ!\nID: ${gameId}\nХэрэглэгч: @${message.from.username || message.from.first_name}`);

      // Хэрэглэгчид баталгаажуулах
      await sendMessage(message.chat.id, `✅ Хүсэлт бүртгэгдлээ!\nID: ${gameId}\n\nАдмин шалгаад таныг цэнэглэх болно.`);
    }

  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};

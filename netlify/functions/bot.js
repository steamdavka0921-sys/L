const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200 };

  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  // 1. Санамсаргүй 5 оронтой код үүсгэх (1, I, 0, O хассан)
  const generateCode = () => {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const httpRequest = (options, data) => {
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      if (data) req.write(data);
      req.end();
    });
  };

  const sendMessage = (chatId, text, replyMarkup = null) => {
    const data = JSON.stringify({ chat_id: chatId, text: text, reply_markup: replyMarkup });
    return httpRequest({
      hostname: 'api.telegram.org', port: 443, method: 'POST',
      path: `/bot${TOKEN}/sendMessage`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, data);
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

    if (message?.text && message.text !== "/start") {
      const gameId = message.text.trim();
      
      // Firestore-оос Game ID-г хайх
      const searchRes = await httpRequest({
        hostname: 'firestore.googleapis.com', port: 443, method: 'GET',
        path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`
      });

      let trxCode = "";
      const existingDoc = searchRes.documents?.find(doc => doc.fields.gameId.stringValue === gameId);

      if (existingDoc) {
        trxCode = existingDoc.fields.trxCode.stringValue;
      } else {
        trxCode = generateCode();
        // Шинээр хадгалах
        const saveData = JSON.stringify({
          fields: {
            gameId: { stringValue: gameId },
            trxCode: { stringValue: trxCode },
            telegramId: { stringValue: message.from.id.toString() },
            status: { stringValue: "pending" },
            createdAt: { timestampValue: new Date().toISOString() }
          }
        });
        await httpRequest({
          hostname: 'firestore.googleapis.com', port: 443, method: 'POST',
          path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`,
          headers: { 'Content-Type': 'application/json', 'Content-Length': saveData.length }
        }, saveData);
      }

      // Төлбөрийн мэдээлэл харуулах
      const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n` +
        `🏦 Данс: MN370050099105952353\n` +
        `🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n` +
        `📌 Гүйлгээний утга: ${trxCode}\n\n` +
        `⚠️ АНХААР АНХААР:\n` +
        `Гүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл (утасны дугаар, ID гэх мэт) бичвэл ДЭПО орохгүй!\n\n` +
        `Данс солигдох тул асууж хийгээрэй 🤗`;

      await sendMessage(message.chat.id, paymentMsg, {
        inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${gameId}_${trxCode}` }]]
      });

      // Админд мэдэгдэх
      await sendMessage(ADMIN_ID, `🔔 ШИНЭ ХҮСЭЛТ!\nID: ${gameId}\nКод: ${trxCode}\nUser: @${message.from.username || message.from.first_name}`);
    }

    if (callbackQuery?.data.startsWith("paid_")) {
        await sendMessage(callbackQuery.message.chat.id, "Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");
        await sendMessage(ADMIN_ID, `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\nМэдээлэл: ${callbackQuery.data}`);
    }

  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};

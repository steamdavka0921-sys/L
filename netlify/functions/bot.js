const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200 };

  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  // Санамсаргүй 5 оронтой код үүсгэх (1, I, 0, O хассан)
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
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
        });
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

    // 1. /start эсвэл Цэнэглэх товч
    if (message?.text === "/start") {
      await sendMessage(message.chat.id, "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.", {
        inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
      });
    }

    if (callbackQuery?.data === "ask_id") {
      await sendMessage(callbackQuery.message.chat.id, "Та MELBET ID-гаа бичиж илгээнэ үү:");
    }

    // 2. Хэрэглэгч ID-гаа бичих үед
    if (message?.text && message.text !== "/start") {
      const melbetId = message.text.trim();
      
      // Firestore-оос өмнө нь бүртгэгдсэн эсэхийг шалгах
      const searchRes = await httpRequest({
        hostname: 'firestore.googleapis.com', port: 443, method: 'GET',
        path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`
      });

      let trxCode = "";
      const existingDoc = searchRes.documents?.find(doc => doc.fields.gameId.stringValue === melbetId);

      if (existingDoc) {
        trxCode = existingDoc.fields.trxCode.stringValue;
      } else {
        trxCode = generateCode();
        // Шинэ хэрэглэгч бол хадгалах
        const saveData = JSON.stringify({
          fields: {
            gameId: { stringValue: melbetId },
            trxCode: { stringValue: trxCode },
            telegramId: { stringValue: message.from.id.toString() },
            username: { stringValue: message.from.username || "unknown" },
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
        inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${melbetId}_${trxCode}` }]]
      });
    }

    // 3. "Төлбөр төлсөн" товч дарахад
    if (callbackQuery?.data.startsWith("paid_")) {
      const info = callbackQuery.data.split("_");
      const mId = info[1];
      const code = info[2];
      const user = callbackQuery.from;

      // Хэрэглэгчид хариу өгөх
      await sendMessage(user.id, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");

      // Админд мэдэгдэл илгээх
      const adminMsg = `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n` +
        `🆔 MELBET ID: ${mId}\n` +
        `📌 Код: ${code}\n` +
        `👤 Хэрэглэгч: @${user.username || 'username байхгүй'}\n` +
        `📞 Нэр: ${user.first_name}`;

      await sendMessage(ADMIN_ID, adminMsg);
    }

  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};

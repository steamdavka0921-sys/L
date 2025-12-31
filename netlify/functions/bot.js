const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

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
      req.on('error', (e) => resolve({}));
      if (data) req.write(data);
      req.end();
    });
  };

  const sendMessage = (chatId, text, replyMarkup = null) => {
    const data = JSON.stringify({ chat_id: chatId, text: text, reply_markup: replyMarkup });
    const options = {
      hostname: 'api.telegram.org', port: 443, method: 'POST',
      path: `/bot${TOKEN}/sendMessage`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    return httpRequest(options, data);
  };

  try {
    // 1. Товчлуур дарах үйлдлийг (Callback Query) шалгах
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;
      const user = update.callback_query.from;

      if (callbackData === "ask_id") {
        await sendMessage(chatId, "Та MELBET ID-гаа бичиж илгээнэ үү:");
      } 
      else if (callbackData.startsWith("paid_")) {
        const parts = callbackData.split("_"); // paid, id, code
        const mId = parts[1];
        const code = parts[2];

        await sendMessage(chatId, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");
        
        const adminMsg = `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n🆔 MELBET ID: ${mId}\n📌 Код: ${code}\n👤 Хэрэглэгч: @${user.username || 'байхгүй'}\n📞 Нэр: ${user.first_name}`;
        await sendMessage(ADMIN_ID, adminMsg);
      }
      return { statusCode: 200, body: "ok" };
    }

    // 2. Мессеж ирэх үед (/start эсвэл ID бичих)
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === "/start") {
        await sendMessage(chatId, "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.", {
          inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
        });
      } 
      else if (text && text.length > 2) {
        const melbetId = text.trim();
        
        // Firestore-оос хайх
        const searchPath = `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`;
        const searchRes = await httpRequest({ hostname: 'firestore.googleapis.com', port: 443, method: 'GET', path: searchPath });

        let trxCode = "";
        const existingDoc = searchRes.documents?.find(doc => doc.fields.gameId.stringValue === melbetId);

        if (existingDoc) {
          trxCode = existingDoc.fields.trxCode.stringValue;
        } else {
          trxCode = generateCode();
          const saveData = JSON.stringify({
            fields: {
              gameId: { stringValue: melbetId },
              trxCode: { stringValue: trxCode },
              telegramId: { stringValue: update.message.from.id.toString() },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          });
          await httpRequest({
            hostname: 'firestore.googleapis.com', port: 443, method: 'POST',
            path: searchPath,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(saveData) }
          }, saveData);
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${melbetId}_${trxCode}` }]]
        });
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};      });
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

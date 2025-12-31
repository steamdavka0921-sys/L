const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  let update;
  try { update = JSON.parse(event.body); } catch (e) { return { statusCode: 200 }; }

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  const httpRequest = (options, data = null) => {
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
    // 1. Товчлуур дарах үйлдэл
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;
      if (callbackData === "ask_id") {
        await sendMessage(chatId, "Та MELBET ID-гаа бичиж илгээнэ үү:");
      } 
      if (callbackData.startsWith("paid_")) {
        const parts = callbackData.split("_");
        await sendMessage(chatId, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");
        await sendMessage(ADMIN_ID, `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n🆔 MELBET ID: ${parts[1]}\n📌 Код: ${parts[2]}\n👤 Хэрэглэгч: @${update.callback_query.from.username || 'байхгүй'}`);
      }
      return { statusCode: 200 };
    }

    // 2. ID бичих үйлдэл
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await sendMessage(chatId, "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.", {
          inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
        });
      } else {
        const melbetId = text;
        const firestorePath = `/v1/projects/${FIREBASE_ID}/databases/(default)/documents/requests`;
        
        // Firestore-оос энэ ID-г хайх
        const searchRes = await httpRequest({
          hostname: 'firestore.googleapis.com', port: 443, method: 'GET',
          path: firestorePath
        });

        let trxCode = "";
        const existingDoc = searchRes.documents?.find(doc => doc.fields.gameId.stringValue === melbetId);

        if (existingDoc) {
          trxCode = existingDoc.fields.trxCode.stringValue;
        } else {
          // Шинээр код үүсгэх
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) {
            trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          // Firestore-д хадгалах
          const saveData = JSON.stringify({
            fields: {
              gameId: { stringValue: melbetId },
              trxCode: { stringValue: trxCode },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          });
          await httpRequest({
            hostname: 'firestore.googleapis.com', port: 443, method: 'POST',
            path: firestorePath,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(saveData) }
          }, saveData);
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${melbetId}_${trxCode}` }]]
        });
      }
    }
  } catch (err) { console.error(err); }

  return { statusCode: 200 };
};

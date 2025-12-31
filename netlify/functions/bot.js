const https = require('https');

exports.handler = async (event) => {
  // Зөвхөн POST хүсэлтийг хүлээж авна
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 200, body: "Invalid JSON" };
  }

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  // Telegram руу хүсэлт илгээх функц
  const telegramRequest = (method, payload) => {
    const data = JSON.stringify(payload);
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TOKEN}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      req.on('error', () => resolve({}));
      req.write(data);
      req.end();
    });
  };

  // Firestore-той холбогдох функц
  const firestoreRequest = (method, path, payload = null) => {
    const data = payload ? JSON.stringify(payload) : null;
    return new Promise((resolve) => {
      const options = {
        hostname: 'firestore.googleapis.com',
        port: 443,
        path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}`,
        method: method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      };
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      req.on('error', () => resolve({}));
      if (data) req.write(data);
      req.end();
    });
  };

  try {
    // A. ТОГЧЛУУР ДАРАХ ҮЙЛДЭЛ (Callback Query)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;

      if (cb.data === "ask_id") {
        await telegramRequest('sendMessage', { chat_id: chatId, text: "Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      
      if (cb.data.startsWith("paid_")) {
        const parts = cb.data.split("_");
        await telegramRequest('sendMessage', { chat_id: chatId, text: "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү." });
        await telegramRequest('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n🆔 MELBET ID: ${parts[1]}\n📌 Код: ${parts[2]}\n👤 Хэрэглэгч: @${cb.from.username || 'байхгүй'}` 
        });
      }

      await telegramRequest('answerCallbackQuery', { callback_query_id: cb.id });
      return { statusCode: 200, body: "ok" };
    }

    // B. МЕССЕЖ ИРЭХ ҮЙЛДЭЛ
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await telegramRequest('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.",
          reply_markup: { inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]] }
        });
      } else {
        // Firestore-оос хайх
        const searchRes = await firestoreRequest('GET', '/requests');
        let trxCode = "";
        const existingDoc = searchRes.documents?.find(doc => doc.fields.gameId.stringValue === text);

        if (existingDoc) {
          trxCode = existingDoc.fields.trxCode.stringValue;
        } else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          
          await firestoreRequest('POST', '/requests', {
            fields: {
              gameId: { stringValue: text },
              trxCode: { stringValue: trxCode },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          });
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await telegramRequest('sendMessage', {
          chat_id: chatId,
          text: paymentMsg,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return { statusCode: 200, body: "ok" };
};          });
          await httpRequest({
            hostname: 'firestore.googleapis.com', port: 443, method: 'POST',
            path: firestorePath,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(saveData) }
          }, saveData);
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]]
        });
      }
    }
  } catch (err) { console.error(err); }

  return { statusCode: 200, body: "ok" };
};  } catch (err) { console.error(err); }

  return { statusCode: 200 };
};

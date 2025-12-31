const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  let update;
  try { update = JSON.parse(event.body); } catch (e) { return { statusCode: 200 }; }

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  const callTelegram = (method, params) => {
    const data = JSON.stringify(params);
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TOKEN}/${method}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      };
      const req = https.request(options, (res) => resolve());
      req.write(data);
      req.end();
    });
  };

  const callFirestore = (method, path, body = null) => {
    const data = body ? JSON.stringify(body) : null;
    return new Promise((resolve) => {
      const options = {
        hostname: 'firestore.googleapis.com', port: 443, path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}`,
        method: method, headers: data ? { 'Content-Type': 'application/json' } : {}
      };
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => { try { resolve(JSON.parse(resBody)); } catch(e) { resolve({}); } });
      });
      if (data) req.write(data);
      req.end();
    });
  };

  try {
    // 1. ТОГЧЛУУР ДАРАХ (Callback Queries)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;

      if (cb.data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      
      if (cb.data === "menu_withdraw") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт: Та MELBET ID-гаа бичиж илгээнэ үү:" });
      }

      if (cb.data.startsWith("paid_")) {
        const parts = cb.data.split("_");
        await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Төлбөрийг хүлээн авлаа. Админ шалгаж байна..." });
        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\nID: ${parts[1]}\nКод: ${parts[2]}\nUser: @${cb.from.username || 'unknown'}`
        });
      }

      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
      return { statusCode: 200 };
    }

    // 2. МЕССЕЖ ИРЭХ
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? Үйлчилгээгээ сонгоно уу:",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]
            ]
          }
        });
        return { statusCode: 200 };
      }

      // Тоо ирэх үед (ID эсвэл Татах код)
      if (!isNaN(text)) {
        if (text.length >= 7) { // ID гэж үзэх
          const searchRes = await callFirestore('GET', '/requests');
          let trxCode = "";
          const existing = (searchRes.documents || []).find(d => d.fields.gameId.stringValue === text);

          if (existing) trxCode = existing.fields.trxCode.stringValue;
          else {
            const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
            for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
            await callFirestore('POST', '/requests', {
              fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } }
            });
          }

          const payMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nЯМАР НЭГ ТОО УТАСНЫ ДУГАААР ID БИЧВЭЛ ДЭПО ОРОХГҮЙ\n\nДанс солигдох тул асууж хийгээрэй 🤗`;
          
          await callTelegram('sendMessage', {
            chat_id: chatId, text: payMsg,
            reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
          });
        } else { // Богино тоо бол Таталтын Код гэж үзэх
          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Татах хүсэлт болон код бүртгэгдлээ. Админ шалгаж байна." });
          await callTelegram('sendMessage', { 
            chat_id: ADMIN_ID, 
            text: `⚠️ ТАТАХ ХҮСЭЛТ!\nМэдээлэл: ${text}\nUser: @${update.message.from.username || 'unknown'}` 
          });
        }
      }
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "ok" };
};        } else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          
          await callFirestore('POST', '/requests', {
            fields: {
              gameId: { stringValue: text },
              trxCode: { stringValue: trxCode },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          });
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: paymentMsg,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
    }
  } catch (err) {
    console.error("Function Error:", err);
  }

  return { statusCode: 200, body: "ok" };
};

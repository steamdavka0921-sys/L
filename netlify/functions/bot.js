const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  // Telegram API функц
  const callTelegram = async (method, params) => {
    const data = JSON.stringify(params);
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
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      req.on('error', (e) => {
        console.error("Telegram Error:", e);
        resolve({});
      });
      req.write(data);
      req.end();
    });
  };

  // Firestore API функц
  const callFirestore = async (method, path, body = null) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}`,
      method: method,
      headers: data ? { 'Content-Type': 'application/json' } : {}
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      req.on('error', (e) => {
        console.error("Firestore Error:", e);
        resolve({});
      });
      if (data) req.write(data);
      req.end();
    });
  };

  try {
    const update = JSON.parse(event.body);
    
    // Callback Query (Товчлуур дарах)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;

      if (cb.data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      
      if (cb.data === "menu_withdraw") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт: Та MELBET ID болон Таталтын кодоо хамт бичиж илгээнэ үү:" });
      }

      if (cb.data.startsWith("paid_")) {
        const parts = cb.data.split("_");
        await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Төлбөрийг хүлээн авлаа. Админ шалгаж байна..." });
        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${parts[1]}\n📌 Код: ${parts[2]}\n👤 User: @${cb.from.username || 'unknown'}`
        });
      }

      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
      return { statusCode: 200 };
    }

    // Message (Текст бичих)
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? Deposit бот-д тавтай морилно уу. Үйлчилгээгээ сонгоно уу:",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]
            ]
          }
        });
      } else if (!isNaN(text.replace(/\s/g, ''))) {
        // Хэрэв тоо байвал (ID гэж үзэх)
        if (text.length >= 7) {
          const searchRes = await callFirestore('GET', '/requests');
          let trxCode = "";
          const existing = (searchRes.documents || []).find(d => d.fields.gameId && d.fields.gameId.stringValue === text);

          if (existing && existing.fields.trxCode) {
            trxCode = existing.fields.trxCode.stringValue;
          } else {
            const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
            for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
            await callFirestore('POST', '/requests', {
              fields: { 
                gameId: { stringValue: text }, 
                trxCode: { stringValue: trxCode },
                telegramId: { stringValue: chatId.toString() }
              }
            });
          }

          const payMsg = `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР: Зөвхөн кодыг бичээрэй!`;
          await callTelegram('sendMessage', {
            chat_id: chatId, text: payMsg,
            reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
          });
        } else {
          // Богино тоо байвал таталтын код гэж үзэх
          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Татах хүсэлт бүртгэгдлээ. Админ шалгаж байна." });
          await callTelegram('sendMessage', { 
            chat_id: ADMIN_ID, 
            text: `⚠️ ТАТАХ ХҮСЭЛТ!\n📝 Мэдээлэл: ${text}\n👤 User: @${update.message.from.username || 'unknown'}` 
          });
        }
      }
    }
  } catch (err) {
    // Алдааг админ руу илгээх (Debug хийхэд хялбар)
    await callTelegram('sendMessage', { chat_id: ADMIN_ID, text: "🛑 БОТ ДЭЭР АЛДАА ГАРЛАА:\n" + err.toString() });
  }

  return { statusCode: 200, body: "OK" };
};

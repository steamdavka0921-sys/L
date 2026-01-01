const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  const callTelegram = async (method, params) => {
    const data = JSON.stringify(params);
    const options = {
      hostname: 'api.telegram.org', port: 443, path: `/bot${TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      req.write(data);
      req.end();
    });
  };

  const callFirestore = async (method, path, body = null) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'firestore.googleapis.com', port: 443, path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}`,
      method: method, headers: data ? { 'Content-Type': 'application/json' } : {}
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => resolve(JSON.parse(resBody || '{}')));
      });
      if (data) req.write(data);
      req.end();
    });
  };

  try {
    const update = JSON.parse(event.body);
    
    // 1. Товчлуур дарах
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;

      if (cb.data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      if (cb.data === "menu_withdraw") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт:\n\nТа MELBET ID болон Таталтын кодоо хамт бичнэ үү.\nЖишээ нь: 984210857 XUFD" });
      }
      if (cb.data.startsWith("paid_")) {
        const parts = cb.data.split("_");
        await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Төлбөрийг хүлээн авлаа. Админ шалгаж байна..." });
        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${parts[1]}\n📌 Код: ${parts[2]}\n👤 User: @${cb.from.username || 'unknown'}`
        });
      }
      return { statusCode: 200 };
    }

    // 2. Текст бичих
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? EEGII AUTOMAT 24/7 Deposit, WITHDRAW бот-д тавтай морилно уу. Данс солигдох тул асууж хийгээрэй:",
          reply_markup: {
            inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]]
          }
        });
      } 
      // Татах логик: ID болон Код хамт байгаа эсэхийг шалгах (Жишээ нь: 984210857 XUFD)
      else if (text.includes(" ") && text.split(" ")[0].length >= 7) {
        const parts = text.split(" ");
        const melbetId = parts[0];
        const withdrawCode = parts[1];

        // Firestore-д түр хадгалах (State)
        await callFirestore('PATCH', `/user_states/${chatId}?updateMask.fieldPaths=data`, {
          fields: { data: { stringValue: `withdraw_${melbetId}_${withdrawCode}` } }
        });

        await callTelegram('sendMessage', { chat_id: chatId, text: "🏦 Одоо татах мөнгөө хүлээн авах ДАНСНЫ МЭДЭЭЛЛЭЭ бичнэ үү:" });
      }
      // Зөвхөн тоо (Цэнэглэх ID)
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7) {
        const searchRes = await callFirestore('GET', '/requests');
        let trxCode = "";
        const existing = (searchRes.documents || []).find(d => d.fields.gameId && d.fields.gameId.stringValue === text);

        if (existing) { trxCode = existing.fields.trxCode.stringValue; } 
        else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          await callFirestore('POST', '/requests', {
            fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } }
          });
        }
        await callTelegram('sendMessage', {
          chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ Зөвхөн кодыг бичээрэй!`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
      // Дансны мэдээлэл ирэх үед (Withdraw эцсийн шат)
      else {
        const stateRes = await callFirestore('GET', `/user_states/${chatId}`);
        if (stateRes.fields && stateRes.fields.data.stringValue.startsWith("withdraw_")) {
          const stateData = stateRes.fields.data.stringValue.split("_");
          const mId = stateData[1];
          const wCode = stateData[2];

          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Таны татах хүсэлт админд очлоо. Шалгаад шилжүүлэх болно." });
          await callTelegram('sendMessage', {
            chat_id: ADMIN_ID,
            text: `⚠️ ТАТАХ ХҮСЭЛТ!\n\n🆔 MELBET ID: ${mId}\n🔑 Код: ${wCode}\n🏦 Данс: ${text}\n👤 User: @${update.message.from.username || 'байхгүй'}`
          });

          // State-ийг устгах
          await callFirestore('DELETE', `/user_states/${chatId}`);
        }
      }
    }
  } catch (err) {
    await callTelegram('sendMessage', { chat_id: ADMIN_ID, text: "🛑 АЛДАА: " + err.toString() });
  }
  return { statusCode: 200, body: "OK" };
};

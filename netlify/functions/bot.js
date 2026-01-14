const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  // Netlify Variable-аас утгуудыг авна
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;
  const API_KEY = process.env.FIREBASE_API_KEY; 
  
  const BOT_USERNAME = "Eegiidemobot"; 
  const BONUS_RATE = 0.03; // Эхний сар 3%

  const WITHDRAW_PHOTO = "https://res.cloudinary.com/dpdsuhwa9/image/upload/v1767338251/fljqkzsqe4rtkhijsdsq.jpg";
  const LOADING_GIF = "https://res.cloudinary.com/dpdsuhwa9/image/upload/v1767404699/zzxmv9nclwgk5jw259na.gif";

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
      hostname: 'firestore.googleapis.com', port: 443,
      path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}?key=${API_KEY}`,
      method: method,
      headers: data ? { 'Content-Type': 'application/json' } : {}
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => { try { resolve(JSON.parse(resBody)); } catch (e) { resolve({}); } });
      });
      if (data) req.write(data);
      req.end();
    });
  };

  try {
    const update = JSON.parse(event.body);
    const msg = update.message;
    const cb = update.callback_query;
    const chatId = msg ? msg.chat.id : (cb ? cb.message.chat.id : null);
    if (!chatId) return { statusCode: 200 };

    if (cb) {
      const data = cb.data;
      if (data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      else if (data === "menu_withdraw") {
        await callTelegram('sendPhoto', { chat_id: chatId, photo: WITHDRAW_PHOTO, caption: "🎯 MELBET CASH -> Darkhan -> EEGII AGENT (24/7)\n‼️ Доод дүн 3,500₮" });
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 ID болон Кодоо бичнэ үү.\nЖишээ: 984210857 XUFD" });
      }
      else if (data === "menu_invite") {
        const inviteLink = `https://t.me/${BOT_USERNAME}?start=${chatId}`;
        const userRes = await callFirestore('GET', `/users/${chatId}`);
        const bonus = userRes.fields?.bonusBalance?.doubleValue || 0;
        await callTelegram('sendMessage', { chat_id: chatId, text: `🎁 *НАЙЗЫГАА УРИАД ${BONUS_RATE * 100}% БОНУС АВААРАЙ*\n\n🔗 *Таны линк:*\n${inviteLink}\n\n💰 *Таны бонус баланс:* ${bonus}₮`, parse_mode: "Markdown" });
      }
      else if (data.startsWith("paid_")) {
        const [_, gId, tCode] = data.split("_");
        const loadingMsg = await callTelegram('sendAnimation', { chat_id: chatId, animation: LOADING_GIF, caption: "✅ Шалгаж байна. Түр хүлээнэ үү." });
        await callFirestore('PATCH', `/requests/${gId}`, { fields: { chatId: { stringValue: chatId.toString() }, loadingId: { stringValue: loadingMsg.result?.message_id.toString() || "" }, trxCode: { stringValue: tCode } } });
        await callTelegram('sendMessage', { chat_id: ADMIN_ID, text: `🔔 *ЦЭНЭГЛЭХ ХҮСЭЛТ!*\n🆔 ID: \`${gId}\`\n📍 Код: ${tCode}\n\n✅ *Зөвшөөрөх бол:* \`${gId} [дүн]\``, parse_mode: "Markdown" });
      }
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
    }

    if (msg && msg.text) {
      const text = msg.text.trim();
      if (chatId.toString() === ADMIN_ID && text.includes(" ")) {
        const [targetId, amountStr] = text.split(" ");
        const amount = parseFloat(amountStr);
        if (!isNaN(amount)) {
          const reqRes = await callFirestore('GET', `/requests/${targetId}`);
          if (reqRes.fields) {
            const userChatId = reqRes.fields.chatId.stringValue;
            const loadingId = reqRes.fields.loadingId.stringValue;
            if (loadingId) await callTelegram('deleteMessage', { chat_id: userChatId, message_id: parseInt(loadingId) }).catch(()=>{});
            const userRes = await callFirestore('GET', `/users/${userChatId}`);
            if (userRes.fields?.invitedBy) {
              const inviterId = userRes.fields.invitedBy.stringValue;
              const bonusAmt = amount * BONUS_RATE;
              const inviterRes = await callFirestore('GET', `/users/${inviterId}`);
              const currentBonus = inviterRes.fields?.bonusBalance?.doubleValue || 0;
              await callFirestore('PATCH', `/users/${inviterId}?updateMask.fieldPaths=bonusBalance`, { fields: { bonusBalance: { doubleValue: currentBonus + bonusAmt } } });
              await callTelegram('sendMessage', { chat_id: inviterId, text: `🎊 Таны урьсан найз цэнэглэлт хийлээ! Танд ${bonusAmt}₮ бонус орлоо.` });
            }
            await callTelegram('sendMessage', { chat_id: userChatId, text: `✅ Таны ${targetId} ID-д ${amount}₮ амжилттай орлоо.` });
            await callTelegram('sendMessage', { chat_id: ADMIN_ID, text: `🏁 ${targetId}-д ${amount}₮ орж, бонус бодогдов.` });
          }
        }
      }
      else if (text.startsWith("/start")) {
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1] !== chatId.toString()) {
          await callFirestore('PATCH', `/users/${chatId}?updateMask.fieldPaths=invitedBy`, { fields: { invitedBy: { stringValue: parts[1] } } });
        }
        await callTelegram('sendMessage', { chat_id: chatId, text: "Сайн байна уу? @Eegiidemobot 24/7", reply_markup: { inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }], [{ text: "🎁 Найзаа урих / Бонус", callback_data: "menu_invite" }]] } });
      }
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const gameId = text.replace(/\s/g, '');
        const trxCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        await callTelegram('sendMessage', { chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Утга: ${trxCode}\n\n⚠️ УТГАА ЗААВАЛ БИЧНЭ ҮҮ!`, reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${gameId}_${trxCode}` }]] } });
        await callTelegram('sendMessage', { chat_id: chatId, text: `370050099105952353` });
      }
      // Withdraw логик өмнөхтэй ижил...
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

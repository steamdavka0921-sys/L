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
    const chatId = update.message ? update.message.chat.id : (update.callback_query ? update.callback_query.message.chat.id : null);
    if (!chatId) return { statusCode: 200 };

    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;

      // 💰 Цэнэглэх товчлуур
      if (data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      // 💳 Татах товчлуур
      else if (data === "menu_withdraw") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт:\n\nТа MELBET ID болон Таталтын кодоо хамт бичнэ үү.\nЖишээ нь: 984210857 XUFD" });
      }
      // ✅ Төлбөр төлсөн дарахад
      else if (data.startsWith("paid_")) {
        const [_, gId, tCode] = data.split("_");
        await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Шалгаж байна. Түр хүлээнэ үү." });

        const nowTs = Date.now();
        // Firebase-д хүсэлтийг цагтай нь хадгалах
        await callFirestore('PATCH', `/requests/${gId}?updateMask.fieldPaths=createdAt`, {
          fields: { createdAt: { stringValue: nowTs.toString() } }
        });

        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${gId}\n📌 Код: ${tCode}\n👤 User: @${cb.from.username || 'unknown'}`,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Зөвшөөрөх", callback_data: `adm_ok_dep_${chatId}_${gId}` },
              { text: "❌ Татгалзах", callback_data: `adm_no_dep_${chatId}_${gId}` }
            ]]
          }
        });
      }
      // 👑 Админ шийдвэр гаргах
      else if (data.startsWith("adm_")) {
        const [_, status, type, userId, targetId] = data.split("_");
        const isApprove = status === "ok";

        // Firebase-аас цагийг дахин шалгах
        const res = await callFirestore('GET', `/requests/${targetId}`);
        const createdAtStr = (res.fields && res.fields.createdAt) ? res.fields.createdAt.stringValue : null;
        
        let isExpired = false;
        if (createdAtStr) {
          const diffSec = (Date.now() - parseInt(createdAtStr)) / 1000;
          if (diffSec > 120) isExpired = true; // 120 секундээс хэтэрсэн бол
        }

        if (isApprove && isExpired) {
          // Хэрэв хугацаа хэтэрсэн бол
          await callTelegram('sendMessage', { 
            chat_id: userId, 
            text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй таньд тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой" 
          });
          await callTelegram('editMessageText', {
            chat_id: ADMIN_ID, message_id: cb.message.message_id,
            text: `⚠️ ХУГАЦАА ХЭТЭРСЭН (2мин+):\nID: ${targetId}\nТөлөв: Цуцлагдсан`
          });
        } else {
          // Хугацаандаа байгаа эсвэл шууд татгалзсан бол
          const finalStatus = isApprove ? "✅ ЗӨВШӨӨРӨГДӨВ" : "❌ ТАТГАЛЗАВ";
          const userMsg = isApprove ? `Таны ${targetId} ID-тай хүсэлтийг админ зөвшөөрлөө.` : "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой";
          
          await callTelegram('sendMessage', { chat_id: userId, text: userMsg });
          await callTelegram('editMessageText', {
            chat_id: ADMIN_ID, message_id: cb.message.message_id,
            text: `🏁 ШИЙДВЕРЛЭГДЭВ:\nID: ${targetId}\nТөлөв: ${finalStatus}`
          });
        }
      }
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
      return { statusCode: 200 };
    }

    // --- Бусад логик (Start, ID бичих г.м) ---
    if (update.message && update.message.text) {
      const text = update.message.text.trim();
      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId, text: "Сайн байна уу? EEGII AUTOMAT 24/7\n\nДанс солигдох тул заавал шалгаж шилжүүлээрэй!",
          reply_markup: { inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]] }
        });
      } 
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        let trxCode = ""; for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
        await callFirestore('POST', '/requests', { fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } } });
        await callTelegram('sendMessage', {
          chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
      // ... (бусад татах логик хэвээрээ)
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

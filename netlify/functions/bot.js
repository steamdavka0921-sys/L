const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;
  const API_KEY = process.env.FIREBASE_API_KEY; 
  
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
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1/projects/${FIREBASE_ID}/databases/(default)/documents${path}?key=${API_KEY}`,
      method: method,
      headers: data ? { 'Content-Type': 'application/json' } : {}
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (d) => resBody += d);
        res.on('end', () => {
          try { resolve(JSON.parse(resBody)); } catch (e) { resolve({}); }
        });
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

      if (data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      else if (data === "menu_withdraw") {
        await callTelegram('sendPhoto', {
          chat_id: chatId, 
          photo: WITHDRAW_PHOTO,
          caption: "🎯 Та мөнгөө татах үедээ:\n📱 My account-руугаа ороод Withdraw цэснээс MELBET CASH сонголтыг сонгох ба мөнгөн дүнгээ оруулаад:\n\n🎯 CITY ХЭСЭГТ: Darkhan\n🎯 STREET ХЭСЭГТ: EEGII AGENT (24/7)\n\n‼️ Доод дүн 3,500₮"
        });
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт:\n\nТа MELBET ID болон Таталтын кодоо хамт бичнэ үү.\nЖишээ нь: 984210857 XUFD" });
      }
      else if (data.startsWith("paid_")) {
        const [_, gId, tCode] = data.split("_");
        
        // GIF илгээж, message_id-г нь авах
        const loadingMsg = await callTelegram('sendAnimation', { 
          chat_id: chatId, 
          animation: LOADING_GIF, 
          caption: "✅ Шалгаж байна. Түр хүлээнэ үү." 
        });

        const loadingId = loadingMsg.result ? loadingMsg.result.message_id : null;
        const nowTs = Date.now();

        // Firestore-д loadingId-г хадгалах (дараа нь устгахын тулд)
        await callFirestore('PATCH', `/requests/${gId}?updateMask.fieldPaths=createdAt&updateMask.fieldPaths=loadingId`, {
          fields: { 
            createdAt: { stringValue: nowTs.toString() },
            loadingId: { stringValue: loadingId ? loadingId.toString() : "" }
          }
        });
        
        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${gId}\n📍 Код: ${tCode}\n👤 User: @${cb.from.username || 'unknown'}`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Зөвшөөрөх", callback_data: `adm_ok_dep_${chatId}_${gId}` }, { text: "❌ Татгалзах", callback_data: `adm_no_dep_${chatId}_${gId}` }]] }
        });
      }
      else if (data.startsWith("adm_")) {
        const [_, status, type, userId, targetId] = data.split("_");
        const isApprove = status === "ok";
        
        const res = await callFirestore('GET', `/requests/${targetId}`);
        
        // 1. Loading GIF-ийг устгах
        if (res.fields && res.fields.loadingId && res.fields.loadingId.stringValue) {
          await callTelegram('deleteMessage', { 
            chat_id: userId, 
            message_id: parseInt(res.fields.loadingId.stringValue) 
          }).catch(() => {}); // Алдаа гарвал үлсгэх
        }

        const createdAtStr = (res.fields && res.fields.createdAt) ? res.fields.createdAt.stringValue : null;
        let isExpired = false;
        if (createdAtStr) {
          const diffSec = (Date.now() - parseInt(createdAtStr)) / 1000;
          if (diffSec > 120) isExpired = true; 
        }

        // 2. Хариу мессежийг илгээх
        if (isApprove && isExpired) {
          await callTelegram('sendMessage', { chat_id: userId, text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй танд тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой" });
          await callTelegram('editMessageText', { chat_id: ADMIN_ID, message_id: cb.message.message_id, text: `⚠️ ХУГАЦАА ХЭТЭРСЭН (2мин+):\nID: ${targetId}\nТөлөв: Цуцлагдсан` });
        } else {
          const finalStatus = isApprove ? "✅ ЗӨВШӨӨРӨГДӨВ" : "❌ ТАТГАЛЗАВ";
          const userMsg = isApprove ? `Таны ${targetId} ID-г цэнэглэлт амжилттай .` : "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй танд тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой";
          await callTelegram('sendMessage', { chat_id: userId, text: userMsg });
          await callTelegram('editMessageText', { chat_id: ADMIN_ID, message_id: cb.message.message_id, text: `🏁 ШИЙДВЭРЛЭГДЭВ:\nID: ${targetId}\nТөлөв: ${finalStatus}` });
        }
      }
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
      return { statusCode: 200 };
    }

    if (update.message && update.message.text) {
      const text = update.message.text.trim();
      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId, text: "Сайн байна уу? EEGII AUTOMAT 24/7\n\nДанс солигдох тул заавал шалгаж шилжүүлээрэй!",
          reply_markup: { inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]] }
        });
      } 
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const gameId = text.replace(/\s/g, '');
        const existingData = await callFirestore('GET', `/requests/${gameId}`);
        let trxCode = "";

        if (existingData && existingData.fields && existingData.fields.trxCode) {
          trxCode = existingData.fields.trxCode.stringValue;
        } else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          
          await callFirestore('PATCH', `/requests/${gameId}?updateMask.fieldPaths=trxCode&updateMask.fieldPaths=gameId`, {
            fields: { trxCode: { stringValue: trxCode }, gameId: { stringValue: gameId } }
          });
        }
        
        const depositMsg = `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Утга: ${trxCode}\n\n⚠️ ГҮЙЛГЭЭНИЙ УТГАА ЗААВАЛ БИЧНЭ ҮҮ!\nДоод дүн 1,000₮\nДээд дүн 100,000₮\n\nГҮЙЛГЭЭ ХИЙСЭН ТОХИОЛДОЛД ДООРХ ТӨЛБӨР ТӨЛСӨН ГЭХ ТОВЧ ДЭЭР ДАРНА УУ\n👇👇👇`;

        // Үндсэн заавар
        await callTelegram('sendMessage', {
          chat_id: chatId, 
          text: depositMsg,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${gameId}_${trxCode}` }]] }
        });

        // Дансны дугаар тусад нь (Хуулж авахад хялбар)
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: `370050099105952353`
        });
      }
      // ... (Withdraw хэсэг хэвээрээ)
      else if (text.includes(" ") && text.split(" ")[0].length >= 7) {
        const [mId, wCode] = text.split(" ");
        await callFirestore('PATCH', `/user_states/${chatId}?updateMask.fieldPaths=data`, { fields: { data: { stringValue: `withdraw_${mId}_${wCode}` } } });
        await callTelegram('sendMessage', { chat_id: chatId, text: "🏦 Одоо татах мөнгөө хүлээн авах ДАНС-аа бичнэ үү:\n\n⚠️ ЗААВАЛ IBAN (MN...) тай цуг бичнэ шүү!" });
      }
      else if (text.toUpperCase().includes("MN") || (text.replace(/\D/g, '').length >= 15)) {
        const stateRes = await callFirestore('GET', `/user_states/${chatId}`);
        if (stateRes && stateRes.fields && stateRes.fields.data.stringValue.startsWith("withdraw_")) {
          const [_, mId, wCode] = stateRes.fields.data.stringValue.split("_");
          
          const loadingMsg = await callTelegram('sendAnimation', { 
            chat_id: chatId, 
            animation: LOADING_GIF, 
            caption: "✅ Шалгаж байна. Түр хүлээнэ үү." 
          });

          const loadingId = loadingMsg.result ? loadingMsg.result.message_id : null;

          await callTelegram('sendMessage', {
            chat_id: ADMIN_ID, text: `⚠️ ТАТАХ ХҮСЭЛТ!\n🆔 ID: ${mId}\n🔑 Код: ${wCode}\n🏦 Данс: ${text}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Зөвшөөрөх", callback_data: `adm_ok_wit_${chatId}_${mId}_${loadingId}` }, { text: "❌ Татгалзах", callback_data: `adm_no_wit_${chatId}_${mId}_${loadingId}` }]] }
          });
          await callFirestore('DELETE', `/user_states/${chatId}`);
        }
      }
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

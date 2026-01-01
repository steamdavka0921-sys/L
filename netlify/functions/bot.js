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

      if (data.startsWith("paid_")) {
        const [_, gId, tCode] = data.split("_");
        
        // Хэрэглэгчид харагдах текст солигдсон
        await callTelegram('sendMessage', { 
          chat_id: chatId, 
          text: "✅ Шалгажбайна. Түр хүлээнэ үү." 
        });

        // Админд очих хүсэлт дээр одоогийн цагийг Firebase-д хадгалах
        const timestamp = Date.now();
        await callFirestore('PATCH', `/requests/${gId}?updateMask.fieldPaths=createdAt`, {
          fields: { createdAt: { integerValue: timestamp.toString() } }
        });

        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${gId}\n📌 Код: ${tCode}\n👤 User: @${cb.from.username || 'unknown'}\n⏰ Ирсэн цаг: ${new Date(timestamp).toLocaleTimeString()}`,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Зөвшөөрөх", callback_data: `adm_ok_dep_${chatId}_${gId}` },
              { text: "❌ Татгалзах", callback_data: `adm_no_dep_${chatId}_${gId}` }
            ]]
          }
        });
      }
      
      else if (data.startsWith("adm_")) {
        const [_, status, type, userId, targetId] = data.split("_");
        const isApprove = status === "ok";
        
        // Админ "Зөвшөөрөх" дарах үед цагийг шалгах logic
        if (isApprove) {
          const res = await callFirestore('GET', `/requests/${targetId}`);
          if (res.fields && res.fields.createdAt) {
            const createdAt = parseInt(res.fields.createdAt.integerValue);
            const diffMinutes = (Date.now() - createdAt) / 1000 / 60;

            if (diffMinutes > 2) {
              // 2 минут өнгөрсөн бол автоматаар татгалзсан хариу илгээх
              await callTelegram('sendMessage', {
                chat_id: userId,
                text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой"
              });
              await callTelegram('editMessageText', {
                chat_id: ADMIN_ID,
                message_id: cb.message.message_id,
                text: `⚠️ ХУГАЦАА ДУУССАН (2 мин хэтэрсэн):\nID: ${targetId}`
              });
              return { statusCode: 200 };
            }
          }
        }

        const finalStatus = isApprove ? "✅ ЗӨВШӨӨРӨГДӨВ" : "❌ ТАТГАЛЗАВ";
        const msg = isApprove ? `Таны ${targetId} ID-тай хүсэлтийг админ зөвшөөрлөө.` : "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой";

        await callTelegram('sendMessage', { chat_id: userId, text: msg });
        await callTelegram('editMessageText', {
          chat_id: ADMIN_ID,
          message_id: cb.message.message_id,
          text: `🏁 ШИЙДВЕРЛЭГДЭВ:\nID: ${targetId}\nТөлөв: ${finalStatus}`
        });
      }
      return { statusCode: 200 };
    }

    // Бусад логик (Start, Withdraw г.м) өмнөх хэвээрээ байна...
    // [Текст мессеж болон бусад хэсгийг энд үлдээх]
    
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};    if (update.message && update.message.text) {
      const text = update.message.text.trim();

      if (text === "/start") {
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? EEGII AUTOMAT 24/7\n\nДанс солигдох тул заавал шалгаж шилжүүлээрэй!",
          reply_markup: {
            inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]]
          }
        });
      } 
      // ТАТАХ ЛОГИК (ID + CODE)
      else if (text.includes(" ") && text.split(" ")[0].length >= 7) {
        const [mId, wCode] = text.split(" ");
        await callFirestore('PATCH', `/user_states/${chatId}?updateMask.fieldPaths=data`, {
          fields: { data: { stringValue: `withdraw_${mId}_${wCode}` } }
        });
        await callTelegram('sendMessage', { 
          chat_id: chatId, 
          text: "🏦 Одоо татах мөнгөө хүлээн авах ДАНСНЫ МЭДЭЭЛЛЭЭ бичнэ үү:\n\n⚠️ ЗААВАЛ IBAN (MN...) тай цуг бичнэ шүү!" 
        });
      }
      // ЦЭНЭГЛЭХ ID
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const searchRes = await callFirestore('GET', '/requests');
        let trxCode = "";
        const existing = (searchRes.documents || []).find(d => d.fields.gameId && d.fields.gameId.stringValue === text);
        
        if (existing) { trxCode = existing.fields.trxCode.stringValue; } 
        else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          await callFirestore('POST', '/requests', { fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } } });
        }
        await callTelegram('sendMessage', {
          chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Утга: ${trxCode}`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
      // ДАНСНЫ МЭДЭЭЛЭЛ (MN... эсвэл 16+ оронтой тоо)
      else if (text.toUpperCase().includes("MN") || (text.replace(/\D/g, '').length >= 15)) {
        const stateRes = await callFirestore('GET', `/user_states/${chatId}`);
        if (stateRes.fields && stateRes.fields.data.stringValue.startsWith("withdraw_")) {
          const [_, mId, wCode] = stateRes.fields.data.stringValue.split("_");
          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Хүсэлт бүртгэгдлээ. Түр хүлээнэ үү." });
          
          // Админд Татах хүсэлтийг товчлууртай илгээх
          await callTelegram('sendMessage', {
            chat_id: ADMIN_ID,
            text: `⚠️ ТАТАХ ХҮСЭЛТ!\n🆔 ID: ${mId}\n🔑 Код: ${wCode}\n🏦 Данс: ${text}\n👤 User: @${update.message.from.username || 'байхгүй'}`,
            reply_markup: {
              inline_keyboard: [[
                { text: "✅ Зөвшөөрөх", callback_data: `adm_ok_wit_${chatId}_${mId}` },
                { text: "❌ Татгалзах", callback_data: `adm_no_wit_${chatId}_${mId}` }
              ]]
            }
          });
          await callFirestore('DELETE', `/user_states/${chatId}`);
        }
      }
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

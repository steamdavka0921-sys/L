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
    
    // --- 1. ТЕКСТ МЕССЕЖ ШАЛГАХ (/start энд байна) ---
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        return await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? EEGII AUTOMAT 24/7\n\nДанс солигдох тул заавал шалгаж шилжүүлээрэй!",
          reply_markup: {
            inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }]]
          }
        });
      } 
      
      // Татах логик
      if (text.includes(" ") && text.split(" ")[0].length >= 7) {
        const [mId, wCode] = text.split(" ");
        await callFirestore('PATCH', `/user_states/${chatId}?updateMask.fieldPaths=data`, {
          fields: { data: { stringValue: `withdraw_${mId}_${wCode}` } }
        });
        return await callTelegram('sendMessage', { chat_id: chatId, text: "🏦 Одоо татах мөнгөө хүлээн авах ДАНС-аа бичнэ үү:\n\n⚠️ ЗААВАЛ IBAN (MN...) тай цуг бичнэ шүү!" });
      }

      // Цэнэглэх ID шалгах
      if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const searchRes = await callFirestore('GET', '/requests');
        let trxCode = "";
        const existing = (searchRes.documents || []).find(d => d.fields.gameId && d.fields.gameId.stringValue === text);
        
        if (existing) {
          trxCode = existing.fields.trxCode.stringValue;
        } else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          await callFirestore('POST', '/requests', { fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } } });
        }
        
        return await callTelegram('sendMessage', {
          chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Утга: ${trxCode}`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }

      // Данс хүлээн авах
      if (text.toUpperCase().includes("MN") || (text.replace(/\D/g, '').length >= 15)) {
        const stateRes = await callFirestore('GET', `/user_states/${chatId}`);
        if (stateRes.fields && stateRes.fields.data.stringValue.startsWith("withdraw_")) {
          const [_, mId, wCode] = stateRes.fields.data.stringValue.split("_");
          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Шалгажбайна. Түр хүлээнэ үү." });
          
          const requestId = `wit_${chatId}_${Date.now()}`;
          await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: "pending" } } });

          await callTelegram('sendMessage', {
            chat_id: ADMIN_ID,
            text: `⚠️ ТАТАХ ХҮСЭЛТ!\n🆔 ID: ${mId}\n🔑 Код: ${wCode}\n🏦 Данс: ${text}\n👤 User: @${update.message.from.username || 'байхгүй'}`,
            reply_markup: {
              inline_keyboard: [[
                { text: "✅ Зөвшөөрөх", callback_data: `adm_ok_wit_${chatId}_${mId}_${requestId}` },
                { text: "❌ Татгалзах", callback_data: `adm_no_wit_${chatId}_${mId}_${requestId}` }
              ]]
            }
          });

          // 2 минутын таймер
          setTimeout(async () => {
            const check = await callFirestore('GET', `/active_requests/${requestId}`);
            if (check.fields && check.fields.status.stringValue === "pending") {
              await callTelegram('sendMessage', { chat_id: chatId, text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой" });
              await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: "expired" } } });
            }
          }, 120000);

          await callFirestore('DELETE', `/user_states/${chatId}`);
          return { statusCode: 200 };
        }
      }
    }

    // --- 2. CALLBACK QUERY ШАЛГАХ ---
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const data = cb.data;

      if (data === "menu_deposit") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💰 Та MELBET ID-гаа бичиж илгээнэ үү:" });
      } 
      else if (data === "menu_withdraw") {
        await callTelegram('sendMessage', { chat_id: chatId, text: "💳 Татах хүсэлт:\n\nТа MELBET ID болон Таталтын кодоо хамт бичнэ үү.\nЖишээ нь: 984210857 XUFD" });
      }
      else if (data.startsWith("paid_")) {
        const [_, gId, tCode] = data.split("_");
        const requestId = `dep_${chatId}_${Date.now()}`;
        
        await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: "pending" } } });
        await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Шалгажбайна. Түр хүлээнэ үү." });

        await callTelegram('sendMessage', { 
          chat_id: ADMIN_ID, 
          text: `🔔 ЦЭНЭГЛЭХ ХҮСЭЛТ!\n🆔 ID: ${gId}\n📌 Код: ${tCode}\n👤 User: @${cb.from.username || 'unknown'}`,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Зөвшөөрөх", callback_data: `adm_ok_dep_${chatId}_${gId}_${requestId}` },
              { text: "❌ Татгалзах", callback_data: `adm_no_dep_${chatId}_${gId}_${requestId}` }
            ]]
          }
        });

        setTimeout(async () => {
          const check = await callFirestore('GET', `/active_requests/${requestId}`);
          if (check.fields && check.fields.status.stringValue === "pending") {
            await callTelegram('sendMessage', { chat_id: chatId, text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой" });
            await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: "expired" } } });
          }
        }, 120000);
      }
      else if (data.startsWith("adm_")) {
        const [_, status, type, userId, targetId, requestId] = data.split("_");
        const check = await callFirestore('GET', `/active_requests/${requestId}`);
        
        if (check.fields && check.fields.status.stringValue === "pending") {
          await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, { fields: { status: { stringValue: "completed" } } });
          const finalStatus = (status === "ok") ? "✅ ЗӨВШӨӨРӨГДӨВ" : "❌ ТАТГАЛЗАВ";
          await callTelegram('sendMessage', { chat_id: userId, text: `📣 МЭДЭГДЭЛ:\nТаны ${targetId} ID-тай хүсэлтийг админ ${finalStatus} болголоо.` });
          await callTelegram('editMessageText', {
            chat_id: ADMIN_ID, message_id: cb.message.message_id,
            text: `🏁 ШИЙДВЕРЛЭГДЭВ:\nID: ${targetId}\nТөлөв: ${finalStatus}`
          });
        } else {
          await callTelegram('answerCallbackQuery', { callback_query_id: cb.id, text: "⚠️ Хугацаа дууссан эсвэл шийдэгдсэн байна!", show_alert: true });
        }
      }
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
    }
  } catch (err) { console.error("АЛДАА:", err); }
  return { statusCode: 200, body: "OK" };
};        const [_, status, type, userId, targetId, requestId] = data.split("_");
        
        // Firestore-оос шалгах: Хэрэв аль хэдийн 2 минут өнгөрөөд "expired" болсон бол юу ч хийхгүй
        const check = await callFirestore('GET', `/active_requests/${requestId}`);
        if (check.fields && check.fields.status.stringValue === "expired") {
            await callTelegram('answerCallbackQuery', { callback_query_id: cb.id, text: "⚠️ 2 минут өнгөрсөн тул систем татгалзсан хариу илгээсэн байна!", show_alert: true });
            return { statusCode: 200 };
        }

        // Хэрэв амжсан бол төлөвийг нь "completed" болгоод хэрэглэгчид хариу явуулна
        await callFirestore('PATCH', `/active_requests/${requestId}?updateMask.fieldPaths=status`, {
          fields: { status: { stringValue: "completed" } }
        });

        const finalStatus = (status === "ok") ? "✅ ЗӨВШӨӨРӨГДӨВ" : "❌ ТАТГАЛЗАВ";
        await callTelegram('sendMessage', { chat_id: userId, text: `📣 МЭДЭГДЭЛ:\nТаны ${targetId} ID-тай хүсэлтийг админ ${finalStatus} болголоо.` });
        
        await callTelegram('editMessageText', {
          chat_id: ADMIN_ID, message_id: cb.message.message_id,
          text: `🏁 ШИЙДВЕРЛЭГДЭВ:\nID: ${targetId}\nТөлөв: ${finalStatus}`
        });
      }
      await callTelegram('answerCallbackQuery', { callback_query_id: cb.id });
    }
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
      else if (text.includes(" ") && text.split(" ")[0].length >= 7) {
        const [mId, wCode] = text.split(" ");
        await callFirestore('PATCH', `/user_states/${chatId}?updateMask.fieldPaths=data`, {
          fields: { data: { stringValue: `withdraw_${mId}_${wCode}` } }
        });
        await callTelegram('sendMessage', { chat_id: chatId, text: "🏦 Одоо татах мөнгөө хүлээн авах ДАНС-аа бичнэ үү:\n\n⚠️ ЗААВАЛ IBAN (MN...) тай цуг бичнэ шүү!" });
      }
      else if (!isNaN(text.replace(/\s/g, '')) && text.length >= 7 && text.length < 15) {
        const searchRes = await callFirestore('GET', '/requests');
        let trxCode = "";
        const existing = (searchRes.documents || []).find(d => d.fields.gameId && d.fields.gameId.stringValue === text);
        
        if (existing) {
          trxCode = existing.fields.trxCode.stringValue;
        } else {
          const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
          for (let i = 0; i < 5; i++) trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
          await callFirestore('POST', '/requests', { fields: { gameId: { stringValue: text }, trxCode: { stringValue: trxCode } } });
        }
        
        await callTelegram('sendMessage', {
          chat_id: chatId, text: `🏦 Данс: MN370050099105952353\n🏦 MONPAY: ДАВААСҮРЭН\n\n📌 Утга: ${trxCode}`,
          reply_markup: { inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]] }
        });
      }
      else if (text.toUpperCase().includes("MN") || (text.replace(/\D/g, '').length >= 15)) {
        const stateRes = await callFirestore('GET', `/user_states/${chatId}`);
        if (stateRes.fields && stateRes.fields.data.stringValue.startsWith("withdraw_")) {
          const [_, mId, wCode] = stateRes.fields.data.stringValue.split("_");
          
          // --- ӨӨРЧЛӨЛТ: Текст солих ---
          await callTelegram('sendMessage', { chat_id: chatId, text: "✅ Шалгажбайна. Түр хүлээнэ үү." });
          
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

          // --- ЛОГИК: 2 минутын таймер ---
          setTimeout(async () => {
             await callTelegram('sendMessage', { 
               chat_id: chatId, 
               text: "Уучлаарай ийм гүйлгээ олдсонгүй Магадгүй тань тусламж хэрэгтэй бол @Eegiimn тэй холбогдоорой" 
             });
          }, 120000);

          await callFirestore('DELETE', `/user_states/${chatId}`);
        }
      }
    }
  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

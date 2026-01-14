const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;
  const API_KEY = process.env.FIREBASE_API_KEY;
  const BOT_USERNAME = "Таны_Ботны_Нэр_Бот"; // Энд ботныхоо username-г бичээрэй

  const WITHDRAW_PHOTO = "https://res.cloudinary.com/dpdsuhwa9/image/upload/v1767338251/fljqkzsqe4rtkhijsdsq.jpg";
  const LOADING_GIF = "https://res.cloudinary.com/dpdsuhwa9/image/upload/v1767404699/zzxmv9nclwgk5jw259na.gif";

  // Telegram ба Firestore туслах функцууд (Өмнөхтэй адил)
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

    // --- CALLBACK QUERY ХЭСЭГ ---
    if (cb) {
      const data = cb.data;

      if (data === "menu_invite") {
        const inviteLink = `https://t.me/${BOT_USERNAME}?start=${chatId}`;
        const userRes = await callFirestore('GET', `/users/${chatId}`);
        const bonus = (userRes.fields && userRes.fields.bonusBalance) ? userRes.fields.bonusBalance.doubleValue : 0;
        
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: `🎁 Найзыгаа уриад цэнэглэлт бүрийнх нь 3%-ийг аваарай!\n\n🔗 Таны урилгын линк:\n${inviteLink}\n\n💰 Таны бонус баланс: ${bonus}₮`
        });
      }
      
      else if (data.startsWith("adm_ok_dep_")) {
        const [_, status, type, userId, targetId] = data.split("_");
        // Админ зөвшөөрөх үед бонус бодох хэсэг
        const res = await callFirestore('GET', `/requests/${targetId}`);
        const amount = 10000; // Жишээ нь 10к, та үүнийг утгаас нь авч болно

        // 1. Хэрэглэгчийг хэн урьсныг шалгах
        const userRes = await callFirestore('GET', `/users/${userId}`);
        if (userRes.fields && userRes.fields.invitedBy) {
          const inviterId = userRes.fields.invitedBy.stringValue;
          const bonusAmt = amount * 0.03; // 3% бонус

          // 2. Урьсан хүний балансыг шинэчлэх
          const inviterRes = await callFirestore('GET', `/users/${inviterId}`);
          const currentBonus = (inviterRes.fields && inviterRes.fields.bonusBalance) ? inviterRes.fields.bonusBalance.doubleValue : 0;
          
          await callFirestore('PATCH', `/users/${inviterId}?updateMask.fieldPaths=bonusBalance`, {
            fields: { bonusBalance: { doubleValue: currentBonus + bonusAmt } }
          });

          // 3. Урьсан хүнд мэдэгдэл хүргэх
          await callTelegram('sendMessage', {
            chat_id: inviterId,
            text: `🎊 Таны урьсан найз цэнэглэлт хийлээ! Танд ${bonusAmt}₮ бонус орлоо.`
          });
        }
        // ... (Бусад цэнэглэлт баталгаажуулах код)
      }
      // ... (Бусад callback логикууд)
    }

    // --- MESSAGE ХЭСЭГ ---
    if (msg && msg.text) {
      const text = msg.text.trim();

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        // Хэрэв линкээр орж ирсэн бол (Жишээ нь: /start 12345)
        if (parts.length > 1) {
          const inviterId = parts[1];
          if (inviterId !== chatId.toString()) { // Өөрийгөө урихаас сэргийлэх
            await callFirestore('PATCH', `/users/${chatId}?updateMask.fieldPaths=invitedBy`, {
              fields: { invitedBy: { stringValue: inviterId } }
            });
          }
        }

        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: "Сайн байна уу? EEGII AUTOMAT 24/7\n\nНайзыгаа уриад 3% бонус аваарай!",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💰 Цэнэглэх", callback_data: "menu_deposit" }, { text: "💳 Татах", callback_data: "menu_withdraw" }],
              [{ text: "🎁 Найзаа урих / Бонус", callback_data: "menu_invite" }]
            ]
          }
        });
      }
      // ... (ID шалгах, бусад мессеж боловсруулах хэсэг)
    }

  } catch (err) { console.error(err); }
  return { statusCode: 200, body: "OK" };
};

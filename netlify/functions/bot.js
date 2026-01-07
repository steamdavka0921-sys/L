const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;
  const API_KEY = process.env.FIREBASE_API_KEY; 
  
  // Түр зогсолтын үед харагдах мессеж
  const MAINTENANCE_MSG = "⚠️ Уучлаарай, системд техникийн засвар хийгдэж байгаа тул түр хугацаагаар ажиллахгүй байна. Тун удахгүй эргэн ирэх болно. Баярлалаа! 🛠️";

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

  try {
    const update = JSON.parse(event.body);
    const chatId = update.message ? update.message.chat.id : (update.callback_query ? update.callback_query.message.chat.id : null);
    if (!chatId) return { statusCode: 200 };

    // 1. Хэрэв товчлуур дарвал (Callback query)
    if (update.callback_query) {
      await callTelegram('answerCallbackQuery', { 
        callback_query_id: update.callback_query.id, 
        text: "Засвартай байгаа тул түр хүлээгээрэй.", 
        show_alert: false 
      });
      await callTelegram('sendMessage', { 
        chat_id: chatId, 
        text: MAINTENANCE_MSG 
      });
      return { statusCode: 200 };
    }

    // 2. Хэрэв мессеж бичвэл (Start эсвэл бусад текст)
    if (update.message && update.message.text) {
      await callTelegram('sendMessage', {
        chat_id: chatId, 
        text: MAINTENANCE_MSG
      });
    }

  } catch (err) { 
    console.error("Алдаа гарлаа:", err); 
  }

  return { statusCode: 200, body: "OK" };
};

const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;

  // Мессеж илгээх функц
  const sendMessage = (chatId, text, replyMarkup = null) => {
    const payload = {
      chat_id: chatId,
      text: text
    };
    if (replyMarkup) {
      payload.reply_markup = JSON.stringify(replyMarkup);
    }

    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => resolve());
      req.write(data);
      req.end();
    });
  };

  try {
    // Хэрэглэгч /start дарахад
    if (update.message && update.message.text === "/start") {
      const keyboard = {
        inline_keyboard: [[
          { text: "💰 Цэнэглэх", callback_data: "recharge_now" }
        ]]
      };
      await sendMessage(update.message.chat.id, "Сайн байна уу? Доорх товчийг дарж хүсэлтээ илгээнэ үү:", keyboard);
    }

    // Товчлуур дарахад (Callback query)
    if (update.callback_query) {
      const user = update.callback_query.from;
      const callbackData = update.callback_query.data;

      if (callbackData === "recharge_now") {
        // Админд мэдэгдэл илгээх
        await sendMessage(ADMIN_ID, `🔔 ШИНЭ ХҮСЭЛТ:\n\nХэрэглэгч: ${user.first_name}\nID: ${user.id}\nUsername: @${user.username || 'байхгүй'}`);
        
        // Хэрэглэгчид хариу өгөх
        await sendMessage(user.id, "✅ Таны хүсэлтийг хүлээн авлаа. Түр хүлээнэ үү.");
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};

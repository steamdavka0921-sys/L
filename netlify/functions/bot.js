const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "Method Not Allowed" };
  const update = JSON.parse(event.body);
  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;

  const sendMessage = (chatId, text, markup = null) => {
    const data = JSON.stringify({ chat_id: chatId, text: text, reply_markup: markup });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    return new Promise((resolve) => {
      const req = https.request(options);
      req.write(data);
      req.end(() => resolve());
    });
  };

  try {
    if (update.message?.text === "/start") {
      await sendMessage(update.message.chat.id, "💰 Цэнэглэх товчийг дарна уу.", {
        inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "recharge" }]]
      });
    }
    if (update.callback_query?.data === "recharge") {
      await sendMessage(ADMIN_ID, `🔔 МЭДЭГДЭЛ: @${update.callback_query.from.username || 'user'} цэнэглэх хүсэлт гаргалаа!`);
    }
  } catch (e) { console.error(e); }
  return { statusCode: 200, body: "ok" };
};

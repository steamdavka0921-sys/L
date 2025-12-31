const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 200, body: "Invalid JSON" };
  }

  const TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_CHAT_ID;
  const FIREBASE_ID = process.env.FIREBASE_PROJECT_ID;

  // Telegram-руу мессеж илгээх функц
  const sendMessage = (chatId, text, replyMarkup = null) => {
    const payload = { chat_id: chatId, text: text };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    const data = JSON.stringify(payload);

    return new Promise((resolve) => {
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
      const req = https.request(options, (res) => resolve());
      req.on('error', (e) => resolve());
      req.write(data);
      req.end();
    });
  };

  try {
    // A. ТОГЧЛУУР ДАРАХ ҮЙЛДЭЛ (Callback Query)
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;
      const user = update.callback_query.from;

      if (callbackData === "ask_id") {
        await sendMessage(chatId, "Та MELBET ID-гаа бичиж илгээнэ үү:");
      } 
      
      if (callbackData.startsWith("paid_")) {
        const parts = callbackData.split("_");
        const mId = parts[1];
        const code = parts[2];

        await sendMessage(chatId, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");
        
        // АДМИН-РУУ МЭДЭГДЭЛ ИЛГЭЭХ
        const adminMsg = `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n🆔 MELBET ID: ${mId}\n📌 Код: ${code}\n👤 Хэрэглэгч: @${user.username || 'байхгүй'}\n📞 Нэр: ${user.first_name}`;
        await sendMessage(ADMIN_ID, adminMsg);
      }
      return { statusCode: 200, body: "ok" };
    }

    // B. МЕССЕЖ ИРЭХ ҮЙЛДЭЛ
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === "/start") {
        await sendMessage(chatId, "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.", {
          inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
        });
      } else {
        // Хэрэглэгч ID бичсэн үед гүйлгээний утга үүсгэх (1, I, 0, O хассан)
        const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        let trxCode = "";
        for (let i = 0; i < 5; i++) {
          trxCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл (утасны дугаар, ID гэх мэт) бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text.trim()}_${trxCode}` }]]
        });
      }
    }
  } catch (err) {
    console.error("Error in handler:", err);
  }

  return { statusCode: 200, body: "ok" };
};

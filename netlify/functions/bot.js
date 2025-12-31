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
    // 1. Товчлуур дарах үйлдэл (Callback Query)
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const chatId = update.callback_query.message.chat.id;

      if (callbackData === "ask_id") {
        await sendMessage(chatId, "Та MELBET ID-гаа бичиж илгээнэ үү:");
      } 
      
      if (callbackData.startsWith("paid_")) {
        const parts = callbackData.split("_");
        await sendMessage(chatId, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");
        await sendMessage(ADMIN_ID, `💰 ТӨЛБӨР ТӨЛӨВДӨВ!\nID: ${parts[1]}\nКод: ${parts[2]}\nUser: @${update.callback_query.from.username || 'байхгүй'}`);
      }
      return { statusCode: 200, body: "ok" };
    }

    // 2. Мессеж бичих үйлдэл
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === "/start") {
        await sendMessage(chatId, "Сайн байна уу? Доорх товчийг дарж үйлчилгээгээ авна уу.", {
          inline_keyboard: [[{ text: "💰 Цэнэглэх", callback_data: "ask_id" }]]
        });
      } else {
        // ID бичсэн гэж үзэх
        const trxCode = Math.random().toString(36).substring(2, 7).toUpperCase().replace(/[0O1I]/g, 'X');
        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${text}_${trxCode}` }]]
        });
      }
    }
  } catch (err) {
    console.error(err);
  }

  return { statusCode: 200, body: "ok" };
};          }, saveData);
        }

        const paymentMsg = `Нийт төлөх дүн: (Та дүнгээ өөрөө шийднэ үү)\n\n🏦 Данс: MN370050099105952353\n🏦 МОБИФИНАНС MONPAY: ДАВААСҮРЭН\n\n📌 Гүйлгээний утга: ${trxCode}\n\n⚠️ АНХААР АНХААР:\nГүйлгээний утга дээр зөвхөн ${trxCode} кодыг бичнэ үү. Өөр зүйл бичвэл ДЭПО орохгүй!\n\nДанс солигдох тул асууж хийгээрэй 🤗`;

        await sendMessage(chatId, paymentMsg, {
          inline_keyboard: [[{ text: "✅ Төлбөр төлсөн", callback_data: `paid_${melbetId}_${trxCode}` }]]
        });
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};      });
    }

    // 3. "Төлбөр төлсөн" товч дарахад
    if (callbackQuery?.data.startsWith("paid_")) {
      const info = callbackQuery.data.split("_");
      const mId = info[1];
      const code = info[2];
      const user = callbackQuery.from;

      // Хэрэглэгчид хариу өгөх
      await sendMessage(user.id, "✅ Баярлалаа. Таны төлбөрийг админ шалгаж байна. Түр хүлээнэ үү.");

      // Админд мэдэгдэл илгээх
      const adminMsg = `💰 ТӨЛБӨР ТӨЛӨГДӨВ!\n\n` +
        `🆔 MELBET ID: ${mId}\n` +
        `📌 Код: ${code}\n` +
        `👤 Хэрэглэгч: @${user.username || 'username байхгүй'}\n` +
        `📞 Нэр: ${user.first_name}`;

      await sendMessage(ADMIN_ID, adminMsg);
    }

  } catch (error) {
    console.error("Error:", error);
  }

  return { statusCode: 200, body: "ok" };
};

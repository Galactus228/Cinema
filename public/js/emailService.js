const nodemailer = require('nodemailer');

// Настройка транспорта (на примере Gmail)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true для порта 465
    auth: {
        user: 'endik23082005@gmail.com', // Твоя почта
        pass: 'gbgvdxfvauhhiqkq'     // Пароль приложения (не обычный пароль!)
    }
});

async function sendTicketEmail(userEmail, ticketData) {
    const { title, date, row, seat, price } = ticketData;

    const mailOptions = {
        from: '"КиноДиплом" <your-email@gmail.com>',
        to: userEmail,
        subject: `Ваш билет на фильм: ${title}`,
        html: `
            <div style="background-color: #1a1a1a; color: #ffffff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; border-radius: 10px; max-width: 600px; margin: auto; border: 1px solid #333;">
            
            <h1 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 10px; text-transform: uppercase; font-size: 24px;">
                🎬 Электронный билет
            </h1>
            
            <p style="font-size: 16px; margin-top: 20px;">
                Спасибо за покупку! Ждем вас в нашем кинотеатре.
            </p>
            
            <div style="background-color: #262626; padding: 20px; border-radius: 8px; margin-top: 20px; line-height: 1.6;">
                <p style="margin: 5px 0;"><strong style="color: #007bff;">Фильм:</strong> ${ticketData.title}</p>
                <p style="margin: 5px 0;"><strong style="color: #007bff;">Дата и время:</strong> ${ticketData.date}</p>
                <p style="margin: 5px 0;">
                    <strong style="color: #007bff;">Ряд:</strong> ${ticketData.row} | 
                    <strong style="color: #007bff;">Место:</strong> ${ticketData.seat}
                </p>
                <p style="margin: 5px 0;"><strong style="color: #007bff;">Стоимость:</strong> ${ticketData.price} руб.</p>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; border: 1px dashed #555; text-align: center; color: #888; font-size: 14px;">
                Покажите это письмо контроллеру при входе в зал.
            </div>
            
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #555;">
                &copy; 2026. Все права защищены. Дипломный проект.
            </div>
        </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Билет успешно отправлен на ${userEmail}`);
    } catch (error) {
        console.error('Ошибка при отправке почты:', error);
    }
}

module.exports = { sendTicketEmail };
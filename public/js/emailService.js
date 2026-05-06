const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'endik23082005@gmail.com', 
        pass: 'gbgvdxfvauhhiqkq'     
    }
});

async function sendTicketEmail(userEmail, ticketData, paymentData) {
    // ticketData: { title, date, row, seat, price }
    // paymentData: { id, card_last_four, amount }

    const mailOptions = {
        from: '"КиноДиплом" <endik23082005@gmail.com>',
        to: userEmail,
        subject: `Ваш билет и чек: ${ticketData.title}`,
        html: `
        <div style="background-color: #f4f4f4; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- БЛОК С БИЛЕТОМ -->
            <div style="background-color: #1a1a1a; color: #ffffff; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto 20px auto; border: 1px solid #333;">
                <h1 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 10px; text-transform: uppercase; font-size: 24px; margin-top: 0;">
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
            </div>

            <!-- БЛОК С ЧЕКОМ (ТЕПЕРЬ С ФИКСИРОВАННОЙ ШИРИНОЙ) -->
            <div style="background-color: #ffffff; color: #000000; padding: 30px; border: 1px solid #000; font-family: 'Courier New', Courier, monospace; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px; text-transform: uppercase;">
                        ФИЛЬМ: ${ticketData.title}
                    </h3>
                    <p style="font-size: 12px; margin: 10px 0 0 0;">ООО "КИНОДИПЛОМ"</p>
                </div>

                <div style="font-size: 14px; line-height: 1.8;">
                    <p style="margin: 5px 0;">ЧЕК №: ${paymentData.id}</p>
                    <p style="margin: 5px 0;">ДАТА: ${new Date().toLocaleString('ru-RU')}</p>
                    <p style="margin: 5px 0;">КАРТА: **** ${paymentData.card_last_four}</p>
                    <p style="margin: 5px 0;">ВЛАДЕЛЕЦ: ${paymentData.card_holder || 'Клиент'}</p>
                    
                    <div style="margin-top: 15px; border-top: 2px dashed #000; padding-top: 10px; font-weight: bold; font-size: 20px; display: flex; justify-content: space-between;">
                        <span>ИТОГО:</span>
                        <span style="float: right;">${paymentData.amount}.00 ₽</span>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #666;">
                    ЭЛЕКТРОННЫЙ ДОКУМЕНТ
                </div>
                
            </div>
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #777;">
                &copy; 2026. Дипломный проект.
            </div>
        </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Билет и чек успешно отправлены на ${userEmail}`);
    } catch (error) {
        console.error('Ошибка при отправке почты:', error);
    }
}

module.exports = { sendTicketEmail };